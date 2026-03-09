import React, { useState, useEffect, useCallback } from 'react';
import type { BrandPreset, CharacterProfile } from '../../types';
import { createCharacter, updateCharacter, deleteCharacter, listCharacters, generateReferenceSheet } from '../../services/characterService';

function base64ToBlobUrl(dataUrl: string): string {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch { return dataUrl; }
}
import { designCharacterVoice } from '../../services/elevenLabsService';

interface Step3Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

type ImageType = 'mascot' | 'photo' | 'sketch';
type CharRole = 'main' | 'supporting' | 'extra';

// API may return `type` instead of `image_type`
type CharacterProfileWithApiType = CharacterProfile & { type?: string };

const IMAGE_TYPE_OPTIONS: { value: ImageType; label: string }[] = [
  { value: 'mascot', label: '완성된 마스코트' },
  { value: 'photo', label: '실사 사진' },
  { value: 'sketch', label: '러프 스케치' },
];

const ROLE_OPTIONS: { value: CharRole; label: string }[] = [
  { value: 'main', label: '메인' },
  { value: 'supporting', label: '서포팅' },
  { value: 'extra', label: '엑스트라' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const ROLE_BADGE_COLORS: Record<CharRole, string> = {
  main: '#06b6d4',
  supporting: '#8b5cf6',
  extra: '#64748b',
};

interface VoiceVariant {
  voice_id: string;
  preview_url: string;
  name: string;
}

interface NewCharForm {
  name: string;
  image_type: ImageType;
  char_role: CharRole;
  species: string;
  personality: string;
  distinction_tags: string;
  imageDataUrl: string;
  voice_description: string;
  voice_variants: VoiceVariant[];
  selected_voice_id: string;
  voiceLoading: boolean;
}

const emptyForm: NewCharForm = {
  name: '',
  image_type: 'mascot',
  char_role: 'main',
  species: '',
  personality: '',
  distinction_tags: '',
  imageDataUrl: '',
  voice_description: '',
  voice_variants: [],
  selected_voice_id: '',
  voiceLoading: false,
};

export default function Step3Characters({ data, onUpdate, presetId }: Step3Props) {
  const [characters, setCharacters] = useState<CharacterProfile[]>(
    data.character_profiles || []
  );
  const [showForm, setShowForm] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [form, setForm] = useState<NewCharForm>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [sheetLoading, setSheetLoading] = useState<Record<string, boolean>>({});
  const [sheetImages, setSheetImages] = useState<Record<string, Record<string, string>>>({});
  const [expandedChar, setExpandedChar] = useState<string | null>(null);

  const syncCharacters = useCallback(
    (chars: CharacterProfile[]) => {
      setCharacters(chars);
      // Sync to parent, but strip large base64 data to avoid 413 errors
      onUpdate({
        character_profiles: chars.map(c => ({
          id: c.id,
          name: c.name,
          char_role: c.char_role || 'main',
          image_type: c.image_type || (c as CharacterProfileWithApiType).type || 'mascot',
          species: c.species,
          personality: c.personality || '',
          appearance: c.appearance || { base_prompt: '', expression_range: [] },
          distinction_tags: c.distinction_tags || [],
          reference_sheet: {
            original_upload: c.reference_sheet?.original_upload?.startsWith?.('data:') ? '[uploaded]' : c.reference_sheet?.original_upload,
            multi_angle: {
              front: c.reference_sheet?.multi_angle?.front ? '[generated]' : undefined,
              angle_45: c.reference_sheet?.multi_angle?.angle_45 ? '[generated]' : undefined,
              side: c.reference_sheet?.multi_angle?.side ? '[generated]' : undefined,
              full_body: c.reference_sheet?.multi_angle?.full_body ? '[generated]' : undefined,
            },
          },
          voice_id: c.voice_id,
        })) as CharacterProfile[],
      });
    },
    [onUpdate]
  );

  // Load characters from API when component mounts or presetId changes
  // Always fetch from DB as source of truth, not from wizardData
  useEffect(() => {
    if (!presetId) return;
    let cancelled = false;
    listCharacters(presetId)
      .then((chars) => {
        if (!cancelled) {
          // Map API field names: API returns `type`, component uses `image_type`
          const mapped = chars.map((c: any) => ({
            ...c,
            image_type: c.image_type || c.type || 'mascot',
          }));
          syncCharacters(mapped);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, imageDataUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !presetId) return;
    setSubmitting(true);
    try {
      const charData: Record<string, unknown> = {
        brand_preset_id: presetId,
        name: form.name.trim(),
        type: form.image_type,       // DB column is `type`
        image_type: form.image_type,  // Also send for backward compat
        char_role: form.char_role,
        species: form.species.trim() || undefined,
        personality: form.personality.trim(),
        distinction_tags: form.distinction_tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        // Send image via original_upload_url (DB column) AND reference_sheet
        original_upload_url: form.imageDataUrl || undefined,
        reference_sheet: {
          original_upload: form.imageDataUrl || undefined,
          multi_angle: {},
        },
        voice_id: form.selected_voice_id || undefined,
      };
      if (editingCharId) {
        // Update existing character — strip base64 image to avoid 413
        const updateData = { ...charData } as Record<string, any>;
        delete updateData.brand_preset_id;
        if (updateData.reference_sheet?.original_upload?.startsWith('data:')) {
          delete updateData.reference_sheet;  // Don't re-upload existing image
          delete updateData.original_upload_url;  // Don't re-upload
        }
        const updated = await updateCharacter(editingCharId, updateData);
        const mappedUpdated = { ...updated, image_type: (updated.image_type || (updated as CharacterProfileWithApiType).type || form.image_type) as ImageType };
        syncCharacters(characters.map(c => c.id === editingCharId ? mappedUpdated : c));
      } else {
        // Create new character
        const created = await createCharacter(charData);
        const mappedCreated = { ...created, image_type: (created.image_type || (created as CharacterProfileWithApiType).type || form.image_type) as ImageType };
        syncCharacters([...characters, mappedCreated]);
      }
      setForm({ ...emptyForm });
      setEditingCharId(null);
      setShowForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '캐릭터 저장에 실패했습니다';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateSheet = async (charId: string) => {
    setSheetLoading((prev) => ({ ...prev, [charId]: true }));
    try {
      const result = await generateReferenceSheet(charId, presetId);
      setSheetImages((prev) => ({ ...prev, [charId]: result.multi_angle }));
    } catch {
      // error handled silently — UI shows loading state reset
    } finally {
      setSheetLoading((prev) => ({ ...prev, [charId]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('캐릭터를 삭제하시겠습니까?')) return;
    try {
      await deleteCharacter(id);
      syncCharacters(characters.filter((c) => c.id !== id));
      if (expandedChar === id) setExpandedChar(null);
    } catch {
      // error handled silently — delete failed, list unchanged
    }
  };

  const handleEditChar = (char: CharacterProfileWithApiType) => {
    if (!char.id) return;
    setEditingCharId(char.id);
    // Get original image from reference_sheet OR original_upload_url column
    const editImage = (char.reference_sheet?.original_upload && char.reference_sheet.original_upload !== '[uploaded]')
      ? char.reference_sheet.original_upload
      : (char as any).original_upload_url || '';
    setForm({
      name: char.name || '',
      image_type: char.image_type || char.type as ImageType || 'mascot',
      char_role: char.char_role || 'main',
      species: char.species || '',
      personality: char.personality || '',
      distinction_tags: (char.distinction_tags || []).join(', '),
      imageDataUrl: editImage,
      voice_description: '',
      voice_variants: [],
      selected_voice_id: char.voice_id || '',
      voiceLoading: false,
    });
    setShowForm(true);
    setExpandedChar(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            캐릭터 등록
          </h2>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            브랜드에 등장할 캐릭터를 등록해주세요.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + 캐릭터 추가
          </button>
        )}
      </div>

      {/* Character Cards */}
      {characters.length > 0 && (
        <div className="flex flex-col gap-3">
          {characters.map((char) => {
            // Check both reference_sheet.original_upload AND original_upload_url DB column
            const originalImage = (char.reference_sheet?.original_upload && char.reference_sheet.original_upload !== '[uploaded]')
              ? char.reference_sheet.original_upload
              : (char as any).original_upload_url || '';
            const hasOriginalUpload = !!originalImage;
            const isSheetLoading = sheetLoading[char.id] || false;
            // Reference sheet may be flat { front, angle_45, ... } or nested { multi_angle: { front, ... } }
            const sheet = char.reference_sheet || {};
            const multiAngle = sheetImages[char.id] || sheet.multi_angle || { front: sheet.front, angle_45: sheet.angle_45, side: sheet.side, full_body: sheet.full_body };
            const hasSheetImages = Object.keys(multiAngle).length > 0 && Object.values(multiAngle).some(Boolean);
            const ANGLE_LABELS: Record<string, string> = {
              front: '정면',
              angle_45: '45도',
              side: '측면',
              full_body: '전신',
            };

            return (
              <div
                key={char.id}
                className="rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: 'var(--bg-surface)',
                  border: expandedChar === char.id ? '1px solid #0891b2' : '1px solid var(--border-subtle)',
                }}
                onClick={() => setExpandedChar(prev => prev === char.id ? null : char.id)}
              >
                <div className="flex items-center gap-4 p-3">
                  {/* Thumbnail */}
                  <div
                    className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    {originalImage ? (
                      <img
                        src={originalImage.startsWith('data:') ? base64ToBlobUrl(originalImage) : originalImage}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 20 }}>?</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {char.name}
                      </span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: `${ROLE_BADGE_COLORS[char.char_role]}20`,
                          color: ROLE_BADGE_COLORS[char.char_role],
                        }}
                      >
                        {ROLE_OPTIONS.find((r) => r.value === char.char_role)?.label}
                      </span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {IMAGE_TYPE_OPTIONS.find((t) => t.value === (char.image_type || (char as CharacterProfileWithApiType).type))?.label}
                      </span>
                    </div>
                    {char.species && (
                      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {char.species}
                      </p>
                    )}
                  </div>

                  {/* Reference Sheet Button — show if has original upload OR already generated */}
                  {(hasOriginalUpload || hasSheetImages) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGenerateSheet(char.id); }}
                      disabled={isSheetLoading}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                      style={{
                        background: isSheetLoading
                          ? 'var(--bg-elevated)'
                          : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        color: isSheetLoading ? 'var(--text-muted)' : '#fff',
                        border: 'none',
                        cursor: isSheetLoading ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isSheetLoading ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          생성 중...
                        </>
                      ) : (
                        <>{hasSheetImages ? '재생성' : '레퍼런스 시트 생성'} <span style={{ opacity: 0.8 }}>(32 크레딧)</span></>
                      )}
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(char.id); }}
                    className="p-1.5 rounded-md hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    title="삭제"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                    </svg>
                  </button>
                </div>

                {/* Expanded details */}
                {expandedChar === char.id && (
                  <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      {originalImage && (
                        <div>
                          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>원본 이미지</p>
                          <img
                            src={originalImage.startsWith('data:') ? base64ToBlobUrl(originalImage) : originalImage}
                            alt={char.name}
                            className="w-full rounded-lg object-cover"
                            style={{ maxHeight: 200 }}
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        {char.personality && (
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>성격</p>
                            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{char.personality}</p>
                          </div>
                        )}
                        {char.distinction_tags?.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>구별 태그</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {char.distinction_tags.map((tag: string, i: number) => (
                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {char.voice_id && (
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>음성 ID</p>
                            <p className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{char.voice_id}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditChar(char); }}
                      className="mt-3 w-full py-2 rounded-lg text-[12px] font-medium transition-all hover:opacity-90"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}
                    >
                      편집
                    </button>
                  </div>
                )}

                {/* Multi-angle Reference Sheet Grid */}
                {hasSheetImages && (
                  <div className="px-3 pb-3">
                    <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      레퍼런스 시트
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {['front', 'angle_45', 'side', 'full_body'].map((angle) => (
                        multiAngle[angle] ? (
                          <div
                            key={angle}
                            className="rounded-lg overflow-hidden"
                            style={{ border: '1px solid var(--border-subtle)' }}
                          >
                            <img
                              src={multiAngle[angle]?.startsWith('data:') ? base64ToBlobUrl(multiAngle[angle]) : multiAngle[angle]}
                              alt={`${char.name} - ${ANGLE_LABELS[angle]}`}
                              className="w-full object-cover"
                              style={{ aspectRatio: '1/1' }}
                            />
                            <p
                              className="text-[11px] text-center py-1"
                              style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
                            >
                              {ANGLE_LABELS[angle]}
                            </p>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {characters.length === 0 && !showForm && (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg"
          style={{
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            opacity={0.5}
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7" />
          </svg>
          <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
            등록된 캐릭터가 없습니다
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            위의 "캐릭터 추가" 버튼을 눌러 첫 캐릭터를 등록해보세요.
          </p>
        </div>
      )}

      {/* Add Character Form */}
      {showForm && (
        <div
          className="flex flex-col gap-4 p-4 rounded-lg"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            새 캐릭터
          </p>

          {/* Name */}
          <div>
            <label style={labelStyle}>
              캐릭터 이름 <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 댕이"
              style={inputStyle}
            />
          </div>

          {/* Image Type */}
          <div>
            <label style={labelStyle}>이미지 타입</label>
            <div className="flex gap-2">
              {IMAGE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, image_type: opt.value }))}
                  className="flex-1 py-2 px-3 rounded-lg text-[12px] font-medium transition-all"
                  style={{
                    background:
                      form.image_type === opt.value
                        ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                        : 'var(--bg-elevated)',
                    color: form.image_type === opt.value ? '#fff' : 'var(--text-secondary)',
                    border:
                      form.image_type === opt.value
                        ? 'none'
                        : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>역할</label>
            <div className="flex gap-3">
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="char_role"
                    checked={form.char_role === opt.value}
                    onChange={() => setForm((f) => ({ ...f, char_role: opt.value }))}
                    style={{ accentColor: '#06b6d4' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Species */}
          <div>
            <label style={labelStyle}>종류</label>
            <input
              type="text"
              value={form.species}
              onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))}
              placeholder="예: 골든리트리버"
              style={inputStyle}
            />
          </div>

          {/* Personality */}
          <div>
            <label style={labelStyle}>성격</label>
            <textarea
              rows={3}
              value={form.personality}
              onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
              placeholder="캐릭터의 성격을 설명해주세요..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Distinction Tags */}
          <div>
            <label style={labelStyle}>구별 태그</label>
            <input
              type="text"
              value={form.distinction_tags}
              onChange={(e) => setForm((f) => ({ ...f, distinction_tags: e.target.value }))}
              placeholder="예: 빨간 반다나, 작은 배낭"
              style={inputStyle}
            />
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              쉼표(,)로 구분하여 입력해주세요.
            </p>
          </div>

          {/* Image Upload */}
          <div>
            <label style={labelStyle}>캐릭터 이미지</label>
            {form.imageDataUrl && (
              <img
                src={form.imageDataUrl}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg mb-2"
                style={{ border: '1px solid var(--border-subtle)' }}
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            />
          </div>

          {/* Voice Design */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                const section = document.getElementById('voice-design-section');
                if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <span>캐릭터 음성 (선택)</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div id="voice-design-section" style={{ display: 'none' }} className="px-4 pb-4 flex flex-col gap-3">
              {/* Show existing voice ID if editing */}
              {form.selected_voice_id && (
                <div className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>현재 음성 ID</p>
                  <p className="text-[12px] font-mono" style={{ color: '#06b6d4' }}>{form.selected_voice_id}</p>
                </div>
              )}
              <div>
                <label style={labelStyle}>음성 설명</label>
                <input
                  type="text"
                  value={form.voice_description}
                  onChange={(e) => setForm((f) => ({ ...f, voice_description: e.target.value }))}
                  placeholder="예: 밝고 에너지 넘치는 젊은 남성 음성, 약간 높은 톤"
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!form.voice_description.trim()) return;
                  setForm((f) => ({ ...f, voiceLoading: true, voice_variants: [], selected_voice_id: '' }));
                  try {
                    const result = await designCharacterVoice(form.voice_description.trim());
                    if (!result.variants || result.variants.length === 0) {
                      const debugInfo = (result as any).debug_errors?.join('\n') || '';
                      alert(`음성 생성에 실패했습니다.${debugInfo ? `\n\n상세: ${debugInfo}` : ' 다른 설명으로 다시 시도해주세요.'}`);
                      setForm((f) => ({ ...f, voiceLoading: false }));
                      return;
                    }
                    const variants = result.variants.map((v: { voice_id: string; preview_url: string; name: string }, i: number) => ({
                      voice_id: v.voice_id,
                      preview_url: v.preview_url,
                      name: v.name || `변형 ${String.fromCharCode(65 + i)}`,
                    }));
                    setForm((f) => ({ ...f, voice_variants: variants, voiceLoading: false }));
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : '음성 생성 실패';
                    alert(msg);
                    setForm((f) => ({ ...f, voiceLoading: false }));
                  }
                }}
                disabled={form.voiceLoading || !form.voice_description.trim()}
                className="w-full py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  background: form.voiceLoading || !form.voice_description.trim()
                    ? 'var(--bg-surface)'
                    : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  color: form.voiceLoading || !form.voice_description.trim() ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  cursor: form.voiceLoading || !form.voice_description.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {form.voiceLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    음성 생성 중...
                  </span>
                ) : (
                  '음성 생성 (30 크레딧)'
                )}
              </button>

              {/* Voice Variants */}
              {form.voice_variants.length > 0 && (
                <div className="flex flex-col gap-2">
                  {form.voice_variants.map((variant, idx) => {
                    const variantLabel = ['변형 A', '변형 B', '변형 C'][idx] || `변형 ${idx + 1}`;
                    const isSelected = form.selected_voice_id === variant.voice_id;
                    return (
                      <div
                        key={variant.voice_id}
                        className="flex items-center gap-3 p-3 rounded-lg transition-all"
                        style={{
                          background: 'var(--bg-surface)',
                          border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)',
                          boxShadow: isSelected ? '0 0 0 1px rgba(139,92,246,0.2)' : 'none',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                            {variantLabel}
                          </p>
                          <audio
                            controls
                            src={variant.preview_url}
                            className="w-full"
                            style={{ height: 32 }}
                            preload="none"
                          />
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                          <input
                            type="radio"
                            name="voice_variant"
                            checked={isSelected}
                            onChange={() => setForm((f) => ({ ...f, selected_voice_id: variant.voice_id }))}
                            style={{ accentColor: '#8b5cf6' }}
                          />
                          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>선택</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingCharId(null);
                setForm({ ...emptyForm });
              }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background:
                  submitting || !form.name.trim()
                    ? 'var(--bg-elevated)'
                    : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                color: submitting || !form.name.trim() ? 'var(--text-muted)' : '#fff',
                border: 'none',
                cursor: submitting || !form.name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? (editingCharId ? '수정 중...' : '등록 중...') : (editingCharId ? '수정' : '등록')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
