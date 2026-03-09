import React, { useState, useEffect, useRef } from 'react';
import type { BrandPreset, ArtStyleConfig } from '../../types';
import { GEMINI_STYLE_CATEGORIES } from '../../config';

function base64ToBlobUrl(dataUrl: string): string {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch {
    return dataUrl;
  }
}

function toDisplayUrl(img: string | null | undefined): string | null {
  if (!img || img === '[saved]') return null;
  if (img.startsWith('http')) return img;
  if (img.startsWith('data:')) return base64ToBlobUrl(img);
  return null;
}

interface Step4Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

async function generateStylePreview(sceneDescription: string, presetId?: string, customStyles?: string[]): Promise<Array<{ style_prompt: string; image_data: string | null }>> {
  const token = localStorage.getItem('c2gen_session_token') || '';
  const body: Record<string, unknown> = { action: 'style-preview', token, scene_description: sceneDescription, preset_id: presetId };
  if (customStyles) body.style_variants = customStyles;
  const res = await fetch('/api/brand-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Preview generation failed');
  const data = await res.json();
  return data.variants;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)', borderRadius: 8,
  color: 'var(--text-primary)', fontSize: 14, outline: 'none', transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
};

const allStyles = GEMINI_STYLE_CATEGORIES.flatMap((cat) =>
  cat.styles.map((s) => ({ ...s, category: cat.name }))
);

type PreviewVariant = { id: string; label: string; stylePrompt: string; imageData: string | null };

export default function Step4ArtStyle({ data, onUpdate, presetId }: Step4Props) {
  const artStyle = data.art_style || { custom_prompt: '' };
  const savedImages = data.style_preview_images || [];
  const savedPreviews = (artStyle as any).preview_results || [];
  const savedPrompt = artStyle.custom_prompt || '';

  // State
  const [sceneDesc, setSceneDesc] = useState('캐릭터가 공원에서 산책하고 있다');
  const [generating, setGenerating] = useState(false);
  const [customGenerating, setCustomGenerating] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [customPreviewImage, setCustomPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize variants from saved data
  const initialVariants: PreviewVariant[] = savedImages.length > 0
    ? savedImages.map((img: string, i: number) => ({
        id: String.fromCharCode(65 + i),
        label: `변형 ${String.fromCharCode(65 + i)}`,
        stylePrompt: savedPreviews[i]?.style_prompt || '',
        imageData: toDisplayUrl(img) || toDisplayUrl(savedPreviews[i]?.image_url),
      }))
    : [
        { id: 'A', label: '변형 A', stylePrompt: '', imageData: null },
        { id: 'B', label: '변형 B', stylePrompt: '', imageData: null },
        { id: 'C', label: '변형 C', stylePrompt: '', imageData: null },
      ];
  const [variants, setVariants] = useState<PreviewVariant[]>(initialVariants);

  // Find saved image for current style
  const savedStyleImage = (() => {
    const idx = savedPreviews.findIndex((p: any) => p.style_prompt === savedPrompt);
    if (idx >= 0) return toDisplayUrl(savedImages[idx]) || toDisplayUrl(savedPreviews[idx]?.image_url);
    // Check if any variant matches
    const v = variants.find(v => v.stylePrompt === savedPrompt);
    return v?.imageData || null;
  })();

  // Auto-select matching variant on load
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && savedPrompt && savedImages.length > 0) {
      initRef.current = true;
      const match = variants.find(v => v.stylePrompt === savedPrompt);
      if (match) setSelectedVariant(match.id);
    }
  }, []);

  const updateArtStyle = (updates: Partial<ArtStyleConfig>) => {
    onUpdate({ art_style: { ...artStyle, ...updates } });
  };

  const handleGeneratePreview = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateStylePreview(sceneDesc, presetId);
      const newVariants: PreviewVariant[] = result.slice(0, 3).map((v, i) => ({
        id: String.fromCharCode(65 + i),
        label: `변형 ${String.fromCharCode(65 + i)}`,
        stylePrompt: v.style_prompt,
        imageData: toDisplayUrl(v.image_data),
      }));
      setVariants(newVariants);
      setSelectedVariant(null);
    } catch {
      setError('프리뷰 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectVariant = (v: PreviewVariant) => {
    setSelectedVariant(v.id);
    updateArtStyle({ custom_prompt: v.stylePrompt });
  };

  // Generate single preview for custom prompt
  const handleCustomPreview = async () => {
    const prompt = artStyle.custom_prompt?.trim();
    if (!prompt) return;
    setCustomGenerating(true);
    setError(null);
    try {
      const result = await generateStylePreview(sceneDesc, presetId, [prompt]);
      if (result[0]?.image_data) {
        setCustomPreviewImage(toDisplayUrl(result[0].image_data));
      }
    } catch {
      setError('커스텀 프리뷰 생성에 실패했습니다.');
    } finally {
      setCustomGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          아트 스타일 선택
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          브랜드에 맞는 화풍을 선택하세요. AI 프리뷰를 생성하거나 직접 입력할 수 있습니다.
        </p>
      </div>

      {/* Current Style Display */}
      {savedPrompt && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '2px solid #0891b2', background: 'var(--bg-elevated)' }}
        >
          {savedStyleImage && (
            <img
              src={savedStyleImage}
              alt="현재 화풍"
              className="w-full object-cover"
              style={{ maxHeight: 220 }}
            />
          )}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              <span className="text-[12px] font-semibold" style={{ color: '#0891b2' }}>현재 선택된 화풍</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{savedPrompt}</p>
          </div>
        </div>
      )}

      {/* AI Preview Generation */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <label style={labelStyle}>AI 랜덤 화풍 프리뷰</label>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
          테스트 씬을 입력하면 랜덤 3가지 화풍으로 프리뷰를 생성합니다.
        </p>
        <input
          type="text"
          value={sceneDesc}
          onChange={(e) => setSceneDesc(e.target.value)}
          style={inputStyle}
          placeholder="프리뷰에 사용할 장면 (예: 캐릭터가 공원에서 산책하고 있다)"
        />
        <button
          onClick={handleGeneratePreview}
          disabled={generating || !sceneDesc.trim()}
          className="mt-3 w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              3가지 화풍 생성 중...
            </span>
          ) : '프리뷰 생성 (48 크레딧)'}
        </button>

        {error && <p className="mt-2 text-[12px] text-center" style={{ color: '#f87171' }}>{error}</p>}

        {/* Variant Grid */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {variants.map((v) => (
            <div
              key={v.id}
              onClick={() => !generating && v.imageData && handleSelectVariant(v)}
              className="rounded-lg overflow-hidden transition-all hover:scale-[1.02]"
              style={{
                border: selectedVariant === v.id ? '2px solid #0891b2' : '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                cursor: v.imageData ? 'pointer' : 'default',
              }}
            >
              <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: '16/9', background: 'var(--bg-base)' }}>
                {generating ? (
                  <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)', backgroundSize: '200% 100%' }} />
                ) : v.imageData ? (
                  <img src={v.imageData} alt={v.label} className="w-full h-full object-cover" />
                ) : (
                  <p className="text-[11px] text-center px-2" style={{ color: 'var(--text-muted)' }}>프리뷰를<br />생성해주세요</p>
                )}
              </div>
              <div className="flex items-center gap-2 p-2">
                <input type="radio" name="variant" checked={selectedVariant === v.id} onChange={() => v.imageData && handleSelectVariant(v)} className="accent-cyan-600" disabled={!v.imageData} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{v.label}</span>
                {v.stylePrompt && <span className="text-[9px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>{v.stylePrompt.slice(0, 25)}...</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Style + Custom Prompt */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <label style={labelStyle}>직접 스타일 입력</label>

        <select
          value={artStyle.style_id || ''}
          onChange={(e) => {
            const found = allStyles.find((s) => s.id === e.target.value);
            updateArtStyle({ style_id: e.target.value, custom_prompt: found?.prompt || artStyle.custom_prompt });
            setSelectedVariant(null);
            setCustomPreviewImage(null);
          }}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">프리셋에서 선택하거나 아래 직접 입력</option>
          {GEMINI_STYLE_CATEGORIES.map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              {cat.styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.description}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: 16 }}>커스텀 프롬프트</label>
        <textarea
          rows={3}
          value={artStyle.custom_prompt || ''}
          onChange={(e) => updateArtStyle({ custom_prompt: e.target.value })}
          placeholder="원하는 스타일을 자유롭게 입력하세요 (예: 따뜻한 수채화풍, 부드러운 파스텔톤)"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
        />

        {/* Custom Preview Button + Result */}
        <button
          onClick={handleCustomPreview}
          disabled={customGenerating || !(artStyle.custom_prompt?.trim())}
          className="mt-3 w-full py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            background: customGenerating || !(artStyle.custom_prompt?.trim()) ? 'var(--bg-surface)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            color: customGenerating || !(artStyle.custom_prompt?.trim()) ? 'var(--text-muted)' : '#fff',
            border: 'none',
          }}
        >
          {customGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              프리뷰 생성 중...
            </span>
          ) : '이 스타일로 프리뷰 보기 (16 크레딧)'}
        </button>

        {customPreviewImage && (
          <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
            <img src={customPreviewImage} alt="커스텀 프리뷰" className="w-full object-cover" style={{ maxHeight: 220 }} />
            <p className="text-[11px] py-1.5 text-center" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
              커스텀 스타일 프리뷰
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
