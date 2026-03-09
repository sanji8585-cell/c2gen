import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../hooks/useScrollReveal';

const FEATURES = [
  { key: 'scriptEngine', icon: '\uD83E\uDDE0', highlight: true },
  { key: 'multilingual', icon: '\uD83C\uDF10', highlight: false },
  { key: 'imageGen', icon: '\uD83C\uDFA8', highlight: false },
  { key: 'tts', icon: '\uD83C\uDF99\uFE0F', highlight: false },
  { key: 'videoAnim', icon: '\uD83C\uDFAC', highlight: false },
  { key: 'bgmThumb', icon: '\uD83C\uDFB5', highlight: false },
  { key: 'playground', icon: '\uD83D\uDD2C', highlight: true },
] as const;

const FeaturesSection: React.FC = () => {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollReveal(0.1);

  return (
    <section
      id="features"
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
            Features
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
            {t('landing.features.title')}
          </h2>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((feature, i) => {
            const delay = 0.15 + i * 0.08;

            if (feature.highlight) {
              return (
                <div
                  key={feature.key}
                  className="md:col-span-2 rounded-2xl p-[1.5px]"
                  style={{
                    background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateY(0)' : 'translateY(28px)',
                    transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
                  }}
                >
                  <div
                    className="rounded-2xl p-8 sm:p-10 h-full"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <div className="flex items-start gap-5">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                        style={{
                          background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(34,211,238,0.08))',
                        }}
                      >
                        <span role="img">{feature.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <h3
                          className="text-lg sm:text-xl font-bold mb-2"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t(`landing.features.${feature.key}`)}
                        </h3>
                        <p
                          className="text-sm sm:text-base leading-relaxed"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {t(`landing.features.${feature.key}Desc`)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={feature.key}
                className="rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateY(0)' : 'translateY(28px)',
                  transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(34,211,238,0.06))',
                    }}
                  >
                    <span role="img">{feature.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="text-base sm:text-lg font-semibold mb-1.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {t(`landing.features.${feature.key}`)}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t(`landing.features.${feature.key}Desc`)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
