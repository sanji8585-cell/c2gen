
import React, { useCallback, useMemo } from 'react';
import {
  IMAGE_MODELS,
  ImageModelId,
  GEMINI_STYLE_CATEGORIES,
  GeminiStyleId,
  GPT_STYLE_CATEGORIES,
  GptStyleId,
  VideoOrientation,
} from '../../config';
import ReferenceImageSelector from './ReferenceImageSelector';

// --- Style maps ---
const GEMINI_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GEMINI_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GEMINI_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

const GPT_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GPT_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GPT_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

const PREVIEW_LABELS = ['과학 / 기술', '라이프스타일 / 푸드', '금융 / 경제'];

// --- Shared inline-style helpers (mockup CSS) ---
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '1.5px',
  color: 'var(--text-muted)',
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const cardBase: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  cursor: 'pointer',
  transition: 'all 0.2s',
  textAlign: 'left' as const,
  outline: 'none',
};

const cardSelected: React.CSSProperties = {
  borderColor: 'rgba(96,165,250,0.6)',
  background: 'rgba(96,165,250,0.08)',
  boxShadow: '0 0 12px rgba(96,165,250,0.08)',
};

const chipBase: React.CSSProperties = {
  padding: '11px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  transition: 'all 0.2s',
  textAlign: 'center' as const,
  outline: 'none',
};

const chipSelected: React.CSSProperties = {
  background: 'rgba(96,165,250,0.12)',
  borderColor: 'rgba(96,165,250,0.45)',
  color: '#93c5fd',
};

const koreanToggleOn: React.CSSProperties = {
  background: 'rgba(251,191,36,0.12)',
  borderColor: 'rgba(251,191,36,0.4)',
  color: '#fcd34d',
};

export interface ImageSettingsGroupProps {
  imageModelId: ImageModelId;
  onImageModelChange: (id: ImageModelId) => void;
  videoOrientation: VideoOrientation;
  onOrientationChange: (o: VideoOrientation) => void;
  characterRefImages: string[];
  styleRefImages: string[];
  characterStrength: number;
  styleStrength: number;
  onCharacterImagesChange: (imgs: string[]) => void;
  onStyleImagesChange: (imgs: string[]) => void;
  onCharacterStrengthChange: (v: number) => void;
  onStyleStrengthChange: (v: number) => void;
  geminiStyleId: GeminiStyleId;
  onGeminiStyleChange: (id: GeminiStyleId) => void;
  geminiCustomStylePrompt: string;
  onGeminiCustomStyleChange: (v: string) => void;
  gptStyleId: GptStyleId;
  onGptStyleChange: (id: GptStyleId) => void;
  gptCustomStylePrompt: string;
  onGptCustomStyleChange: (v: string) => void;
  suppressKorean: boolean;
  onSuppressKoreanChange: (v: boolean) => void;
  previewStyleId: string | null;
  previewIndex: number;
  onPreviewStyleChange: (id: string | null) => void;
  onPreviewIndexChange: (i: number) => void;
  isDisabled: boolean;
}

const ImageSettingsGroup: React.FC<ImageSettingsGroupProps> = ({
  imageModelId,
  onImageModelChange,
  videoOrientation,
  onOrientationChange,
  characterRefImages,
  styleRefImages,
  characterStrength,
  styleStrength,
  onCharacterImagesChange,
  onStyleImagesChange,
  onCharacterStrengthChange,
  onStyleStrengthChange,
  geminiStyleId,
  onGeminiStyleChange,
  geminiCustomStylePrompt,
  onGeminiCustomStyleChange,
  gptStyleId,
  onGptStyleChange,
  gptCustomStylePrompt,
  onGptCustomStyleChange,
  suppressKorean,
  onSuppressKoreanChange,
  previewStyleId,
  previewIndex,
  onPreviewStyleChange,
  onPreviewIndexChange,
  isDisabled,
}) => {
  // Resolved style objects for header display
  const selectedGeminiStyle = useMemo(() => GEMINI_STYLE_MAP.get(geminiStyleId) ?? null, [geminiStyleId]);
  const selectedGptStyle = useMemo(() => GPT_STYLE_MAP.get(gptStyleId) ?? null, [gptStyleId]);

  const toggleStylePreview = useCallback((styleId: string) => {
    if (previewStyleId === styleId) {
      onPreviewStyleChange(null);
    } else {
      onPreviewStyleChange(styleId);
      onPreviewIndexChange(0);
    }
  }, [previewStyleId, onPreviewStyleChange, onPreviewIndexChange]);

  // Determine which style categories / active IDs to show
  const isGemini = imageModelId === 'gemini-2.5-flash-image';
  const isGpt = imageModelId === 'gpt-image-1';

  return (
    <div>
      {/* ===== 1. 모델 + 영상 방향 (한 줄 4칸) ===== */}
      <div style={{ marginBottom: 22 }}>
        {/* Labels row */}
        <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_auto_1fr_1fr] gap-2 lg:gap-x-8 mb-2">
          <div className="col-span-2 lg:col-span-2" style={{ ...sectionLabelStyle, marginBottom: 0 }}>
            <span style={{ fontSize: 14 }}>🤖</span> 이미지 생성 모델
          </div>
          <div className="hidden lg:block" />
          <div className="col-span-2 lg:col-span-2" style={{ ...sectionLabelStyle, marginBottom: 0 }}>
            <span style={{ fontSize: 14 }}>📐</span> 영상 방향
          </div>
        </div>
        {/* Cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_auto_1fr_1fr] gap-2" style={{ alignItems: 'stretch' }}>
          {/* 모델 카드들 */}
          {IMAGE_MODELS.map((model) => {
            const active = imageModelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                disabled={isDisabled}
                onClick={() => onImageModelChange(model.id)}
                style={{
                  ...cardBase,
                  ...(active ? cardSelected : {}),
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  textAlign: 'left' as const,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{model.name}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                    background: active ? 'rgba(96,165,250,0.2)' : 'var(--bg-hover)',
                    color: active ? '#93c5fd' : 'var(--text-muted)',
                  }}>{model.provider}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{model.description}</div>
              </button>
            );
          })}

          {/* 구분선 */}
          <div className="hidden lg:block" style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch', margin: '4px 0' }} />

          {/* 가로 */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onOrientationChange('landscape')}
            style={{
              ...cardBase,
              ...(videoOrientation === 'landscape' ? cardSelected : {}),
              padding: '8px 12px',
              color: videoOrientation === 'landscape' ? 'var(--text-primary)' : 'var(--text-secondary)',
              textAlign: 'left' as const,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{ width: 20, height: 14, border: '1.5px solid currentColor', borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>가로 (16:9)</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>유튜브 · 일반 영상</div>
          </button>

          {/* 세로 */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onOrientationChange('portrait')}
            style={{
              ...cardBase,
              ...(videoOrientation === 'portrait' ? cardSelected : {}),
              padding: '8px 12px',
              color: videoOrientation === 'portrait' ? 'var(--text-primary)' : 'var(--text-secondary)',
              textAlign: 'left' as const,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{ width: 14, height: 20, border: '1.5px solid currentColor', borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>세로 (9:16)</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>쇼츠 · 릴스 · 틱톡</div>
          </button>
        </div>

        {/* GPT Image-1 warning */}
        {isGpt && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: 11, color: 'rgba(252,211,77,0.85)', lineHeight: 1.5,
          }}>
            ⚠ <b style={{ color: '#fcd34d' }}>GPT Image-1</b>은 참조 이미지를 지원하지 않습니다.
          </div>
        )}
      </div>

      {/* ===== 3. 참조 이미지 ===== */}
      <div style={{ marginBottom: 22 }}>
        <ReferenceImageSelector
          characterRefImages={characterRefImages}
          styleRefImages={styleRefImages}
          characterStrength={characterStrength}
          styleStrength={styleStrength}
          onCharacterImagesChange={onCharacterImagesChange}
          onStyleImagesChange={onStyleImagesChange}
          onCharacterStrengthChange={onCharacterStrengthChange}
          onStyleStrengthChange={onStyleStrengthChange}
          isDisabled={isDisabled || isGpt}
        />
      </div>

      {/* ===== 4. 화풍 선택 ===== */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          <span style={{ fontSize: 14 }}>🎨</span> 화풍 선택
          {isGemini && selectedGeminiStyle && geminiStyleId !== 'gemini-none' && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'none', letterSpacing: 0 }}>
              {selectedGeminiStyle.category} &gt; {selectedGeminiStyle.name}
            </span>
          )}
          {isGpt && selectedGptStyle && gptStyleId !== 'gpt-none' && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'none', letterSpacing: 0 }}>
              {selectedGptStyle.category} &gt; {selectedGptStyle.name}
            </span>
          )}
        </div>

        {/* 없음 + 한글억제 row (2-col) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => isGemini ? onGeminiStyleChange('gemini-none') : onGptStyleChange('gpt-none')}
            style={{
              ...chipBase,
              ...((isGemini ? geminiStyleId === 'gemini-none' : gptStyleId === 'gpt-none') ? chipSelected : {}),
            }}
          >
            🚫 없음 (기본)
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onSuppressKoreanChange(!suppressKorean)}
            title="AI 이미지 생성 시 한글 텍스트를 억제하고 영어만 렌더링합니다"
            style={{
              ...chipBase,
              ...(suppressKorean ? koreanToggleOn : {}),
            }}
          >
            🔤 한글억제 {suppressKorean ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Gemini styles */}
        {isGemini && GEMINI_STYLE_CATEGORIES.map((category) => (
          <div key={category.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '12px 0 8px' }}>
              {category.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {category.styles.map((style) => {
                const active = geminiStyleId === style.id;
                return (
                  <div key={style.id} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onGeminiStyleChange(style.id as GeminiStyleId)}
                      style={{
                        ...chipBase,
                        ...(active ? chipSelected : {}),
                        width: '100%',
                        display: 'block',
                        minHeight: 70,
                      }}
                    >
                      {style.name}
                      <div style={{ fontSize: 10, marginTop: 2, color: active ? '#93c5fd' : 'var(--text-muted)', fontWeight: 400 }}>
                        {style.description}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="미리보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGeminiStyleChange(style.id as GeminiStyleId);
                        toggleStylePreview(style.id);
                      }}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 24, height: 24, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, border: 'none', cursor: 'pointer',
                        background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
                        color: 'var(--text-secondary)',
                        transition: 'transform 0.15s',
                      }}
                    >
                      {previewStyleId === style.id ? '✕' : '👁️'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* GPT styles */}
        {isGpt && GPT_STYLE_CATEGORIES.map((category) => (
          <div key={category.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '12px 0 8px' }}>
              {category.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {category.styles.map((style) => {
                const active = gptStyleId === style.id;
                return (
                  <div key={style.id} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onGptStyleChange(style.id as GptStyleId)}
                      style={{
                        ...chipBase,
                        ...(active ? chipSelected : {}),
                        width: '100%',
                        display: 'block',
                        minHeight: 70,
                      }}
                    >
                      {style.name}
                      <div style={{ fontSize: 10, marginTop: 2, color: active ? '#93c5fd' : 'var(--text-muted)', fontWeight: 400 }}>
                        {style.description}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="미리보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGptStyleChange(style.id as GptStyleId);
                        toggleStylePreview(style.id);
                      }}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 24, height: 24, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, border: 'none', cursor: 'pointer',
                        background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
                        color: 'var(--text-secondary)',
                        transition: 'transform 0.15s',
                      }}
                    >
                      {previewStyleId === style.id ? '✕' : '👁️'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ===== 5. 커스텀 화풍 프롬프트 ===== */}
      <div style={{ marginBottom: 22 }}>
        {/* Activate custom button */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (isGemini) {
              onGeminiStyleChange(geminiStyleId === 'gemini-custom' ? 'gemini-none' : 'gemini-custom');
            } else {
              onGptStyleChange(gptStyleId === 'gpt-custom' ? 'gpt-none' : 'gpt-custom');
            }
          }}
          style={{
            ...chipBase,
            ...((isGemini ? geminiStyleId === 'gemini-custom' : gptStyleId === 'gpt-custom') ? chipSelected : {}),
            marginBottom: 10,
          }}
        >
          ✏️ 커스텀 화풍 프롬프트 활성화
        </button>

        {/* Textarea (visible when custom is active) */}
        {((isGemini && geminiStyleId === 'gemini-custom') || (isGpt && gptStyleId === 'gpt-custom')) && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            overflow: 'hidden',
            transition: 'border-color 0.2s',
          }}>
            <textarea
              value={isGemini ? geminiCustomStylePrompt : gptCustomStylePrompt}
              onChange={(e) => isGemini ? onGeminiCustomStyleChange(e.target.value) : onGptCustomStyleChange(e.target.value)}
              placeholder="직접 화풍을 설명해주세요. 예: 따뜻한 파스텔톤의 수채화 느낌, 부드러운 선과 밝은 배경..."
              disabled={isDisabled}
              style={{
                width: '100%', minHeight: 88, padding: '14px 16px',
                background: 'none', border: 'none', outline: 'none',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
                color: 'var(--text-primary)', resize: 'vertical', lineHeight: 1.6,
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                영어로 작성하면 더 정확한 결과를 얻을 수 있습니다
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                {(isGemini ? geminiCustomStylePrompt : gptCustomStylePrompt).length} / 500
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===== 화풍 미리보기 (static images) ===== */}
      {previewStyleId && (
        <div style={{ marginBottom: 22, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🖼️</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>화풍 미리보기</span>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 6,
                background: 'var(--bg-hover)', color: 'var(--text-muted)', fontWeight: 600,
              }}>
                {PREVIEW_LABELS[previewIndex]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onPreviewStyleChange(null)}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              닫기 ✕
            </button>
          </div>

          <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', background: 'var(--bg-elevated)' }}>
            <img
              src={`/previews/${previewStyleId}-${previewIndex + 1}.jpg`}
              alt={`${previewStyleId} 미리보기 ${previewIndex + 1}`}
              style={{ width: '100%', height: 'auto', maxHeight: 300, objectFit: 'contain', display: 'block', borderRadius: 12 }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '';
                (e.target as HTMLImageElement).alt = '미리보기 이미지가 아직 준비되지 않았습니다';
              }}
            />
            {/* Navigation arrows */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', pointerEvents: 'none' }}>
              <button
                type="button"
                onClick={() => onPreviewIndexChange(previewIndex <= 0 ? 2 : previewIndex - 1)}
                style={{
                  pointerEvents: 'auto', width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, border: 'none', cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)',
                  color: 'var(--text-primary)', transition: 'transform 0.15s',
                }}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => onPreviewIndexChange(previewIndex >= 2 ? 0 : previewIndex + 1)}
                style={{
                  pointerEvents: 'auto', width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, border: 'none', cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)',
                  color: 'var(--text-primary)', transition: 'transform 0.15s',
                }}
              >
                ▶
              </button>
            </div>
            {/* Dot indicators */}
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPreviewIndexChange(i)}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                    background: i === previewIndex ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-muted) 50%, transparent)',
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
          </div>
          <p style={{ fontSize: 10, textAlign: 'center', padding: '6px 0', color: 'var(--text-muted)' }}>
            AI는 매번 다른 이미지를 생성합니다. 미리보기는 화풍 참고용이며 실제 결과와 다를 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageSettingsGroup;
