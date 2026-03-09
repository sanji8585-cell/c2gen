import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface CTAFooterSectionProps {
  onOpenAuth: () => void;
}

const CTAFooterSection: React.FC<CTAFooterSectionProps> = ({ onOpenAuth }) => {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollReveal(0.15);

  return (
    <>
      {/* CTA Block */}
      <section
        id="cta"
        ref={ref}
        className="relative py-24 sm:py-32 px-6 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 60%, #0c4a6e 100%)',
        }}
      >
        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          }}
        />

        <div
          className="relative max-w-3xl mx-auto text-center"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
            {t('landing.cta.headline')}
          </h2>
          <p
            className="text-base sm:text-lg leading-relaxed mb-10 max-w-2xl mx-auto"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            {t('landing.cta.subtitle')}
          </p>
          <button
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-base font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg"
            style={{
              backgroundColor: '#fff',
              color: '#0284c7',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            {t('landing.cta.button')}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-10 px-6"
        style={{
          backgroundColor: 'var(--bg-base)',
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            {/* Logo + tagline */}
            <div className="flex items-center gap-3">
              <span
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                C2 GEN
              </span>
              <span
                className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('landing.footer.tagline')}
              </span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm transition-colors duration-200 hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('landing.footer.terms')}
              </a>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm transition-colors duration-200 hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('landing.footer.privacy')}
              </a>
              <a
                href="mailto:contact@c2gen.com"
                className="text-sm transition-colors duration-200 hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('landing.footer.contact')}
              </a>
            </div>
          </div>

          {/* Copyright */}
          <div className="text-center">
            <span
              className="text-xs"
              style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
            >
              &copy; 2026 C2 GEN. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
};

export default CTAFooterSection;
