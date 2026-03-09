import React from 'react';
import { useTranslation } from 'react-i18next';

interface HeroSectionProps {
  onOpenAuth: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onOpenAuth }) => {
  const { t } = useTranslation();

  const scrollToGallery = () => {
    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          opacity: 0.06,
          maskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)',
        }}
      />

      {/* Radial gradient glow from top center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(14,165,233,0.14) 0%, transparent 65%)',
        }}
      />

      {/* Secondary subtle glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle 400px at 30% 60%, rgba(14,165,233,0.04) 0%, transparent 100%), radial-gradient(circle 300px at 75% 45%, rgba(14,165,233,0.03) 0%, transparent 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide mb-8"
          style={{
            backgroundColor: 'rgba(14,165,233,0.08)',
            color: '#0ea5e9',
            border: '1px solid rgba(14,165,233,0.15)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: '#0ea5e9', boxShadow: '0 0 6px rgba(14,165,233,0.6)' }}
          />
          AI Video Generation Platform
        </div>

        {/* Headline */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.08] tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('landing.hero.headline')}
        </h1>

        {/* Subtitle */}
        <p
          className="mt-6 text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('landing.hero.subtitle')}
        </p>

        {/* Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {/* Primary CTA */}
          <button
            onClick={onOpenAuth}
            className="group relative px-8 py-4 text-base sm:text-lg font-semibold rounded-xl text-white transition-all duration-300 hover:shadow-2xl"
            style={{
              backgroundColor: '#0ea5e9',
              boxShadow: '0 4px 20px rgba(14,165,233,0.3), 0 1px 3px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0284c7';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(14,165,233,0.4), 0 2px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0ea5e9';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,165,233,0.3), 0 1px 3px rgba(0,0,0,0.1)';
            }}
          >
            {t('landing.hero.cta')}
            <svg className="inline-block ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          {/* Secondary CTA */}
          <button
            onClick={scrollToGallery}
            className="px-8 py-4 rounded-xl text-base sm:text-lg font-medium transition-all duration-300"
            style={{
              border: '1.5px solid var(--border-default)',
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0ea5e9';
              e.currentTarget.style.color = '#0ea5e9';
              e.currentTarget.style.backgroundColor = 'rgba(14,165,233,0.04)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {t('landing.hero.ctaSecondary')}
          </button>
        </div>

        {/* Scroll indicator */}
        <div className="mt-16 sm:mt-20 flex flex-col items-center gap-2 animate-fade-sub">
          <svg
            className="w-5 h-5"
            style={{ color: 'var(--text-muted)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
