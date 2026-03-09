import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface LandingNavProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenAuth: () => void;
}

const NAV_SECTIONS = ['workflow', 'features', 'gallery'] as const;

const LandingNav: React.FC<LandingNavProps> = ({ isDark, onToggleTheme, onOpenAuth }) => {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleLang = useCallback(() => {
    const next = i18n.language === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(next);
    localStorage.setItem('tubegen_ui_language', next);
  }, [i18n]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  }, []);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled
            ? 'color-mix(in srgb, var(--bg-base) 80%, transparent)'
            : 'transparent',
          backdropFilter: scrolled ? 'blur(16px) saturate(1.4)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(1.4)' : 'none',
          borderBottom: scrolled ? '1px solid var(--border-subtle)' : '1px solid transparent',
          boxShadow: scrolled ? '0 1px 12px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 group"
            aria-label="Scroll to top"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: 'rgba(14,165,233,0.12)' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" style={{ color: '#0ea5e9' }} fill="currentColor">
                <path d="M12 2C9.243 2 7 4.243 7 7c0 1.052.332 2.026.893 2.836C5.678 10.453 4 12.538 4 15c0 2.757 2.243 5 5 5 1.052 0 2.026-.332 2.836-.893C11.453 21.322 12 22.538 12 24c0-1.462.547-2.678 1.164-4.893C13.974 19.668 15.948 20 17 20c2.757 0 5-2.243 5-5 0-2.462-1.678-4.547-3.893-5.164C18.668 9.026 19 8.052 19 7c0-2.757-2.243-5-5-5-1.052 0-2.026.332-2.836.893C11.547.678 12-.538 12 2z"/>
              </svg>
            </div>
            <span
              className="font-bold text-lg tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              C2 <span style={{ color: '#0ea5e9' }}>GEN</span>
            </span>
          </button>

          {/* Desktop nav links */}
          <div
            className="hidden md:flex items-center gap-1"
          >
            {NAV_SECTIONS.map((section) => (
              <button
                key={section}
                onClick={() => scrollTo(section)}
                className="px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-brand-500/10"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0ea5e9')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {t(`landing.${section}.title`)}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 uppercase tracking-wider"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {i18n.language === 'ko' ? 'EN' : 'KO'}
            </button>

            {/* Theme toggle */}
            <button
              onClick={onToggleTheme}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* CTA button */}
            <button
              onClick={onOpenAuth}
              className="hidden sm:block px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 hover:shadow-lg"
              style={{
                backgroundColor: '#0ea5e9',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(14,165,233,0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0284c7';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,165,233,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0ea5e9';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(14,165,233,0.25)';
              }}
            >
              {t('landing.hero.cta')}
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-9 h-9 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Toggle menu"
            >
              <span
                className="block w-4.5 h-0.5 rounded-full transition-all duration-300"
                style={{
                  width: '18px',
                  height: '2px',
                  backgroundColor: 'currentColor',
                  transform: mobileOpen ? 'rotate(45deg) translateY(3.5px)' : 'none',
                }}
              />
              <span
                className="block w-4.5 h-0.5 rounded-full transition-all duration-300"
                style={{
                  width: '18px',
                  height: '2px',
                  backgroundColor: 'currentColor',
                  opacity: mobileOpen ? 0 : 1,
                }}
              />
              <span
                className="block w-4.5 h-0.5 rounded-full transition-all duration-300"
                style={{
                  width: '18px',
                  height: '2px',
                  backgroundColor: 'currentColor',
                  transform: mobileOpen ? 'rotate(-45deg) translateY(-3.5px)' : 'none',
                }}
              />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div
        className="fixed top-16 left-0 right-0 z-40 md:hidden transition-all duration-300 overflow-hidden"
        style={{
          maxHeight: mobileOpen ? '280px' : '0',
          opacity: mobileOpen ? 1 : 0,
          backgroundColor: 'color-mix(in srgb, var(--bg-base) 92%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: mobileOpen ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col gap-1">
          {NAV_SECTIONS.map((section) => (
            <button
              key={section}
              onClick={() => scrollTo(section)}
              className="w-full text-left px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {t(`landing.${section}.title`)}
            </button>
          ))}
          <button
            onClick={() => { onOpenAuth(); setMobileOpen(false); }}
            className="w-full mt-2 px-4 py-3 text-sm font-semibold rounded-lg text-white text-center"
            style={{ backgroundColor: '#0ea5e9' }}
          >
            {t('landing.hero.cta')}
          </button>
        </div>
      </div>
    </>
  );
};

export default LandingNav;
