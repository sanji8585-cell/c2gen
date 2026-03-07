import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Achievement, AchievementCategory, UserAchievement } from '../types/gamification';

// ── Props ──

interface AchievementShowcaseProps {
  isOpen: boolean;
  onClose: () => void;
  achievements: {
    definitions: Achievement[];
    progress: Record<string, UserAchievement>;
    newlyUnlocked: string[];
  };
  isDark: boolean;
}

// ── Category config ──

type CategoryFilter = 'all' | AchievementCategory;

interface CategoryMeta {
  key: CategoryFilter;
  label: string;
  color: string;      // Tailwind ring / border accent
  bgColor: string;    // Tailwind background for active tab
  textColor: string;  // Tailwind text for active tab
}

const CATEGORY_I18N_KEYS: Record<CategoryFilter, string> = {
  all: 'game.categoryAll',
  creation: 'game.categoryCreation',
  exploration: 'game.categoryExploration',
  dedication: 'game.categoryDedication',
  mastery: 'game.categoryMastery',
  hidden: 'game.categoryHidden',
};

const CATEGORIES: CategoryMeta[] = [
  { key: 'all',         label: '전체',     color: 'blue',   bgColor: 'bg-blue-600',   textColor: 'text-white' },
  { key: 'creation',    label: '창작',     color: 'blue',   bgColor: 'bg-blue-600',   textColor: 'text-white' },
  { key: 'exploration', label: '탐험',     color: 'green',  bgColor: 'bg-green-600',  textColor: 'text-white' },
  { key: 'dedication',  label: '헌신',     color: 'orange', bgColor: 'bg-orange-500',  textColor: 'text-white' },
  { key: 'mastery',     label: '마스터리', color: 'purple', bgColor: 'bg-purple-600',  textColor: 'text-white' },
  { key: 'hidden',      label: '히든',     color: 'gray',   bgColor: 'bg-gray-600',   textColor: 'text-white' },
];

const CATEGORY_RING: Record<string, string> = {
  blue:   'ring-blue-400',
  green:  'ring-green-400',
  orange: 'ring-orange-400',
  purple: 'ring-purple-400',
  gray:   'ring-gray-400',
};

const CATEGORY_BORDER: Record<string, string> = {
  blue:   'border-blue-500',
  green:  'border-green-500',
  orange: 'border-orange-500',
  purple: 'border-purple-500',
  gray:   'border-gray-500',
};

const CATEGORY_BG_SUBTLE_DARK: Record<string, string> = {
  blue:   'bg-blue-900/30',
  green:  'bg-green-900/30',
  orange: 'bg-orange-900/30',
  purple: 'bg-purple-900/30',
  gray:   'bg-gray-800/30',
};

const CATEGORY_BG_SUBTLE_LIGHT: Record<string, string> = {
  blue:   'bg-blue-50',
  green:  'bg-green-50',
  orange: 'bg-orange-50',
  purple: 'bg-purple-50',
  gray:   'bg-gray-50',
};

const CATEGORY_PROGRESS_BAR: Record<string, string> = {
  blue:   'bg-blue-500',
  green:  'bg-green-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  gray:   'bg-gray-500',
};

function getCategoryColor(category: AchievementCategory): string {
  switch (category) {
    case 'creation':    return 'blue';
    case 'exploration': return 'green';
    case 'dedication':  return 'orange';
    case 'mastery':     return 'purple';
    case 'hidden':      return 'gray';
  }
}

// ── Helpers ──

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

// ── Keyframes injected once ──

const GOLDEN_GLOW_STYLE_ID = 'achievement-showcase-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(GOLDEN_GLOW_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GOLDEN_GLOW_STYLE_ID;
  style.textContent = `
    @keyframes achievement-golden-glow {
      0%, 100% {
        box-shadow: 0 0 8px 2px rgba(250, 204, 21, 0.4), 0 0 20px 4px rgba(250, 204, 21, 0.15);
      }
      50% {
        box-shadow: 0 0 16px 6px rgba(250, 204, 21, 0.6), 0 0 36px 8px rgba(250, 204, 21, 0.25);
      }
    }
    .achievement-glow-new {
      animation: achievement-golden-glow 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

// ── Component ──

const AchievementShowcase: React.FC<AchievementShowcaseProps> = ({
  isOpen,
  onClose,
  achievements,
  isDark,
}) => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');

  // Inject keyframe styles on mount
  React.useEffect(() => {
    ensureKeyframes();
  }, []);

  // Filtered & sorted list
  const filtered = useMemo(() => {
    const defs = [...achievements.definitions].sort((a, b) => a.sortOrder - b.sortOrder);
    if (activeCategory === 'all') return defs;
    return defs.filter((d) => d.category === activeCategory);
  }, [achievements.definitions, activeCategory]);

  // Counts
  const totalActive = achievements.definitions.filter((d) => d.isActive).length;
  const unlockedCount = Object.values(achievements.progress).filter((p) => p.unlocked).length;

  if (!isOpen) return null;

  // ── Theme variables ──
  const overlayBg = 'bg-black/60';
  const panelBg = isDark ? 'bg-gray-900' : 'bg-white';
  const panelBorder = isDark ? 'border-gray-700' : 'border-gray-200';
  const textPrimary = isDark ? 'text-gray-100' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const cardBorder = isDark ? 'border-gray-700' : 'border-gray-200';
  const tabInactiveBg = isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';
  const progressTrackBg = isDark ? 'bg-gray-700' : 'bg-gray-200';
  const badgeBg = isDark ? 'bg-gray-700' : 'bg-gray-100';
  const closeBtnClass = isDark
    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${overlayBg} backdrop-blur-sm`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] mx-2 sm:mx-4 rounded-2xl border ${panelBg} ${panelBorder} shadow-2xl flex flex-col overflow-hidden`}
        style={{
          '--achievement-gold': '#facc15',
          '--achievement-gold-glow': 'rgba(250, 204, 21, 0.4)',
        } as React.CSSProperties}
      >
        {/* ── Header ── */}
        <div className={`flex-shrink-0 px-4 py-4 sm:px-6 sm:py-5 border-b ${panelBorder}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label="trophy">
                🏆
              </span>
              <div>
                <h2 className={`text-xl font-bold ${textPrimary}`}>{t('header.achievements')}</h2>
                <p className={`text-sm ${textSecondary} mt-0.5`}>
                  <span className="font-semibold text-yellow-500">{unlockedCount}</span>
                  {' / '}
                  <span>{totalActive}</span>
                  {' '}{t('game.achievementsUnlocked')}
                </p>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${closeBtnClass}`}
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Category Tabs ── */}
          <div className="flex flex-wrap gap-2 mt-4">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? `${cat.bgColor} ${cat.textColor} shadow-md`
                      : tabInactiveBg
                  }`}
                >
                  {t(CATEGORY_I18N_KEYS[cat.key])}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Achievement Grid ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {filtered.length === 0 ? (
            <div className={`text-center py-16 ${textMuted}`}>
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm">{t('game.noAchievementsInCategory')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((def) => {
                const userAch = achievements.progress[def.id];
                const isUnlocked = userAch?.unlocked ?? false;
                const isNewlyUnlocked = achievements.newlyUnlocked.includes(def.id);
                const isHiddenLocked = def.isHidden && !isUnlocked;
                const progress = userAch?.progress ?? 0;
                const progressPct = Math.min(100, Math.round((progress / def.conditionTarget) * 100));
                const catColor = getCategoryColor(def.category);

                // Hidden + locked => mystery card
                if (isHiddenLocked) {
                  return (
                    <div
                      key={def.id}
                      className={`rounded-xl border ${cardBorder} p-4 flex flex-col items-center justify-center text-center ${
                        isDark ? 'bg-gray-800/50' : 'bg-gray-50'
                      } opacity-60`}
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                        isDark ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <span className={`text-2xl ${textMuted}`}>???</span>
                      </div>
                      <p className={`text-sm font-medium ${textMuted}`}>{t('game.hiddenAchievement')}</p>
                      <p className={`text-xs mt-1 ${textMuted}`}>{t('game.hiddenAchievementDesc')}</p>
                    </div>
                  );
                }

                // Unlocked or in-progress
                return (
                  <div
                    key={def.id}
                    className={`rounded-xl border p-4 transition-all duration-300 ${
                      isUnlocked
                        ? `${cardBg} ${CATEGORY_BORDER[catColor]} border-l-4`
                        : `${cardBg} ${cardBorder} opacity-65`
                    } ${isNewlyUnlocked ? 'achievement-glow-new' : ''}`}
                  >
                    {/* Top row: icon + info */}
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl ring-2 ${
                          isUnlocked
                            ? `${CATEGORY_RING[catColor]} ${isDark ? CATEGORY_BG_SUBTLE_DARK[catColor] : CATEGORY_BG_SUBTLE_LIGHT[catColor]}`
                            : `ring-gray-300 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`
                        }`}
                      >
                        {isUnlocked ? (
                          <span>{def.icon}</span>
                        ) : (
                          <span className="opacity-40 grayscale">{def.icon}</span>
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-sm font-semibold leading-tight truncate ${
                            isUnlocked ? textPrimary : textSecondary
                          }`}
                        >
                          {def.name}
                        </h3>
                        <p
                          className={`text-xs mt-0.5 line-clamp-2 ${
                            isUnlocked ? textSecondary : textMuted
                          }`}
                        >
                          {def.description}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar (in-progress only) */}
                    {!isUnlocked && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs ${textMuted}`}>{t('game.progress')}</span>
                          <span className={`text-xs font-medium ${textSecondary}`}>
                            {progress} / {def.conditionTarget}
                          </span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden ${progressTrackBg}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${CATEGORY_PROGRESS_BAR[catColor]}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Rewards + unlock date */}
                    {isUnlocked && (
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          {def.rewardXp > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeBg} ${textSecondary}`}
                            >
                              <span className="text-yellow-500">&#9733;</span>
                              {def.rewardXp} XP
                            </span>
                          )}
                          {def.rewardCredits > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeBg} ${textSecondary}`}
                            >
                              <span className="text-emerald-500">&#9670;</span>
                              {def.rewardCredits} {t('common.credits')}
                            </span>
                          )}
                          {(def.rewardGachaTickets ?? 0) > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeBg} ${textSecondary}`}
                            >
                              <span className="text-purple-500">&#127903;</span>
                              {def.rewardGachaTickets}
                            </span>
                          )}
                        </div>

                        {userAch?.unlockedAt && (
                          <span className={`text-xs ${textMuted} whitespace-nowrap ml-2`}>
                            {formatDate(userAch.unlockedAt)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Rewards preview for in-progress */}
                    {!isUnlocked && (def.rewardXp > 0 || def.rewardCredits > 0) && (
                      <div className={`mt-2 flex items-center gap-2 ${textMuted} text-xs`}>
                        <span>{t('game.reward')}:</span>
                        {def.rewardXp > 0 && <span>{def.rewardXp} XP</span>}
                        {def.rewardXp > 0 && def.rewardCredits > 0 && <span>+</span>}
                        {def.rewardCredits > 0 && <span>{def.rewardCredits} {t('common.credits')}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AchievementShowcase;
