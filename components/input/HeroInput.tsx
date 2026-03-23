import React, { useState, useEffect, useRef } from 'react';
import { GenerationStep } from '../../types';
import DirectiveGuideModal from '../DirectiveGuideModal';

export interface AdvancedSettings {
  format: 'auto' | 'monologue' | 'dialogue' | 'narration';
  speakerCount: 'auto' | '1' | '2' | '3+';
  mood: 'auto' | 'bright' | 'tense' | 'calm';
  sceneConnection: 'auto' | 'independent' | 'connected';
}

interface HeroInputProps {
  activeTab: 'auto' | 'manual' | 'advanced';
  onTabChange: (tab: 'auto' | 'manual' | 'advanced') => void;
  topic: string;
  onTopicChange: (v: string) => void;
  manualScript: string;
  onManualScriptChange: (v: string) => void;
  advancedScript: string;
  onAdvancedScriptChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  step: GenerationStep;
  onAiAssist?: (settings: AdvancedSettings, assistMode?: 'create' | 'refine' | 'viral') => void;
  isAiAssisting?: boolean;
}

const PLACEHOLDER_EXAMPLES = [
  '비트코인 반감기 이후 시세 전망',
  '2026년 부동산 시장 분석',
  '테슬라 vs BYD 전기차 전쟁',
  '금리 인하가 주식시장에 미치는 영향',
  'AI 반도체 시장의 미래',
  '엔비디아 실적과 주가 전망',
  '한국 출생률 위기와 경제 영향',
  '워렌 버핏의 최신 투자 전략',
  '유튜브 수익화 완벽 가이드',
  'MZ세대 소비 트렌드 2026',
  '일본 여행 꿀팁 총정리',
  '삼성전자 반도체 사업 전망',
  '프리랜서 세금 절약 팁',
];

const HeroInput: React.FC<HeroInputProps> = ({
  activeTab,
  onTabChange,
  topic,
  onTopicChange,
  manualScript,
  onManualScriptChange,
  advancedScript,
  onAdvancedScriptChange,
  onSubmit,
  step,
  onAiAssist,
  isAiAssisting,
}) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderOpacity, setPlaceholderOpacity] = useState(1);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [advSettings, setAdvSettings] = useState<AdvancedSettings>({
    format: 'auto', speakerCount: 'auto', mood: 'auto', sceneConnection: 'auto',
  });
  const [showDirectiveGuide, setShowDirectiveGuide] = useState(false);
  const [renderMode, setRenderMode] = useState<'parallel' | 'consistency'>(() => {
    return (localStorage.getItem('tubegen_render_mode') as 'parallel' | 'consistency') || 'parallel';
  });

  const isDisabled = step !== GenerationStep.IDLE && step !== GenerationStep.ERROR && step !== GenerationStep.COMPLETED;
  const isProcessing = step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS;
  const isReviewing = step === GenerationStep.SCRIPT_REVIEW;

  const canSubmit = !isDisabled && (
    activeTab === 'auto' ? topic.trim().length > 0
    : activeTab === 'manual' ? manualScript.trim().length > 0
    : advancedScript.trim().length > 0
  );

  const buttonText = isProcessing ? '생성 중' : isReviewing ? '검토 중' : '시작 →';

  // Placeholder cycling with fade
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setPlaceholderOpacity(0);
      setTimeout(() => {
        setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
        setPlaceholderOpacity(1);
      }, 400);
    }, 4000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const charCount = manualScript.length;
  const charCountColor = charCount >= 10000
    ? '#f59e0b'
    : charCount >= 3000
      ? '#60a5fa'
      : 'var(--text-tertiary)';

  const activeGradient = 'linear-gradient(135deg, #60a5fa, #818cf8)';
  const borderColor = isFocused || isHovered
    ? 'rgba(96, 165, 250, 0.4)'
    : 'var(--border-default)';
  const boxShadow = isFocused
    ? '0 0 0 3px rgba(96, 165, 250, 0.1), 0 4px 24px rgba(0, 0, 0, 0.1)'
    : '0 2px 12px rgba(0, 0, 0, 0.06)';

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 28 }}>
      {/* Outer glow wrapper */}
      <div style={{ position: 'relative' }}>
        {/* Background glow effect */}
        <div style={{
          position: 'absolute',
          inset: -1,
          borderRadius: 22,
          background: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(129,140,248,0.1), rgba(56,189,248,0.12))',
          filter: isFocused ? 'blur(16px)' : 'blur(10px)',
          opacity: isFocused ? 0.8 : isHovered ? 0.5 : 0.25,
          transition: 'all 0.4s ease',
          pointerEvents: 'none',
        }} />
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--bg-surface) 95%, #60a5fa) 100%)',
            border: `1.5px solid ${borderColor}`,
            borderRadius: 20,
            padding: '24px 28px',
            transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
            boxShadow: isFocused
              ? '0 0 0 3px rgba(96,165,250,0.12), 0 8px 32px rgba(0,0,0,0.12)'
              : '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
        {/* Top row: icon + input (자동 모드) */}
        {activeTab === 'auto' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, opacity: 0.6, flexShrink: 0 }}>🔍</span>
          <input
            type="text"
            value={topic}
            onChange={e => onTopicChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isDisabled}
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
            className="placeholder:transition-opacity placeholder:duration-[400ms]"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--text-primary)',
              caretColor: '#38bdf8',
              opacity: 1,
              // Placeholder opacity controlled via inline style override
              ...({ '--ph-opacity': placeholderOpacity } as React.CSSProperties),
            }}
          />
          <style>{`
            form input[type="text"]::placeholder {
              opacity: var(--ph-opacity, 1);
              transition: opacity 400ms ease;
            }
          `}</style>
        </div>
        )}

        {/* Bottom row: tabs + button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: activeTab === 'auto' ? 16 : 0,
            marginBottom: activeTab !== 'auto' ? 16 : 0,
          }}
        >
          {/* Tab switch */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-elevated)',
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            {(['auto', 'manual', 'advanced'] as const).map(tab => {
              const isActive = activeTab === tab;
              const label = tab === 'auto' ? '자동' : tab === 'manual' ? '수동' : '🎬 고급';
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  disabled={isDisabled}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    background: isActive ? activeGradient : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!canSubmit}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            style={{
              background: canSubmit
                ? activeGradient
                : 'var(--bg-elevated)',
              color: canSubmit ? '#ffffff' : 'var(--text-tertiary)',
              border: 'none',
              borderRadius: 12,
              padding: '11px 36px',
              fontSize: 15,
              fontWeight: 800,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              opacity: canSubmit && btnHovered ? 0.9 : 1,
              transform: canSubmit && btnHovered ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            {buttonText}
          </button>
        </div>

        {/* Manual textarea (수동 모드) */}
        {activeTab === 'manual' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20, opacity: 0.6, flexShrink: 0, marginTop: 2 }}>📝</span>
              <div style={{ flex: 1 }}>
                <textarea
                  value={manualScript}
                  onChange={e => onManualScriptChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isDisabled}
                  placeholder="대본을 직접 입력하세요..."
                  style={{
                    width: '100%',
                    minHeight: 200,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: 'var(--text-primary)',
                    caretColor: '#38bdf8',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  style={{
                    textAlign: 'right',
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    color: charCountColor,
                    transition: 'color 0.2s ease',
                  }}
                >
                  {charCount.toLocaleString()}자
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Advanced textarea (고급 모드) */}
        {activeTab === 'advanced' && (
          <div>
            {/* AI 어시스턴트 설정 */}
            <div style={{ marginBottom: 12 }}>
              {/* Settings row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {[
                  { label: '형식', key: 'format' as const, options: [
                    { value: 'auto', label: '🤖 알아서' }, { value: 'monologue', label: '독백' },
                    { value: 'dialogue', label: '대화형' }, { value: 'narration', label: '나레이션' }
                  ]},
                  { label: '화자', key: 'speakerCount' as const, options: [
                    { value: 'auto', label: '🤖 알아서' }, { value: '1', label: '1명' },
                    { value: '2', label: '2명' }, { value: '3+', label: '3명+' }
                  ]},
                  { label: '분위기', key: 'mood' as const, options: [
                    { value: 'auto', label: '🤖 알아서' }, { value: 'bright', label: '밝음' },
                    { value: 'tense', label: '긴장감' }, { value: 'calm', label: '차분' }
                  ]},
                  { label: '씬 연결', key: 'sceneConnection' as const, options: [
                    { value: 'auto', label: '🤖 알아서' }, { value: 'independent', label: '독립' },
                    { value: 'connected', label: '이어지게' }
                  ]},
                ].map(group => (
                  <div key={group.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, minWidth: 40 }}>{group.label}</span>
                    <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 6, padding: 2 }}>
                      {group.options.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setAdvSettings(prev => ({ ...prev, [group.key]: opt.value }))}
                          style={{
                            padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                            fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
                            background: advSettings[group.key] === opt.value ? 'linear-gradient(135deg, #60a5fa, #818cf8)' : 'transparent',
                            color: advSettings[group.key] === opt.value ? '#fff' : 'var(--text-secondary)',
                          }}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* AI Assist buttons — 3가지 모드 */}
              {isAiAssisting ? (
                <div style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.2)',
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, textAlign: 'center',
                }}>
                  ✨ AI가 대본 작업 중...
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button"
                    onClick={() => onAiAssist?.(advSettings, 'create')}
                    disabled={isDisabled || !advancedScript.trim()}
                    style={{
                      flex: 1, padding: '8px 8px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.3)',
                      background: 'linear-gradient(135deg, rgba(96,165,250,0.1), rgba(129,140,248,0.1))',
                      color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s', opacity: isDisabled || !advancedScript.trim() ? 0.4 : 1,
                    }}
                  >✨ 새로 써주기</button>
                  <button type="button"
                    onClick={() => onAiAssist?.(advSettings, 'refine')}
                    disabled={isDisabled || !advancedScript.trim()}
                    style={{
                      flex: 1, padding: '8px 8px', borderRadius: 8, border: '1px solid rgba(52,211,153,0.3)',
                      background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.08))',
                      color: '#34d399', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s', opacity: isDisabled || !advancedScript.trim() ? 0.4 : 1,
                    }}
                  >🔧 다듬어주기</button>
                  <button type="button"
                    onClick={() => onAiAssist?.(advSettings, 'viral')}
                    disabled={isDisabled || !advancedScript.trim()}
                    style={{
                      flex: 1, padding: '8px 8px', borderRadius: 8, border: '1px solid rgba(251,146,60,0.3)',
                      background: 'linear-gradient(135deg, rgba(251,146,60,0.08), rgba(245,158,11,0.08))',
                      color: '#fb923c', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s', opacity: isDisabled || !advancedScript.trim() ? 0.4 : 1,
                    }}
                  >🔥 바이럴 변환</button>
                </div>
              )}
              {/* Directive Guide button */}
              <button type="button"
                onClick={() => setShowDirectiveGuide(true)}
                style={{
                  width: '100%', padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginTop: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
              >
                📖 디렉티브 가이드
              </button>
            </div>
            {/* 렌더링 모드 선택 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>이미지 모드</span>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 6, padding: 2 }}>
                {[
                  { value: 'parallel', label: '⚡ 빠른 생성' },
                  { value: 'consistency', label: '🔗 일관성' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => {
                      localStorage.setItem('tubegen_render_mode', opt.value);
                      setRenderMode(opt.value as 'parallel' | 'consistency');
                    }}
                    style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
                      background: renderMode === opt.value ? 'linear-gradient(135deg, #60a5fa, #818cf8)' : 'transparent',
                      color: renderMode === opt.value ? '#fff' : 'var(--text-secondary)',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20, opacity: 0.6, flexShrink: 0, marginTop: 2 }}>🎬</span>
              <div style={{ flex: 1 }}>
                <textarea
                  value={advancedScript}
                  onChange={e => onAdvancedScriptChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isDisabled}
                  placeholder={"고급 대본을 입력하세요...\n\n디렉티브 예시:\n투자자가 모니터를 본다. (배경: 어두운 사무실)(구도: 클로즈업)\n동료가 말한다. (화자: 여자)(이전씬유지)"}
                  style={{
                    width: '100%',
                    minHeight: 200,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: 'var(--text-primary)',
                    caretColor: '#38bdf8',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{
                  textAlign: 'right',
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: advancedScript.length >= 10000 ? '#f59e0b' : advancedScript.length >= 3000 ? '#60a5fa' : 'var(--text-tertiary)',
                  transition: 'color 0.2s ease',
                }}>
                  {advancedScript.length.toLocaleString()}자
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      <DirectiveGuideModal isOpen={showDirectiveGuide} onClose={() => setShowDirectiveGuide(false)} />
    </form>
  );
};

export default HeroInput;
