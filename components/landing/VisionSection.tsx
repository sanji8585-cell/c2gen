import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../hooks/useScrollReveal';

const BLOCKS = [
  { key: 'techStack', icon: '\u26A1' },
  { key: 'scalability', icon: '\uD83D\uDCC8' },
  { key: 'market', icon: '\uD83C\uDF0D' },
] as const;

const VisionSection: React.FC = () => {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollReveal(0.15);

  return (
    <section
      id="vision"
      className="py-24 sm:py-32 px-6"
      ref={ref}
      style={{ backgroundColor: 'var(--bg-elevated)' }}
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
            Vision
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
            {t('landing.vision.title')}
          </h2>
        </div>

        {/* Vision blocks */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 rounded-2xl overflow-hidden"
          style={{
            border: '1px solid var(--border-default)',
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(28px)',
            transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s',
          }}
        >
          {BLOCKS.map((block, i) => (
            <div
              key={block.key}
              className={`p-8 sm:p-10 ${i < BLOCKS.length - 1 ? 'border-b md:border-b-0 md:border-r' : ''}`}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(34,211,238,0.06))',
                }}
              >
                <span role="img">{block.icon}</span>
              </div>
              <h3
                className="text-lg font-semibold mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                {t(`landing.vision.${block.key}`)}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t(`landing.vision.${block.key}Desc`)}
              </p>
            </div>
          ))}
        </div>

        {/* Partnership CTA */}
        <div
          className="text-center mt-14"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.7s ease 0.6s',
          }}
        >
          <p
            className="text-sm leading-relaxed mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('landing.vision.partnership')}
          </p>
          <a
            href="mailto:contact@c2gen.com"
            className="inline-flex items-center gap-2 text-sm font-semibold transition-colors duration-200"
            style={{ color: 'var(--color-brand-500, #0ea5e9)' }}
          >
            contact@c2gen.com
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
};

export default VisionSection;
