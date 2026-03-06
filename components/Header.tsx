
import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LevelInfo, EquippedItems } from '../types/gamification';
import { getSoundEnabled, setSoundEnabled } from '../services/soundService';
import AvatarFrame from './AvatarFrame';

const FourLeafClover: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* 상단 잎 */}
    <path d="M50 12C50 12 38 20 38 32C38 40 43 46 50 48C57 46 62 40 62 32C62 20 50 12 50 12Z" fill="url(#leaf1)" />
    {/* 우측 잎 */}
    <path d="M88 50C88 50 80 38 68 38C60 38 54 43 52 50C54 57 60 62 68 62C80 62 88 50 88 50Z" fill="url(#leaf2)" />
    {/* 하단 잎 */}
    <path d="M50 88C50 88 62 80 62 68C62 60 57 54 50 52C43 54 38 60 38 68C38 80 50 88 50 88Z" fill="url(#leaf3)" />
    {/* 좌측 잎 */}
    <path d="M12 50C12 50 20 62 32 62C40 62 46 57 48 50C46 43 40 38 32 38C20 38 12 50 12 50Z" fill="url(#leaf4)" />
    {/* 중심 원 */}
    <circle cx="50" cy="50" r="5" fill="#fbbf24" />
    {/* 줄기 */}
    <path d="M50 55C50 55 52 70 56 80" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="leaf1" x1="50" y1="12" x2="50" y2="48">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf2" x1="88" y1="50" x2="52" y2="50">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf3" x1="50" y1="88" x2="50" y2="52">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf4" x1="12" y1="50" x2="48" y2="50">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
    </defs>
  </svg>
);

const SoundToggle: React.FC = () => {
  const [on, setOn] = useState(getSoundEnabled);
  return (
    <button
      onClick={() => { const next = !on; setSoundEnabled(next); setOn(next); }}
      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
      style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      title={on ? '효과음 끄기' : '효과음 켜기'}
    >
      {on ? (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--text-secondary)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
        </svg>
      ) : (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      )}
    </button>
  );
};

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  streak?: number;
  totalGenerations?: number;
  sessionCombo?: number;
  // 게이미피케이션 v2
  levelInfo?: LevelInfo | null;
  equipped?: EquippedItems | null;
  userName?: string;
  onLogoAchievement?: () => void;
}

const Header: React.FC<HeaderProps> = ({ isDark, onToggleTheme, streak = 0, totalGenerations = 0, sessionCombo = 0, levelInfo, equipped, userName, onLogoAchievement }) => {
  // 이스터에그: 로고 5회 빠른 클릭 → 무지개 회전
  const [easterEgg, setEasterEgg] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // stale closure 방지: 항상 최신 prop을 ref로 참조
  const onLogoAchievementRef = useRef(onLogoAchievement);
  useEffect(() => { onLogoAchievementRef.current = onLogoAchievement; });

  const handleLogoClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setEasterEgg(true);
      setTimeout(() => setEasterEgg(false), 2000);
      onLogoAchievementRef.current?.();
    } else {
      clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0; }, 1200);
    }
  }, []);

  return (
    <header className="border-b backdrop-blur-md sticky top-0 z-50" style={{ borderColor: 'var(--border-default)', backgroundColor: isDark ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.8)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 bg-gradient-to-br from-green-900/60 to-emerald-900/60 rounded-xl flex items-center justify-center shadow-lg shadow-green-900/30 border border-green-700/30 cursor-pointer select-none"
            onClick={handleLogoClick}
            title="C2 GEN"
          >
            <FourLeafClover className={`w-7 h-7 ${easterEgg ? 'animate-rainbow-spin' : ''}`} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-green-300 via-emerald-200 to-white' : 'from-green-600 via-emerald-500 to-slate-800'}`}>
              C2
            </span>
            <span className={`text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-white to-slate-400' : 'from-slate-800 to-slate-500'}`}>
              GEN
            </span>
          </div>
          {/* Streak / Milestone 뱃지 */}
          {streak >= 2 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hidden sm:inline-flex">
              🔥 {streak}일 연속
            </span>
          )}
          {totalGenerations >= 5 && (
            <span className="ml-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 hidden sm:inline-flex">
              ⚡ {totalGenerations}개 생성
            </span>
          )}
          {/* 프레임 아바타 */}
          {equipped?.frame && userName && (
            <div className="ml-1 hidden sm:block">
              <AvatarFrame name={userName} size={26} rarity={equipped.frame.rarity} frameName={equipped.frame.name} />
            </div>
          )}
          {/* 레벨 뱃지 — 서버 동기화 시에만 표시 */}
          {levelInfo && (() => {
            const lv = levelInfo.level;
            const lTitle = equipped?.title?.name || levelInfo.title || '';
            const lEmoji = levelInfo.emoji || '';
            const lColor = levelInfo.color || '#06b6d4';
            const lProgress = levelInfo.progress;
            return (
              <div className="ml-1 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${lColor}20`, color: lColor, border: `1px solid ${lColor}50` }}>
                  {lEmoji} Lv.{lv}{lTitle ? <span className="hidden sm:inline"> {lTitle}</span> : ''}
                </span>
                <div className="hidden sm:block w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full xp-bar-fill" style={{ width: `${lProgress}%`, backgroundColor: lColor }} />
                </div>
              </div>
            );
          })()}
          {/* 장착된 뱃지 표시 */}
          {equipped?.badges && equipped.badges.length > 0 && (
            <div className="ml-0.5 flex items-center gap-0.5">
              {equipped.badges.slice(0, 3).map(b => (
                <span key={b.id} className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25" title={b.name}>
                  {b.emoji}
                </span>
              ))}
            </div>
          )}
          {sessionCombo >= 2 && (
            <span key={sessionCombo} className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-combo-pop hidden sm:inline-flex">
              ⚡ {sessionCombo}x 콤보
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 사운드 토글 */}
          <SoundToggle />
          {/* 테마 토글 */}
          <button
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            title={isDark ? '라이트 모드' : '다크 모드'}
          >
            {isDark ? (
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <path strokeLinecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07 7.07l-1.41-1.41M8.34 8.34L6.93 6.93m12.14 0l-1.41 1.41M8.34 15.66l-1.41 1.41" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            AI Content Studio
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
