import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../hooks/useScrollReveal';

const STEPS = [
  { icon: '\u2328\uFE0F', titleKey: 'step1Title', descKey: 'step1Desc' },
  { icon: '\uD83D\uDCDD', titleKey: 'step2Title', descKey: 'step2Desc' },
  { icon: '\uD83C\uDFA8', titleKey: 'step3Title', descKey: 'step3Desc' },
  { icon: '\uD83C\uDFAC', titleKey: 'step4Title', descKey: 'step4Desc' },
] as const;

const WorkflowSection: React.FC = () => {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollReveal(0.15);

  return (
    <section
      id="workflow"
      className="py-24 sm:py-32 px-6"
      ref={ref}
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16 sm:mb-20">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide mb-4 uppercase"
            style={{
              backgroundColor: 'rgba(14,165,233,0.06)',
              color: '#0ea5e9',
              border: '1px solid rgba(14,165,233,0.1)',
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
              transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            Workflow
          </div>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight"
            style={{
              color: 'var(--text-primary)',
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s',
            }}
          >
            {t('landing.workflow.title')}
          </h2>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6 relative">
          {/* Connecting line (desktop only) */}
          <div
            className="hidden md:block absolute top-14 left-[16%] right-[16%] h-px"
            style={{
              background: isVisible
                ? 'linear-gradient(90deg, transparent, rgba(14,165,233,0.25) 15%, rgba(14,165,233,0.25) 85%, transparent)'
                : 'transparent',
              transition: 'background 1s ease 0.5s',
            }}
          />

          {/* Connecting dots on the line (desktop only) */}
          {isVisible && (
            <div className="hidden md:block absolute top-14 left-[16%] right-[16%] pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: '#0ea5e9',
                    left: `${(i / 3) * 100}%`,
                    top: '-3px',
                    transform: 'translateX(-50%)',
                    opacity: isVisible ? 0.5 : 0,
                    transition: `opacity 0.4s ease ${0.6 + i * 0.15}s`,
                    boxShadow: '0 0 8px rgba(14,165,233,0.4)',
                  }}
                />
              ))}
            </div>
          )}

          {STEPS.map((step, i) => (
            <div
              key={step.titleKey}
              className="relative flex flex-col items-center text-center group"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(32px)',
                transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${0.2 + i * 0.15}s`,
              }}
            >
              {/* Step number badge */}
              <div
                className="absolute -top-1 -right-1 md:right-auto md:-top-2 md:left-1/2 md:ml-8 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-20"
                style={{
                  backgroundColor: '#0ea5e9',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(14,165,233,0.3)',
                }}
              >
                {i + 1}
              </div>

              {/* Icon container */}
              <div
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl mb-5 relative z-10 transition-all duration-300 group-hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1.5px solid var(--border-default)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <span role="img">{step.icon}</span>
              </div>

              {/* Title */}
              <h3
                className="text-base sm:text-lg font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {t(`landing.workflow.${step.titleKey}`)}
              </h3>

              {/* Description */}
              <p
                className="text-sm leading-relaxed max-w-[200px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t(`landing.workflow.${step.descKey}`)}
              </p>

              {/* Arrow between steps on mobile */}
              {i < STEPS.length - 1 && (
                <div
                  className="md:hidden mt-6 mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WorkflowSection;
