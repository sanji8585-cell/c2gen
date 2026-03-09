import React from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../../hooks/useScrollReveal';

const SAMPLES = [
  { id: 1, title: 'AI 경제 브리핑', titleEn: 'AI Economy Brief', genre: '\uACBD\uC81C', genreEn: 'Economy', minutes: 3, gradient: 'from-blue-500 to-cyan-400' },
  { id: 2, title: '테크 리뷰 2026', titleEn: 'Tech Review 2026', genre: '\uD14C\uD06C', genreEn: 'Tech', minutes: 4, gradient: 'from-purple-500 to-pink-400' },
  { id: 3, title: '세계 여행 가이드', titleEn: 'World Travel Guide', genre: '\uC5EC\uD589', genreEn: 'Travel', minutes: 5, gradient: 'from-green-500 to-emerald-400' },
  { id: 4, title: 'AI 트렌드 분석', titleEn: 'AI Trend Analysis', genre: '\uAD50\uC721', genreEn: 'Education', minutes: 3, gradient: 'from-orange-500 to-yellow-400' },
  { id: 5, title: '스타트업 뉴스', titleEn: 'Startup News', genre: '\uBE44\uC988\uB2C8\uC2A4', genreEn: 'Business', minutes: 2, gradient: 'from-red-500 to-rose-400' },
  { id: 6, title: '건강 습관 TOP 5', titleEn: 'Top 5 Health Habits', genre: '\uB77C\uC774\uD504', genreEn: 'Life', minutes: 4, gradient: 'from-indigo-500 to-violet-400' },
] as const;

const GallerySection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { ref, isVisible } = useScrollReveal(0.1);
  const isKo = i18n.language === 'ko';

  return (
    <section
      id="gallery"
      className="py-24 sm:py-32 px-6"
      ref={ref}
      style={{ backgroundColor: 'var(--bg-surface)' }}
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
            Gallery
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
            {t('landing.gallery.title')}
          </h2>
        </div>

        {/* Gallery grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SAMPLES.map((sample, i) => {
            const delay = 0.15 + i * 0.1;
            return (
              <div
                key={sample.id}
                className="group rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateY(0)' : 'translateY(28px)',
                  transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
                }}
              >
                {/* Thumbnail area — 16:9 ratio */}
                <div className={`relative aspect-video bg-gradient-to-br ${sample.gradient} overflow-hidden`}>
                  {/* Decorative pattern overlay */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.12) 0%, transparent 60%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.08) 0%, transparent 50%)',
                    }}
                  />

                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                      }}
                    >
                      <svg
                        className="w-6 h-6 text-white ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Genre badge */}
                  <div className="absolute top-3 left-3">
                    <span
                      className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.35)',
                        color: '#fff',
                      }}
                    >
                      {isKo ? sample.genre : sample.genreEn}
                    </span>
                  </div>
                </div>

                {/* Card info */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {isKo ? sample.title : sample.titleEn}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('landing.gallery.madeIn', { minutes: sample.minutes })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* More examples link */}
        <div
          className="text-center mt-12"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.7s ease 0.9s',
          }}
        >
          <button
            onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-colors duration-200 bg-transparent border-none cursor-pointer"
            style={{ color: '#0ea5e9' }}
          >
            {t('landing.gallery.moreExamples')}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
