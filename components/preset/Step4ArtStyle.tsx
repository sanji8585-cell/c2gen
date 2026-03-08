import React, { useState } from 'react';
import type { BrandPreset, ArtStyleConfig } from '../../types';
import { GEMINI_STYLE_CATEGORIES } from '../../config';

interface Step4Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

async function generateStylePreview(sceneDescription: string): Promise<Array<{style_prompt: string; image_data: string | null}>> {
  const token = localStorage.getItem('c2gen_session_token') || '';
  const res = await fetch('/api/brand-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'style-preview', token, scene_description: sceneDescription }),
  });
  if (!res.ok) throw new Error('Preview generation failed');
  const data = await res.json();
  return data.variants;
}

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

const allStyles = GEMINI_STYLE_CATEGORIES.flatMap((cat) =>
  cat.styles.map((s) => ({ ...s, category: cat.name }))
);

type PreviewVariant = {
  id: string;
  label: string;
  stylePrompt: string;
  imageData: string | null;
};

export default function Step4ArtStyle({ data, onUpdate, presetId: _presetId }: Step4Props) {
  const artStyle = data.art_style || { custom_prompt: '' };
  const [sceneDesc, setSceneDesc] = useState('캐릭터가 공원에서 산책하고 있다');
  const [generating, setGenerating] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [variants, setVariants] = useState<PreviewVariant[]>([
    { id: 'A', label: '변형 A', stylePrompt: '', imageData: null },
    { id: 'B', label: '변형 B', stylePrompt: '', imageData: null },
    { id: 'C', label: '변형 C', stylePrompt: '', imageData: null },
  ]);
  const [error, setError] = useState<string | null>(null);

  const updateArtStyle = (updates: Partial<ArtStyleConfig>) => {
    onUpdate({ art_style: { ...artStyle, ...updates } });
  };

  const handleGeneratePreview = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateStylePreview(sceneDesc);
      const labels = ['변형 A', '변형 B', '변형 C'];
      const newVariants: PreviewVariant[] = result.slice(0, 3).map((v, i) => ({
        id: String.fromCharCode(65 + i),
        label: labels[i] || `변형 ${String.fromCharCode(65 + i)}`,
        stylePrompt: v.style_prompt,
        imageData: v.image_data || null,
      }));
      setVariants(newVariants);
    } catch (err) {
      console.error('Style preview generation failed:', err);
      setError('프리뷰 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectVariant = (v: PreviewVariant) => {
    setSelectedVariant(v.id);
    updateArtStyle({ custom_prompt: v.stylePrompt });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          아트 스타일 선택
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          브랜드에 맞는 화풍을 선택하세요. 프리뷰를 생성하거나 직접 선택할 수 있습니다.
        </p>
      </div>

      {/* A/B Preview Section */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <label style={labelStyle}>테스트 씬 설명</label>
        <input
          type="text"
          value={sceneDesc}
          onChange={(e) => setSceneDesc(e.target.value)}
          style={inputStyle}
          placeholder="프리뷰에 사용할 장면을 설명해주세요"
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
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
              생성 중...
            </span>
          ) : (
            '프리뷰 생성 (48 크레딧)'
          )}
        </button>

        {error && (
          <p className="mt-2 text-[12px] text-center" style={{ color: '#f87171' }}>{error}</p>
        )}

        {/* Variant Grid */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {variants.map((v) => (
            <div
              key={v.id}
              onClick={() => !generating && handleSelectVariant(v)}
              className="rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
              style={{
                border: selectedVariant === v.id
                  ? '2px solid #0891b2'
                  : '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
              }}
            >
              {/* Image area */}
              <div
                className="relative w-full flex items-center justify-center"
                style={{ aspectRatio: '16/9', background: 'var(--bg-base)' }}
              >
                {generating ? (
                  <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)', backgroundSize: '200% 100%' }} />
                ) : v.imageData ? (
                  <img
                    src={v.imageData}
                    alt={v.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <p className="text-[12px] text-center px-2" style={{ color: 'var(--text-muted)' }}>
                    프리뷰를<br />생성해주세요
                  </p>
                )}
              </div>
              {/* Label + radio */}
              <div className="flex items-center gap-2 p-2.5">
                <input
                  type="radio"
                  name="variant"
                  checked={selectedVariant === v.id}
                  onChange={() => handleSelectVariant(v)}
                  className="accent-cyan-600"
                />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {v.label}
                </span>
                {v.stylePrompt && (
                  <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {v.stylePrompt.slice(0, 30)}{v.stylePrompt.length > 30 ? '...' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Style Fallback */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <label style={labelStyle}>직접 스타일 선택</label>
        <select
          value={artStyle.style_id || ''}
          onChange={(e) => {
            const found = allStyles.find((s) => s.id === e.target.value);
            updateArtStyle({
              style_id: e.target.value,
              custom_prompt: found?.prompt || artStyle.custom_prompt,
            });
            setSelectedVariant(null);
          }}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">스타일을 선택하세요</option>
          {GEMINI_STYLE_CATEGORIES.map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              {cat.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.description}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: 16 }}>커스텀 프롬프트</label>
        <textarea
          rows={3}
          value={artStyle.custom_prompt || ''}
          onChange={(e) => updateArtStyle({ custom_prompt: e.target.value })}
          placeholder="스타일에 대한 추가 지시사항을 입력하세요..."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
        />
      </div>
    </div>
  );
}
