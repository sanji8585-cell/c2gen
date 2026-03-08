import React, { useState } from 'react';
import type { BrandPreset, ToneVoiceConfig } from '../../types';
import { analyzeTone } from '../../services/brandPresetService';

interface Step2Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

type Mode = 'manual' | 'reference';

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

export default function Step2ToneVoice({ data, onUpdate, presetId: _presetId }: Step2Props) {
  const [mode, setMode] = useState<Mode>('manual');
  const [referenceText, setReferenceText] = useState(
    (data.tone_reference_texts || []).join('\n\n---\n\n')
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(
    data.tone_learned_patterns || null
  );

  const tone = data.tone_voice || { style: '', formality: 0.5, humor_level: 0.5 };

  const updateTone = (partial: Partial<ToneVoiceConfig>) => {
    onUpdate({ tone_voice: { ...tone, ...partial } });
  };

  const handleAnalyze = async () => {
    if (!referenceText.trim()) return;
    setAnalyzing(true);
    try {
      const texts = referenceText
        .split(/---/)
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await analyzeTone(texts);
      setAnalysisResult(result);
      onUpdate({
        tone_reference_texts: texts,
        tone_learned_patterns: result,
      });
    } catch (err) {
      console.error('Tone analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const modeButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background: active
      ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
      : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    transition: 'all 0.2s',
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          말투 & 톤 설정
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          브랜드의 말투와 어조를 설정해주세요.
        </p>
      </div>

      {/* Mode Toggle */}
      <div
        className="flex gap-1 p-1"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 8,
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button style={modeButtonStyle(mode === 'manual')} onClick={() => setMode('manual')}>
          직접 입력
        </button>
        <button style={modeButtonStyle(mode === 'reference')} onClick={() => setMode('reference')}>
          레퍼런스 학습
        </button>
      </div>

      {mode === 'manual' ? (
        <div className="flex flex-col gap-4">
          {/* 말투 스타일 */}
          <div>
            <label style={labelStyle}>말투 스타일</label>
            <input
              type="text"
              value={tone.style}
              onChange={(e) => updateTone({ style: e.target.value })}
              placeholder="예: 친근한 반말, 재미있게"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            />
          </div>

          {/* 격식 수준 */}
          <div>
            <label style={labelStyle}>격식 수준</label>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: 'var(--text-muted)', minWidth: 36 }}>
                비격식
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={tone.formality}
                onChange={(e) => updateTone({ formality: parseFloat(e.target.value) })}
                className="flex-1"
                style={{ accentColor: '#06b6d4' }}
              />
              <span className="text-[12px]" style={{ color: 'var(--text-muted)', minWidth: 24 }}>
                격식
              </span>
            </div>
            <p className="text-[12px] mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
              {Math.round(tone.formality * 100)}%
            </p>
          </div>

          {/* 유머 수준 */}
          <div>
            <label style={labelStyle}>유머 수준</label>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: 'var(--text-muted)', minWidth: 36 }}>
                진지
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={tone.humor_level}
                onChange={(e) => updateTone({ humor_level: parseFloat(e.target.value) })}
                className="flex-1"
                style={{ accentColor: '#06b6d4' }}
              />
              <span className="text-[12px]" style={{ color: 'var(--text-muted)', minWidth: 36 }}>
                유머러스
              </span>
            </div>
            <p className="text-[12px] mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
              {Math.round(tone.humor_level * 100)}%
            </p>
          </div>

          {/* 캐치프레이즈 */}
          <div>
            <label style={labelStyle}>캐치프레이즈</label>
            <input
              type="text"
              value={tone.catchphrase || ''}
              onChange={(e) => updateTone({ catchphrase: e.target.value })}
              placeholder="예: 오늘도 모험이다멍!"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            />
          </div>

          {/* 금지어 */}
          <div>
            <label style={labelStyle}>금지어</label>
            <input
              type="text"
              value={(tone.forbidden_words || []).join(', ')}
              onChange={(e) =>
                updateTone({
                  forbidden_words: e.target.value
                    .split(',')
                    .map((w) => w.trim())
                    .filter(Boolean),
                })
              }
              placeholder="쉼표로 구분 (예: 죽음, 폭력, 혐오)"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            />
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              쉼표(,)로 구분하여 입력해주세요.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Reference Text */}
          <div>
            <label style={labelStyle}>레퍼런스 텍스트</label>
            <textarea
              rows={8}
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder={
                '기존에 사용하던 대본이나 글을 3-5개 붙여넣어주세요.\n각 예시 사이에 --- 를 넣어 구분해주세요.\n\n예시 1 텍스트...\n---\n예시 2 텍스트...'
              }
              style={{ ...inputStyle, resize: 'vertical', minHeight: 160 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            />
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !referenceText.trim()}
            className="py-2.5 px-4 rounded-lg text-sm font-semibold transition-all"
            style={{
              background:
                analyzing || !referenceText.trim()
                  ? 'var(--bg-elevated)'
                  : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: analyzing || !referenceText.trim() ? 'var(--text-muted)' : '#fff',
              border: 'none',
              cursor: analyzing || !referenceText.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.3} />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                분석 중...
              </span>
            ) : (
              'AI 분석 시작'
            )}
          </button>

          {/* Analysis Result */}
          {analysisResult && (
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                분석 결과
              </p>
              <pre
                className="text-[12px] whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
              >
                {JSON.stringify(analysisResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
