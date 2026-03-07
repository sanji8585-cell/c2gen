import React from 'react';
import { useTranslation } from 'react-i18next';

interface LeaderboardWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  userLevel: number;
  userXp: number;
  userStreak: number;
  isDark: boolean;
}

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string | number;
  accent: string;
  isDark: boolean;
}> = ({ icon, label, value, accent, isDark }) => (
  <div
    className="flex flex-col items-center gap-1 p-2 sm:p-4 rounded-xl flex-1 min-w-0"
    style={{
      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
    }}
  >
    <span className="text-2xl">{icon}</span>
    <span
      className="text-lg sm:text-xl font-bold"
      style={{ color: accent }}
    >
      {value}
    </span>
    <span
      className="text-[11px] font-medium"
      style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}
    >
      {label}
    </span>
  </div>
);

const LeaderboardWidget: React.FC<LeaderboardWidgetProps> = ({
  isOpen,
  onClose,
  userLevel,
  userXp,
  userStreak,
  isDark,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <h3
              className="text-base font-bold"
              style={{ color: isDark ? '#e2e8f0' : '#1e293b' }}
            >
              {t('game.leaderboardTitle')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
            }}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-5 space-y-5">
          {/* Section: 내 기록 */}
          <div>
            <p
              className="text-xs font-semibold mb-3 tracking-wide uppercase"
              style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}
            >
              {t('game.myRecord')}
            </p>
            <div className="flex gap-3">
              <StatCard
                icon="⭐"
                label={t('game.level')}
                value={userLevel}
                accent="#f59e0b"
                isDark={isDark}
              />
              <StatCard
                icon="✨"
                label={t('game.xp')}
                value={userXp.toLocaleString()}
                accent="#8b5cf6"
                isDark={isDark}
              />
              <StatCard
                icon="🔥"
                label={t('game.streak')}
                value={`${userStreak}${t('game.days')}`}
                accent="#ef4444"
                isDark={isDark}
              />
            </div>
          </div>

          {/* Placeholder: 전체 순위 (준비 중) */}
          <div>
            <p
              className="text-xs font-semibold mb-3 tracking-wide uppercase"
              style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}
            >
              {t('game.globalRanking')}
            </p>
            <div
              className="flex flex-col items-center justify-center py-8 rounded-xl"
              style={{
                background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              }}
            >
              <span className="text-3xl mb-2">🚧</span>
              <p
                className="text-sm font-medium"
                style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}
              >
                {t('game.leaderboardComingSoon')}
              </p>
              <p
                className="text-[11px] mt-1"
                style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }}
              >
                {t('game.leaderboardComingSoonDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardWidget;
