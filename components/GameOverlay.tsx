import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GachaSettings, Rarity } from '../types/gamification';
import { playSFX, getGachaSoundType } from '../services/soundService';

// ── Rarity color map ──
const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

const RARITY_LABEL_KEYS: Record<string, string> = {
  common: 'game.rarityCommon',
  uncommon: 'game.rarityUncommon',
  rare: 'game.rarityRare',
  epic: 'game.rarityEpic',
  legendary: 'game.rarityLegendary',
};

// ── Achievement category colors ──
const CATEGORY_COLORS: Record<string, string> = {
  creation: '#3b82f6',
  exploration: '#22c55e',
  dedication: '#f59e0b',
  mastery: '#8b5cf6',
  hidden: '#ef4444',
};

// ── Confetti particle ──
interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
  duration: number;
}

function generateConfetti(count: number): ConfettiParticle[] {
  const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
    delay: Math.random() * 0.8,
    duration: 2 + Math.random() * 2,
  }));
}

// ── Props ──
interface GameOverlayProps {
  levelUp: {
    level: number;
    title: string;
    emoji: string;
    color: string;
    reward?: { credits: number; gacha_tickets: number };
  } | null;
  achievementUnlock: {
    name: string;
    icon: string;
    description: string;
    category: string;
    rewardXp: number;
    rewardCredits: number;
  } | null;
  gachaResult: {
    item: { name: string; emoji: string; rarity: string; itemType: string };
    isNew: boolean;
  } | null;
  milestone: {
    emoji: string;
    title: string;
    xp: number;
    credits: number;
  } | null;
  onDismiss: () => void;
  gachaSettings?: GachaSettings;
}

// ── Inline keyframe styles (injected once) ──
const OVERLAY_KEYFRAMES = `
@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes overlay-scale-up {
  0% { transform: scale(0.5) translateY(30px); opacity: 0; }
  60% { transform: scale(1.05) translateY(-5px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes overlay-level-number {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.3); opacity: 1; }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes overlay-shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes overlay-glow-pulse {
  0%, 100% { box-shadow: 0 0 20px var(--glow-color), 0 0 40px var(--glow-color); }
  50% { box-shadow: 0 0 40px var(--glow-color), 0 0 80px var(--glow-color), 0 0 120px var(--glow-color); }
}
@keyframes overlay-confetti-fall {
  0% { transform: translateY(0) rotate(var(--rot-start)); opacity: 1; }
  100% { transform: translateY(110vh) rotate(calc(var(--rot-start) + 720deg)); opacity: 0; }
}
@keyframes overlay-new-badge {
  0%, 100% { transform: scale(1) rotate(-12deg); }
  50% { transform: scale(1.15) rotate(-8deg); }
}
@keyframes overlay-reward-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes gacha-spin-emoji {
  0% { transform: translateY(0); opacity: 1; }
  50% { opacity: 0.6; }
  100% { transform: translateY(-100%); opacity: 1; }
}
@keyframes gacha-flash-reveal {
  0% { transform: scale(0.3); opacity: 0; filter: brightness(3); }
  40% { transform: scale(1.3); opacity: 1; filter: brightness(2); }
  70% { transform: scale(0.95); filter: brightness(1.2); }
  100% { transform: scale(1); opacity: 1; filter: brightness(1); }
}
@keyframes gacha-screen-flash {
  0% { opacity: 0; }
  15% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes gacha-particle-burst {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--px), var(--py)) scale(0); opacity: 0; }
}
@keyframes gacha-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
  20%, 40%, 60%, 80% { transform: translateX(3px); }
}
@keyframes gacha-ring-expand {
  0% { transform: scale(0.3); opacity: 0.8; border-width: 4px; }
  100% { transform: scale(2.5); opacity: 0; border-width: 1px; }
}
@keyframes gacha-star-rotate {
  0% { transform: rotate(0deg) scale(0); opacity: 0; }
  50% { transform: rotate(180deg) scale(1.2); opacity: 1; }
  100% { transform: rotate(360deg) scale(1); opacity: 0.8; }
}
@keyframes overlay-bounce-in {
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  60% { transform: scale(1.3) rotate(5deg); opacity: 1; }
  80% { transform: scale(0.9) rotate(-3deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.overlay-bounce-in {
  animation: overlay-bounce-in 0.6s ease-out forwards;
}
`;

// Slot machine emoji pool for spinning animation
const SLOT_EMOJIS = ['🎁', '💎', '⭐', '🔮', '👑', '🎭', '🏆', '🌟', '💫', '🎪', '🎯', '🎲', '🃏', '🎰', '🔥', '✨', '💝', '🎊'];

// Rarity-specific burst particle colors
const RARITY_PARTICLE_COLORS: Record<string, string[]> = {
  common: ['#94a3b8', '#cbd5e1', '#e2e8f0'],
  uncommon: ['#22c55e', '#4ade80', '#86efac'],
  rare: ['#8b5cf6', '#a78bfa', '#c4b5fd'],
  epic: ['#f59e0b', '#fbbf24', '#fcd34d', '#ff6b6b'],
  legendary: ['#ef4444', '#f59e0b', '#fbbf24', '#ff6b6b', '#ec4899', '#8b5cf6'],
};

const GameOverlay: React.FC<GameOverlayProps> = ({
  levelUp,
  achievementUnlock,
  gachaResult,
  milestone,
  onDismiss,
  gachaSettings,
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [confettiParticles, setConfettiParticles] = useState<ConfettiParticle[]>([]);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });

  // Gacha animation phases: 'spinning' → 'slowing' → 'revealed'
  const [gachaPhase, setGachaPhase] = useState<'spinning' | 'slowing' | 'revealed'>('spinning');
  const [slotEmoji, setSlotEmoji] = useState('🎁');
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [burstParticles, setBurstParticles] = useState<Array<{id:number;x:number;y:number;color:string;angle:number;distance:number}>>([]);

  // Determine active overlay by priority
  const activeType = useMemo(() => {
    if (levelUp) return 'levelUp';
    if (achievementUnlock) return 'achievement';
    if (gachaResult) return 'gacha';
    if (milestone) return 'milestone';
    return null;
  }, [levelUp, achievementUnlock, gachaResult, milestone]);

  // Gacha spin animation
  useEffect(() => {
    if (activeType !== 'gacha' || !gachaResult) return;

    // Reset phase
    setGachaPhase('spinning');
    setBurstParticles([]);

    // Play spin sound
    playSFX('gachaSpin');

    // Fast spin: 60ms per tick
    let tickCount = 0;
    const maxSpinTicks = 20;
    const maxSlowTicks = 10;

    spinIntervalRef.current = setInterval(() => {
      tickCount++;
      setSlotEmoji(SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]);

      if (tickCount === maxSpinTicks) {
        // Transition to slowing phase
        setGachaPhase('slowing');
        playSFX('gachaRevealDrum');

        // Clear fast interval
        if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);

        // Slow spin: increasing delay per tick
        let slowTick = 0;
        const slowSpin = () => {
          slowTick++;
          setSlotEmoji(SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]);
          if (slowTick < maxSlowTicks) {
            setTimeout(slowSpin, 100 + slowTick * 40);
          } else {
            // REVEAL!
            setSlotEmoji(gachaResult.item.emoji);
            setGachaPhase('revealed');
            playSFX(getGachaSoundType(gachaResult.item.rarity));

            // Generate burst particles for epic/legendary
            const isHighRarity = ['epic', 'legendary'].includes(gachaResult.item.rarity);
            if (isHighRarity) {
              const particleCount = gachaResult.item.rarity === 'legendary' ? 24 : 14;
              const colors = RARITY_PARTICLE_COLORS[gachaResult.item.rarity] || RARITY_PARTICLE_COLORS.common;
              setBurstParticles(
                Array.from({ length: particleCount }, (_, i) => ({
                  id: i,
                  x: 0,
                  y: 0,
                  color: colors[Math.floor(Math.random() * colors.length)],
                  angle: (360 / particleCount) * i + Math.random() * 20,
                  distance: 60 + Math.random() * 80,
                }))
              );
            }

            // Confetti for legendary
            if (gachaResult.item.rarity === 'legendary') {
              setConfettiParticles(generateConfetti(40));
            }
          }
        };
        setTimeout(slowSpin, 100);
      }
    }, 60);

    return () => {
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
    };
  }, [activeType, gachaResult]);

  // Entry animation + auto-dismiss
  useEffect(() => {
    if (!activeType) {
      setVisible(false);
      return;
    }

    setVisible(true);

    // Generate confetti for level up
    if (activeType === 'levelUp') {
      setConfettiParticles(generateConfetti(50));
    } else if (activeType !== 'gacha') {
      setConfettiParticles([]);
    }

    // Gacha needs longer time for animation phases
    const duration = activeType === 'levelUp' ? 5000 : activeType === 'gacha' ? 7000 : 4000;
    const dismissTimeout = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismissRef.current(), 400);
    }, duration);

    return () => clearTimeout(dismissTimeout);
  }, [activeType]);

  if (!activeType) return null;

  const getRarityColor = (rarity: string): string => {
    if (gachaSettings?.rarities?.[rarity]?.color) {
      return gachaSettings.rarities[rarity].color;
    }
    return RARITY_COLORS[rarity] || RARITY_COLORS.common;
  };

  const getRarityLabel = (rarity: string): string => {
    if (gachaSettings?.rarities?.[rarity]?.label) {
      return gachaSettings.rarities[rarity].label;
    }
    return RARITY_LABEL_KEYS[rarity] ? t(RARITY_LABEL_KEYS[rarity]) : rarity;
  };

  const handleBackdropClick = () => {
    setVisible(false);
    setTimeout(() => onDismissRef.current(), 400);
  };

  return (
    <>
      {/* Inject keyframes once */}
      <style>{OVERLAY_KEYFRAMES}</style>

      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          animation: visible ? 'overlay-fade-in 0.3s ease-out' : undefined,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s ease-out',
          cursor: 'pointer',
        }}
        onClick={handleBackdropClick}
      >
        {/* Confetti layer for level up */}
        {activeType === 'levelUp' && confettiParticles.map((p) => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size * 0.6}px`,
              backgroundColor: p.color,
              borderRadius: '2px',
              '--rot-start': `${p.rotation}deg`,
              animation: `overlay-confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
              opacity: 0,
              pointerEvents: 'none',
            } as React.CSSProperties}
          />
        ))}

        {/* Content container - stop click propagation */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            animation: visible ? 'overlay-scale-up 0.6s ease-out forwards' : undefined,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease-out',
          }}
        >
          {/* ── LEVEL UP ── */}
          {activeType === 'levelUp' && levelUp && (
            <div
              className="relative rounded-2xl p-8 text-center max-w-sm mx-3 sm:mx-4"
              style={{
                background: `linear-gradient(135deg, ${levelUp.color}22, ${levelUp.color}44, ${levelUp.color}22)`,
                border: `2px solid ${levelUp.color}`,
                boxShadow: `0 0 40px ${levelUp.color}66, 0 0 80px ${levelUp.color}33`,
              }}
            >
              {/* Shine effect */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
                style={{
                  background: `linear-gradient(90deg, transparent, ${levelUp.color}33, transparent)`,
                  backgroundSize: '200% 100%',
                  animation: 'overlay-shine 2s linear infinite',
                }}
              />

              <div className="relative">
                {/* Label */}
                <p className="text-sm font-bold tracking-widest uppercase mb-2"
                   style={{ color: levelUp.color }}>
                  LEVEL UP!
                </p>

                {/* Emoji */}
                <div className="text-5xl mb-2 overlay-bounce-in">
                  {levelUp.emoji}
                </div>

                {/* Level number */}
                <div
                  className="text-5xl sm:text-7xl font-black mb-2"
                  style={{
                    color: levelUp.color,
                    animation: 'overlay-level-number 0.8s ease-out forwards',
                    textShadow: `0 0 20px ${levelUp.color}88`,
                  }}
                >
                  Lv.{levelUp.level}
                </div>

                {/* Title */}
                <p className="text-xl font-bold text-white mb-4">
                  {levelUp.title}
                </p>

                {/* Rewards */}
                {levelUp.reward && (
                  <div
                    className="flex items-center justify-center gap-2 sm:gap-4 mt-2"
                    style={{ animation: 'overlay-reward-pop 0.5s 0.6s ease-out forwards', opacity: 0 }}
                  >
                    {levelUp.reward.credits > 0 && (
                      <div className="flex items-center gap-1 bg-yellow-500/20 px-3 py-1.5 rounded-full">
                        <span className="text-lg">💰</span>
                        <span className="text-yellow-300 font-bold text-sm">
                          +{levelUp.reward.credits} {t('common.credits')}
                        </span>
                      </div>
                    )}
                    {levelUp.reward.gacha_tickets > 0 && (
                      <div className="flex items-center gap-1 bg-purple-500/20 px-3 py-1.5 rounded-full">
                        <span className="text-lg">🎫</span>
                        <span className="text-purple-300 font-bold text-sm">
                          +{levelUp.reward.gacha_tickets} {t('completion.gachaTicket')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Dismiss hint */}
                <p className="text-xs text-gray-400 mt-5">
                  {t('game.clickToDismiss')}
                </p>
              </div>
            </div>
          )}

          {/* ── ACHIEVEMENT UNLOCK ── */}
          {activeType === 'achievement' && achievementUnlock && (() => {
            const catColor = CATEGORY_COLORS[achievementUnlock.category] || '#3b82f6';
            return (
              <div
                className="relative rounded-2xl p-7 text-center max-w-sm mx-3 sm:mx-4"
                style={{
                  background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                  border: `2px solid ${catColor}`,
                  boxShadow: `0 0 30px ${catColor}44, 0 4px 30px rgba(0,0,0,0.5)`,
                }}
              >
                {/* Category ribbon */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: catColor }}
                >
                  {t('game.achievementUnlocked')}
                </div>

                {/* Icon */}
                <div className="text-5xl mt-4 mb-3 overlay-bounce-in">
                  {achievementUnlock.icon}
                </div>

                {/* Name */}
                <h3 className="text-xl font-bold text-white mb-2">
                  {achievementUnlock.name}
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                  {achievementUnlock.description}
                </p>

                {/* Rewards */}
                <div
                  className="flex items-center justify-center gap-3"
                  style={{ animation: 'overlay-reward-pop 0.5s 0.5s ease-out forwards', opacity: 0 }}
                >
                  {achievementUnlock.rewardXp > 0 && (
                    <div className="flex items-center gap-1 bg-blue-500/20 px-3 py-1.5 rounded-full">
                      <span className="text-sm">⭐</span>
                      <span className="text-blue-300 font-bold text-sm">
                        +{achievementUnlock.rewardXp} XP
                      </span>
                    </div>
                  )}
                  {achievementUnlock.rewardCredits > 0 && (
                    <div className="flex items-center gap-1 bg-yellow-500/20 px-3 py-1.5 rounded-full">
                      <span className="text-sm">💰</span>
                      <span className="text-yellow-300 font-bold text-sm">
                        +{achievementUnlock.rewardCredits} {t('common.credits')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Dismiss hint */}
                <p className="text-xs text-gray-400 mt-5">
                  {t('game.clickToDismiss')}
                </p>
              </div>
            );
          })()}

          {/* ── GACHA RESULT (Multi-phase slot machine) ── */}
          {activeType === 'gacha' && gachaResult && (() => {
            const rarityColor = getRarityColor(gachaResult.item.rarity);
            const rarityLabel = getRarityLabel(gachaResult.item.rarity);
            const isHighRarity = ['epic', 'legendary'].includes(gachaResult.item.rarity);
            const isLegendary = gachaResult.item.rarity === 'legendary';
            const isRevealed = gachaPhase === 'revealed';

            return (
              <div
                className="relative rounded-2xl p-7 text-center max-w-xs mx-3 sm:mx-4"
                style={{
                  background: isRevealed
                    ? `linear-gradient(135deg, ${rarityColor}15, #0f172a, ${rarityColor}15)`
                    : 'linear-gradient(135deg, #1e293b, #0f172a)',
                  border: `2px solid ${isRevealed ? rarityColor : '#334155'}`,
                  '--glow-color': `${rarityColor}66`,
                  animation: isRevealed && isHighRarity
                    ? 'overlay-glow-pulse 2s ease-in-out infinite'
                    : gachaPhase === 'slowing'
                      ? 'gacha-shake 0.5s ease-in-out'
                      : undefined,
                  boxShadow: isRevealed
                    ? `0 0 40px ${rarityColor}55, 0 0 80px ${rarityColor}22, 0 4px 30px rgba(0,0,0,0.5)`
                    : '0 4px 30px rgba(0,0,0,0.5)',
                  transition: 'all 0.5s ease',
                  overflow: 'hidden',
                } as React.CSSProperties}
              >
                {/* Screen flash on reveal */}
                {isRevealed && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{
                      background: isLegendary
                        ? `radial-gradient(circle, ${rarityColor}88, transparent)`
                        : `radial-gradient(circle, ${rarityColor}44, transparent)`,
                      animation: 'gacha-screen-flash 0.8s ease-out forwards',
                    }}
                  />
                )}

                {/* Expanding rings on reveal (epic/legendary) */}
                {isRevealed && isHighRarity && (
                  <>
                    {[0, 0.2, 0.4].map((delay, i) => (
                      <div
                        key={i}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                        style={{
                          width: '60px',
                          height: '60px',
                          border: `3px solid ${rarityColor}`,
                          animation: `gacha-ring-expand 1.2s ${delay}s ease-out forwards`,
                          opacity: 0,
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Burst particles on reveal */}
                {isRevealed && burstParticles.map((p) => (
                  <div
                    key={p.id}
                    className="absolute left-1/2 top-1/2 pointer-events-none"
                    style={{
                      width: isLegendary ? '8px' : '6px',
                      height: isLegendary ? '8px' : '6px',
                      backgroundColor: p.color,
                      borderRadius: '50%',
                      '--px': `${Math.cos(p.angle * Math.PI / 180) * p.distance}px`,
                      '--py': `${Math.sin(p.angle * Math.PI / 180) * p.distance}px`,
                      animation: `gacha-particle-burst 0.8s ${Math.random() * 0.2}s ease-out forwards`,
                      boxShadow: `0 0 6px ${p.color}`,
                    } as React.CSSProperties}
                  />
                ))}

                {/* NEW badge (only after reveal) */}
                {isRevealed && gachaResult.isNew && (
                  <div
                    className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg z-10"
                    style={{
                      animation: 'overlay-new-badge 1s ease-in-out infinite',
                      transform: 'rotate(-12deg)',
                    }}
                  >
                    {t('game.new')}
                  </div>
                )}

                {/* Phase indicator */}
                {!isRevealed && (
                  <div className="text-xs font-bold tracking-widest uppercase mb-3 text-gray-400">
                    {gachaPhase === 'spinning' ? `🎰 ${t('game.gachaSpinning')}` : `✨ ${t('game.gachaRevealing')}`}
                  </div>
                )}

                {/* Rarity label (only after reveal) */}
                {isRevealed && (
                  <div
                    className="text-xs font-bold tracking-widest uppercase mb-3"
                    style={{
                      color: rarityColor,
                      animation: 'overlay-reward-pop 0.3s ease-out forwards',
                    }}
                  >
                    ★ {rarityLabel} ★
                  </div>
                )}

                {/* SLOT MACHINE AREA */}
                <div
                  className="relative mx-auto mb-3"
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '16px',
                    background: gachaPhase === 'spinning'
                      ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 30%, #334155 50%, #1e293b 70%, #0f172a 100%)'
                      : isRevealed
                        ? `radial-gradient(circle, ${rarityColor}22, transparent)`
                        : 'linear-gradient(180deg, #0f172a, #1e293b, #0f172a)',
                    border: `2px solid ${isRevealed ? rarityColor : '#475569'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    boxShadow: isRevealed
                      ? `inset 0 0 20px ${rarityColor}33, 0 0 20px ${rarityColor}22`
                      : 'inset 0 0 20px rgba(0,0,0,0.5)',
                  }}
                >
                  {/* Spinning emoji */}
                  <div
                    className="text-5xl select-none"
                    style={{
                      animation: isRevealed
                        ? 'gacha-flash-reveal 0.6s ease-out forwards'
                        : undefined,
                      filter: isRevealed && isHighRarity
                        ? `drop-shadow(0 0 15px ${rarityColor})`
                        : undefined,
                      transition: gachaPhase === 'slowing' ? 'all 0.15s ease' : undefined,
                    }}
                  >
                    {isRevealed ? gachaResult.item.emoji : slotEmoji}
                  </div>

                  {/* Scan line effect during spinning */}
                  {!isRevealed && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(180deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)',
                        animation: gachaPhase === 'spinning' ? 'gacha-spin-emoji 0.3s linear infinite' : undefined,
                      }}
                    />
                  )}
                </div>

                {/* Revealed content */}
                {isRevealed && (
                  <>
                    {/* Star decoration for legendary */}
                    {isLegendary && (
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {['⭐', '🌟', '⭐'].map((s, i) => (
                          <span
                            key={i}
                            className="text-sm"
                            style={{
                              animation: `gacha-star-rotate 1s ${i * 0.15}s ease-out forwards`,
                              opacity: 0,
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Item name */}
                    <h3
                      className="text-lg font-bold mb-1"
                      style={{
                        color: rarityColor,
                        animation: 'overlay-reward-pop 0.4s 0.2s ease-out forwards',
                        opacity: 0,
                        textShadow: isHighRarity ? `0 0 10px ${rarityColor}44` : undefined,
                      }}
                    >
                      {gachaResult.item.name}
                    </h3>

                    {/* Item type */}
                    <p
                      className="text-xs text-gray-400 mb-3"
                      style={{
                        animation: 'overlay-reward-pop 0.4s 0.3s ease-out forwards',
                        opacity: 0,
                      }}
                    >
                      {gachaResult.item.itemType === 'title' && `🏷️ ${t('game.title')}`}
                      {gachaResult.item.itemType === 'badge' && `🎖️ ${t('game.badge')}`}
                      {gachaResult.item.itemType === 'avatar_frame' && `🖼️ ${t('game.avatarFrame')}`}
                      {gachaResult.item.itemType === 'xp_booster' && `⚡ ${t('game.xpBooster')}`}
                      {gachaResult.item.itemType === 'credit_voucher' && `💰 ${t('game.creditVoucher')}`}
                    </p>

                    {/* Rarity indicator dots */}
                    <div
                      className="flex items-center justify-center gap-1.5 mb-4"
                      style={{
                        animation: 'overlay-reward-pop 0.4s 0.4s ease-out forwards',
                        opacity: 0,
                      }}
                    >
                      {['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => {
                        const active = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(r) <=
                          ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(gachaResult.item.rarity);
                        const isCurrent = r === gachaResult.item.rarity;
                        return (
                          <div
                            key={r}
                            className="rounded-full"
                            style={{
                              width: isCurrent ? '10px' : '7px',
                              height: isCurrent ? '10px' : '7px',
                              backgroundColor: active ? RARITY_COLORS[r] : '#334155',
                              boxShadow: isCurrent ? `0 0 10px ${RARITY_COLORS[r]}, 0 0 20px ${RARITY_COLORS[r]}44` : undefined,
                              transition: 'all 0.3s ease',
                            }}
                          />
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Dismiss hint (only after reveal) */}
                {isRevealed && (
                  <p className="text-xs text-gray-400" style={{ animation: 'overlay-reward-pop 0.3s 0.6s ease-out forwards', opacity: 0 }}>
                    {t('game.clickToDismiss')}
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── MILESTONE ── */}
          {activeType === 'milestone' && milestone && (
            <div
              className="relative rounded-2xl p-7 text-center max-w-sm mx-3 sm:mx-4"
              style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                border: '2px solid #f59e0b',
                boxShadow: '0 0 30px #f59e0b44, 0 4px 30px rgba(0,0,0,0.5)',
              }}
            >
              {/* Milestone badge */}
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: '#f59e0b' }}
              >
                {t('game.milestoneUnlocked', '마일스톤 달성!')}
              </div>

              {/* Emoji */}
              <div className="text-5xl mt-4 mb-3 overlay-bounce-in">
                {milestone.emoji}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-4">
                {milestone.title}
              </h3>

              {/* Rewards */}
              <div
                className="flex items-center justify-center gap-3"
                style={{ animation: 'overlay-reward-pop 0.5s 0.5s ease-out forwards', opacity: 0 }}
              >
                {milestone.xp > 0 && (
                  <div className="flex items-center gap-1 bg-blue-500/20 px-3 py-1.5 rounded-full">
                    <span className="text-sm">⭐</span>
                    <span className="text-blue-300 font-bold text-sm">
                      +{milestone.xp} XP
                    </span>
                  </div>
                )}
                {milestone.credits > 0 && (
                  <div className="flex items-center gap-1 bg-yellow-500/20 px-3 py-1.5 rounded-full">
                    <span className="text-sm">💰</span>
                    <span className="text-yellow-300 font-bold text-sm">
                      +{milestone.credits} {t('common.credits')}
                    </span>
                  </div>
                )}
              </div>

              {/* Dismiss hint */}
              <p className="text-xs text-gray-400 mt-5">
                클릭하여 닫기
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GameOverlay;
