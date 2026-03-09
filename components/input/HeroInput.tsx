import React, { useState, useEffect, useRef } from 'react';
import { GenerationStep } from '../../types';

interface HeroInputProps {
  activeTab: 'auto' | 'manual';
  onTabChange: (tab: 'auto' | 'manual') => void;
  topic: string;
  onTopicChange: (v: string) => void;
  manualScript: string;
  onManualScriptChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  step: GenerationStep;
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
  onSubmit,
  step,
}) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderOpacity, setPlaceholderOpacity] = useState(1);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDisabled = step !== GenerationStep.IDLE && step !== GenerationStep.ERROR && step !== GenerationStep.COMPLETED;
  const isProcessing = step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS;
  const isReviewing = step === GenerationStep.SCRIPT_REVIEW;

  const canSubmit = !isDisabled && (
    activeTab === 'auto' ? topic.trim().length > 0 : manualScript.trim().length > 0
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
        {/* Top row: icon + input */}
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

        {/* Bottom row: tabs + button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
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
            {(['auto', 'manual'] as const).map(tab => {
              const isActive = activeTab === tab;
              const label = tab === 'auto' ? '자동' : '수동';
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

        {/* Manual textarea */}
        {activeTab === 'manual' && (
          <div style={{ marginTop: 16 }}>
            <textarea
              value={manualScript}
              onChange={e => onManualScriptChange(e.target.value)}
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
        )}
      </div>
      </div>
    </form>
  );
};

export default HeroInput;
