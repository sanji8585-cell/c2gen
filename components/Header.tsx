
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LevelInfo, EquippedItems } from '../types/gamification';
import { getSoundEnabled, setSoundEnabled } from '../services/soundService';
import { UI_LANGUAGE_KEY } from '../services/i18n';
import AvatarFrame from './AvatarFrame';

const UI_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
] as const;

const LanguageToggle: React.FC = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = UI_LANGUAGES.find(l => l.code === i18n.language) || UI_LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem(UI_LANGUAGE_KEY, code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 text-sm"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        title="UI Language"
      >
        {current.flag}
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] rounded-lg shadow-xl border overflow-hidden z-[100]"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
        >
          {UI_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors whitespace-nowrap ${
                lang.code === i18n.language ? 'text-brand-400' : ''
              }`}
              style={lang.code !== i18n.language ? { color: 'var(--text-secondary)' } : undefined}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
  const { t } = useTranslation();
  return (
    <button
      onClick={() => { const next = !on; setSoundEnabled(next); setOn(next); }}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
      style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      title={on ? t('header.soundOn') : t('header.soundOff')}
    >
      {on ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--text-secondary)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
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
  // Gamification (simplified)
  levelInfo?: LevelInfo | null;
  equipped?: EquippedItems | null;
  userName?: string;
  onLogoAchievement?: () => void;
  // Credits & user
  isAuthenticated?: boolean;
  credits?: number;
  plan?: string;
  onShowCreditShop?: () => void;
  onShowProfile?: () => void;
  onShowAuthModal?: () => void;
  onLogout?: () => void;
  // Tab navigation
  activeTab?: 'main' | 'gallery' | 'playground' | 'pilot';
  onTabChange?: (tab: 'main' | 'gallery' | 'playground' | 'pilot') => void;
  projectCount?: number;
  // Gamification shortcuts
  onShowAchievements?: () => void;
  onShowInventory?: () => void;
  onShowLeaderboard?: () => void;
  // Avatar
  avatarUrl?: string | null;
}

const Header: React.FC<HeaderProps> = ({
  isDark, onToggleTheme,
  levelInfo, equipped, userName, onLogoAchievement,
  isAuthenticated, credits = 0, plan = 'free',
  onShowCreditShop, onShowProfile, onShowAuthModal, onLogout,
  activeTab = 'main', onTabChange, projectCount = 0,
  onShowAchievements, onShowInventory, onShowLeaderboard,
  avatarUrl,
}) => {
  // Easter egg: 5 rapid clicks on logo → rainbow spin
  const [easterEgg, setEasterEgg] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoAchievementRef = useRef(onLogoAchievement);
  useEffect(() => { onLogoAchievementRef.current = onLogoAchievement; });

  // Avatar dropdown
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  // Mobile menu
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        avatarBtnRef.current && !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

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

  const { t } = useTranslation();
  const tabs: { key: 'main' | 'gallery' | 'playground' | 'pilot'; label: string; count?: number }[] = [
    { key: 'main', label: t('header.storyboard') },
    { key: 'gallery', label: t('header.savedProjects'), count: projectCount },
    { key: 'playground', label: t('header.playground') },
    { key: 'pilot', label: 'PILOT' },
  ];

  const lv = levelInfo?.level;
  const lColor = levelInfo?.color || '#06b6d4';
  const lEmoji = levelInfo?.emoji || '';
  const lProgress = levelInfo?.progress ?? 0;

  return (
    <header
      className="border-b backdrop-blur-md sticky top-0 z-50"
      style={{
        borderColor: 'var(--border-default)',
        backgroundColor: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 h-[56px] flex items-center justify-between gap-2">
        {/* ===== LEFT: Logo + Tabs ===== */}
        <div className="flex items-center gap-0 min-w-0">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0 cursor-pointer select-none" onClick={handleLogoClick} title="C2 GEN">
            <div className="w-8 h-8 bg-gradient-to-br from-green-900/60 to-emerald-900/60 rounded-lg flex items-center justify-center shadow-md shadow-green-900/20 border border-green-700/30">
              <FourLeafClover className={`w-6 h-6 ${easterEgg ? 'animate-rainbow-spin' : ''}`} />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className={`text-base font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-green-300 via-emerald-200 to-white' : 'from-green-600 via-emerald-500 to-slate-800'}`}>
                C2
              </span>
              <span className={`text-base font-bold bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-white to-slate-400' : 'from-slate-800 to-slate-500'}`}>
                GEN
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-5 mx-3 flex-shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }} />

          {/* Tab navigation — desktop */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {tabs.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => onTabChange?.(tab.key)}
                  className={`relative px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${
                    isActive ? 'text-brand-400' : 'hover:bg-white/5'
                  }`}
                  style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-px rounded-full font-bold"
                        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-[-15px] left-1 right-1 h-[2px] rounded-full bg-brand-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden ml-2 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--text-secondary)' }}>
              {showMobileMenu
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {/* ===== RIGHT: Actions + Avatar ===== */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAuthenticated && userName ? (
            <>
              {/* Level chip */}
              {levelInfo && lv != null && (
                <button
                  onClick={onShowProfile}
                  className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: `${lColor}15`, border: `1px solid ${lColor}30` }}
                  title={`Lv.${lv} — ${t('header.viewProfile')}`}
                >
                  <span className="text-[11px] font-bold" style={{ color: lColor }}>
                    {lEmoji} Lv.{lv}
                  </span>
                  <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${lColor}20` }}>
                    <div className="h-full rounded-full transition-all duration-500 xp-bar-fill" style={{ width: `${lProgress}%`, backgroundColor: lColor }} />
                  </div>
                </button>
              )}

              {/* Credits badge */}
              <button
                onClick={plan !== 'operator' ? onShowCreditShop : undefined}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  plan !== 'operator' ? 'hover:brightness-110 cursor-pointer' : 'cursor-default'
                } ${credits <= 10 && plan !== 'operator' ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: plan === 'operator' ? 'rgba(249,115,22,0.1)' : credits <= 10 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                  border: `1px solid ${plan === 'operator' ? 'rgba(249,115,22,0.25)' : credits <= 10 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
                  color: plan === 'operator' ? '#f97316' : credits <= 10 ? '#ef4444' : '#10b981',
                }}
                title={plan === 'operator' ? t('header.operatorUnlimited') : t('header.creditCharge')}
              >
                <span>{plan === 'operator' ? '∞' : `💰 ${credits.toLocaleString()}`}</span>
                {plan === 'operator' && (
                  <span className="text-[9px] opacity-70">{t('header.operator')}</span>
                )}
              </button>

              {/* Sound toggle */}
              <SoundToggle />

              {/* UI Language toggle */}
              <LanguageToggle />

              {/* Theme toggle */}
              <button
                onClick={onToggleTheme}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                title={isDark ? t('header.lightMode') : t('header.darkMode')}
              >
                {isDark ? (
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="4" fill="currentColor" />
                    <path strokeLinecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07 7.07l-1.41-1.41M8.34 8.34L6.93 6.93m12.14 0l-1.41 1.41M8.34 15.66l-1.41 1.41" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Avatar button + dropdown */}
              <div className="relative">
                <button
                  ref={avatarBtnRef}
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="rounded-lg flex items-center justify-center transition-all hover:ring-2 hover:ring-brand-500/40"
                  title={userName}
                >
                  <AvatarFrame
                    name={userName || ''}
                    size={34}
                    rarity={equipped?.frame?.rarity}
                    frameName={equipped?.frame?.name}
                    avatarUrl={avatarUrl}
                  />
                </button>

                {/* Dropdown menu */}
                {showDropdown && (
                  <div
                    ref={dropdownRef}
                    className="absolute right-0 top-[calc(100%+6px)] w-52 rounded-xl shadow-2xl border overflow-hidden z-[100]"
                    style={{
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      borderColor: 'var(--border-default)',
                      boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.5)' : '0 20px 40px rgba(0,0,0,0.15)',
                    }}
                  >
                    {/* User info header */}
                    <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center gap-2">
                        <AvatarFrame name={userName || ''} size={24} rarity={equipped?.frame?.rarity} frameName={equipped?.frame?.name} avatarUrl={avatarUrl} />
                        <div className="min-w-0">
                          <div className="text-[12px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{userName}</div>
                          {levelInfo && (
                            <div className="text-[10px]" style={{ color: lColor }}>
                              {lEmoji} Lv.{lv} {equipped?.title?.name || levelInfo.title || ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                      <DropdownItem icon="👤" label={t('header.profile')} onClick={() => { setShowDropdown(false); onShowProfile?.(); }} isDark={isDark} />
                      <DropdownItem icon="🎒" label={t('header.inventory')} onClick={() => { setShowDropdown(false); onShowInventory?.(); }} isDark={isDark} />
                      <DropdownItem icon="🏆" label={t('header.achievements')} onClick={() => { setShowDropdown(false); onShowAchievements?.(); }} isDark={isDark} />
                      <DropdownItem icon="🏅" label={t('header.leaderboard')} onClick={() => { setShowDropdown(false); onShowLeaderboard?.(); }} isDark={isDark} />
                    </div>

                    <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />

                    <div className="py-1">
                      <DropdownItem icon="🚪" label={t('common.logout')} onClick={() => { setShowDropdown(false); onLogout?.(); }} isDark={isDark} danger />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Not authenticated: sound + language + theme + login button */}
              <SoundToggle />
              <LanguageToggle />
              <button
                onClick={onToggleTheme}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                title={isDark ? t('header.lightMode') : t('header.darkMode')}
              >
                {isDark ? (
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="4" fill="currentColor" />
                    <path strokeLinecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07 7.07l-1.41-1.41M8.34 8.34L6.93 6.93m12.14 0l-1.41 1.41M8.34 15.66l-1.41 1.41" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <button
                onClick={onShowAuthModal}
                className="text-[12px] px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all font-bold"
              >
                {t('common.login')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {showMobileMenu && (
        <div className="sm:hidden border-t px-3 pb-2 pt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { onTabChange?.(tab.key); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 text-[13px] font-semibold rounded-md transition-colors ${
                  isActive ? 'text-brand-400' : ''
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--bg-elevated)' : undefined,
                  color: !isActive ? 'var(--text-secondary)' : undefined,
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full font-bold" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};

/* Dropdown menu item helper */
const DropdownItem: React.FC<{
  icon: string; label: string; onClick: () => void; isDark: boolean; danger?: boolean;
}> = ({ icon, label, onClick, isDark, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
      danger ? 'hover:bg-red-500/10 text-red-400' : ''
    }`}
    style={!danger ? {
      color: 'var(--text-secondary)',
      ...(isDark ? {} : {}),
    } : undefined}
    onMouseEnter={e => { if (!danger) (e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'); }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
  >
    <span className="text-[13px]">{icon}</span>
    {label}
  </button>
);

export default Header;
