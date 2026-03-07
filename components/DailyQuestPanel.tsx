import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyQuest } from '../types/gamification';

interface DailyQuestPanelProps {
  quests: DailyQuest[];
  onClaimReward: (questId: string) => void;
  isDark: boolean;
}

function getTimeUntilMidnight(): { hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

function formatCountdown(t: { hours: number; minutes: number; seconds: number }): string {
  const hh = String(t.hours).padStart(2, '0');
  const mm = String(t.minutes).padStart(2, '0');
  const ss = String(t.seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const DailyQuestPanel: React.FC<DailyQuestPanelProps> = ({ quests, onClaimReward, isDark }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(getTimeUntilMidnight());
  const panelRef = useRef<HTMLDivElement>(null);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getTimeUntilMidnight());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const unclaimedCount = quests.filter(q => q.completed && !q.rewardClaimed).length;

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const getProgressPercent = (quest: DailyQuest): number => {
    if (quest.target <= 0) return 100;
    return Math.min(100, Math.round((quest.progress / quest.target) * 100));
  };

  return (
    <div ref={panelRef} className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40" style={{ fontFamily: 'inherit' }}>
      {/* ── Floating Button ── */}
      <button
        onClick={handleToggle}
        className="relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none"
        style={{
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#fff',
        }}
        title={t('game.dailyQuest')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-7 h-7"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>

        {unclaimedCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold animate-pulse"
            style={{ background: '#ef4444', color: '#fff', fontSize: '11px' }}
          >
            {unclaimedCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      <div
        className="absolute bottom-16 right-0 w-[calc(100vw-2rem)] sm:w-80 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 origin-bottom-right"
        style={{
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-default, #e5e7eb)',
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(12px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: 'var(--bg-elevated, #f9fafb)',
            borderBottom: '1px solid var(--border-default, #e5e7eb)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">&#x1F5D3;</span>
            <span
              className="text-sm font-bold"
              style={{ color: 'var(--text-primary, #111827)' }}
            >
              {t('game.dailyQuest')}
            </span>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md"
            style={{
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              color: 'var(--text-secondary, #6b7280)',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatCountdown(countdown)}</span>
          </div>
        </div>

        {/* Quest List */}
        <div className="flex flex-col gap-2 p-3" style={{ maxHeight: '360px', overflowY: 'auto' }}>
          {quests.length === 0 && (
            <div
              className="text-center py-6 text-sm"
              style={{ color: 'var(--text-secondary, #6b7280)' }}
            >
              퀘스트가 없습니다
            </div>
          )}

          {quests.map(quest => {
            const pct = getProgressPercent(quest);
            const isClaimable = quest.completed && !quest.rewardClaimed;
            const isClaimed = quest.completed && quest.rewardClaimed;

            return (
              <div
                key={quest.questId}
                className="rounded-lg p-3 transition-colors duration-150"
                style={{
                  background: 'var(--bg-elevated, #f9fafb)',
                  border: isClaimable
                    ? '1px solid #f59e0b'
                    : '1px solid var(--border-default, #e5e7eb)',
                  boxShadow: isClaimable ? '0 0 8px rgba(245,158,11,0.25)' : 'none',
                }}
              >
                {/* Icon + Name row */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xl leading-none flex-shrink-0 mt-0.5">{quest.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: 'var(--text-primary, #111827)' }}
                    >
                      {quest.name}
                    </div>
                    <div
                      className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--text-secondary, #6b7280)' }}
                    >
                      {quest.description}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-secondary, #6b7280)' }}
                    >
                      {quest.progress}/{quest.target}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: pct >= 100
                          ? '#10b981'
                          : 'var(--text-secondary, #6b7280)',
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div
                    className="w-full h-2 rounded-full overflow-hidden"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 100
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                      }}
                    />
                  </div>
                </div>

                {/* Reward row */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-2 text-xs"
                    style={{ color: 'var(--text-secondary, #6b7280)' }}
                  >
                    {quest.rewardXp > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span style={{ color: '#8b5cf6' }}>&#x2728;</span>
                        {quest.rewardXp} XP
                      </span>
                    )}
                    {quest.rewardCredits > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span style={{ color: '#f59e0b' }}>&#x1FA99;</span>
                        {quest.rewardCredits}
                      </span>
                    )}
                  </div>

                  {isClaimed && (
                    <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#10b981' }}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('game.claimed')}
                    </div>
                  )}

                  {isClaimable && (
                    <button
                      onClick={() => onClaimReward(quest.questId)}
                      className="px-3 py-1 rounded-md text-xs font-bold text-white transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none"
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        boxShadow: '0 0 10px rgba(245,158,11,0.4)',
                        animation: 'questGlow 1.5s ease-in-out infinite alternate',
                      }}
                    >
                      {t('game.claimReward')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Glow animation keyframes */}
      <style>{`
        @keyframes questGlow {
          from { box-shadow: 0 0 6px rgba(245,158,11,0.3); }
          to   { box-shadow: 0 0 16px rgba(245,158,11,0.6); }
        }
      `}</style>
    </div>
  );
};

export default DailyQuestPanel;
