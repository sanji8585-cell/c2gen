import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameEvent } from '../types/gamification';

interface EventBannerProps {
  events: GameEvent[];
  isDark: boolean;
}

/** Calculate remaining time string from now until endAt */
function getRemainingTime(endAt: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const end = new Date(endAt).getTime();
  const diff = end - now;
  if (diff <= 0) return t('event.ended');

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return t('event.remainingDaysHours', { days, hours });
  if (hours > 0) return t('event.remainingHoursMinutes', { hours, minutes });
  return t('event.remainingMinutes', { minutes });
}

/** Filter events that are currently active (within start/end range and isActive) */
function getActiveEvents(events: GameEvent[]): GameEvent[] {
  const now = Date.now();
  return events.filter(e => {
    if (!e.isActive) return false;
    const start = new Date(e.startAt).getTime();
    const end = new Date(e.endAt).getTime();
    return now >= start && now <= end;
  });
}

const EventBanner: React.FC<EventBannerProps> = ({ events, isDark }) => {
  const { t } = useTranslation();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Update countdown every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const handleDismiss = useCallback((eventId: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }, []);

  const activeEvents = getActiveEvents(events).filter(e => !dismissedIds.has(e.id));

  if (activeEvents.length === 0) return null;

  return (
    <div className="w-full">
      {activeEvents.map(event => (
        <div
          key={event.id}
          className="relative flex items-center justify-center gap-3 px-4 overflow-hidden"
          style={{
            height: '36px',
            background: isDark
              ? 'linear-gradient(90deg, #7c3aed 0%, #db2777 50%, #f59e0b 100%)'
              : 'linear-gradient(90deg, #8b5cf6 0%, #ec4899 50%, #f59e0b 100%)',
          }}
        >
          {/* Event icon */}
          <span className="text-base leading-none flex-shrink-0">{event.icon}</span>

          {/* Event name */}
          <span
            className="text-white text-xs font-semibold truncate max-w-[120px] sm:max-w-[200px]"
          >
            {event.name}
          </span>

          {/* XP multiplier badge */}
          {event.xpMultiplier > 1 && (
            <span
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
              style={{
                background: 'rgba(255,255,255,0.25)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
              }}
            >
              XP x{event.xpMultiplier}
            </span>
          )}

          {/* Drop rate multiplier badge */}
          {event.dropRateMultiplier > 1 && (
            <span
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
              }}
            >
              DROP x{event.dropRateMultiplier}
            </span>
          )}

          {/* Remaining time */}
          <span className="text-white/80 text-[10px] flex-shrink-0 hidden sm:inline">
            {getRemainingTime(event.endAt, t)}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => handleDismiss(event.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors p-0.5 leading-none w-6 h-6 flex items-center justify-center"
            aria-label={t('common.close')}
            style={{ fontSize: '14px', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
};

export default EventBanner;
