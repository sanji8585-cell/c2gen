// ============================================================
// Gamification Service - Client-side core service
// ============================================================

import type {
  GameConfig, GameSyncResponse, RecordActionResponse,
  LevelInfo, GachaItem, DailyQuest, EquippedItems,
  LevelConfig, PrestigeConfig,
} from '../types/gamification';

// ── 폴백 설정 (서버 로드 실패 시) ──

const FALLBACK_THRESHOLDS = [0, 50, 120, 200, 350, 500, 750, 1000, 1500, 2500];
const FALLBACK_TITLES = [
  '초보 크리에이터', '아이디어 탐험가', '스토리 위버', '아이디어 뱅크',
  '비주얼 아키텍트', '영감의 마법사', 'AI 파트너', '마스터 크리에이터',
  '레전드 프로듀서', '다이아몬드 아티스트',
];

// ── 캐시 ──

const CONFIG_CACHE_KEY = 'tubegen_game_config';
const CONFIG_TTL = 60 * 60 * 1000; // 1시간

let cachedConfig: GameConfig | null = null;
let configLoadedAt = 0;

// ── API 헬퍼 ──

async function gameApiFetch(body: Record<string, any>): Promise<any> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[game] API error ${res.status} for action=${body.action}`);
  }
  const data = await res.json();
  if (data?.error) {
    console.error(`[game] API error for action=${body.action}:`, data);
  }
  return data;
}

function getToken(): string | null {
  return localStorage.getItem('c2gen_session_token');
}

// ── 설정 로드 ──

export async function loadGameConfig(forceRefresh = false): Promise<GameConfig> {
  // 메모리 캐시
  if (!forceRefresh && cachedConfig && Date.now() - configLoadedAt < CONFIG_TTL) {
    return cachedConfig;
  }

  // localStorage 캐시
  if (!forceRefresh) {
    try {
      const stored = localStorage.getItem(CONFIG_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && Date.now() - parsed.timestamp < CONFIG_TTL) {
          cachedConfig = parsed.config;
          configLoadedAt = parsed.timestamp;
          return cachedConfig!;
        }
      }
    } catch { /* ignore */ }
  }

  // 서버에서 로드
  try {
    const data = await gameApiFetch({ action: 'game-getConfig' });
    if (data.config) {
      cachedConfig = data.config;
      configLoadedAt = Date.now();
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
        config: cachedConfig,
        timestamp: configLoadedAt,
      }));
      return cachedConfig!;
    }
  } catch { /* fallback */ }

  // 폴백
  return getFallbackConfig();
}

function getFallbackConfig(): GameConfig {
  return {
    levels: {
      thresholds: FALLBACK_THRESHOLDS,
      titles: FALLBACK_TITLES,
      emojis: ['🌱', '🔍', '🕸️', '🏦', '🏛️', '🪄', '🤖', '🎓', '🏆', '💎'],
      colors: ['#94a3b8', '#60a5fa', '#34d399', '#fbbf24', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#eab308', '#06b6d4'],
      rewards: FALLBACK_THRESHOLDS.map(() => ({ credits: 0, xp_multiplier: 1, gacha_tickets: 0 })),
    },
    xpRates: { script: 10, image_per: 5, audio_per: 3, video_per: 8, daily_bonus: 5, streak_multiplier: 0.1, combo_multiplier: 0.05, max_combo_multiplier: 2.0 },
    gachaSettings: {
      pull_interval: 5,
      rarities: {
        common: { rate: 0.5, color: '#94a3b8', label: 'COMMON' },
        uncommon: { rate: 0.25, color: '#22c55e', label: 'UNCOMMON' },
        rare: { rate: 0.15, color: '#8b5cf6', label: '★ RARE' },
        epic: { rate: 0.08, color: '#f59e0b', label: '★★ EPIC ★★' },
        legendary: { rate: 0.02, color: '#ef4444', label: '★★★ LEGENDARY ★★★' },
      },
      pity: { epic_guarantee: 30, legendary_guarantee: 100 },
    },
    streakSettings: { milestones: [3, 7, 14, 30, 60, 100, 365], milestone_rewards: [] },
    milestoneSettings: { generation_milestones: [] },
    prestigeSettings: { enabled: false, xp_multiplier_per_prestige: 0.1, max_prestige: 10, badge_emojis: [] },
  };
}

// ── 레벨 계산 (클라이언트 표시용) ──

export function calculateLevel(xp: number, config?: GameConfig | null): LevelInfo {
  const levels = config?.levels || getFallbackConfig().levels;
  const { thresholds, titles, emojis, colors } = levels;

  let level = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      level = i + 1;
      break;
    }
  }

  const isMaxLevel = level >= thresholds.length;
  const currentThreshold = thresholds[level - 1] || 0;
  const nextThreshold = isMaxLevel ? currentThreshold : (thresholds[level] || currentThreshold + 1000);
  const range = nextThreshold - currentThreshold;
  const progress = range > 0 ? Math.min(100, ((xp - currentThreshold) / range) * 100) : 100;

  return {
    level,
    title: titles[level - 1] || `Lv.${level}`,
    emoji: emojis[level - 1] || '🌱',
    color: colors[level - 1] || '#94a3b8',
    currentXp: xp,
    xpForCurrent: currentThreshold,
    xpForNext: nextThreshold,
    progress,
    isMaxLevel,
  };
}

// ── 전체 상태 동기화 (로그인 시) ──

export async function syncGameState(): Promise<GameSyncResponse | null> {
  const token = getToken();
  if (!token) { console.warn('[game] syncGameState: no token'); return null; }

  try {
    const data = await gameApiFetch({ action: 'game-syncState', token });
    if (data?.error) { console.error('[game] syncGameState failed:', data.error); return null; }
    if (data.config) {
      cachedConfig = data.config;
      configLoadedAt = Date.now();
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ config: cachedConfig, timestamp: configLoadedAt }));
    }
    return data;
  } catch (e) {
    console.error('[game] syncGameState exception:', e);
    return null;
  }
}

// ── 액션 기록 (서버에서 XP/업적/퀘스트/뽑기 모두 처리) ──

export async function recordGameAction(
  actionType: string,
  count: number,
  metadata?: Record<string, any>,
): Promise<RecordActionResponse | null> {
  const token = getToken();
  if (!token) { console.warn('[game] recordAction: no token'); return null; }

  try {
    const data = await gameApiFetch({
      action: 'game-recordAction',
      token,
      actionType,
      count,
      metadata,
    });
    if (data?.error) { console.error('[game] recordAction server error:', data.error); return null; }
    console.log('[game] recordAction OK:', actionType, 'questProgress:', data?.questProgress?.length ?? 0);
    return data;
  } catch (e) {
    console.error('[game] recordAction exception:', e);
    return null;
  }
}

// ── 퀘스트 보상 수령 ──

export async function claimQuestReward(questId: string): Promise<{ success: boolean; rewardXp: number; rewardCredits: number } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    return await gameApiFetch({ action: 'game-claimQuestReward', token, questId });
  } catch {
    return null;
  }
}

// ── 뽑기 ──

export async function pullGacha(): Promise<{ item: GachaItem; isNew: boolean } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const data = await gameApiFetch({ action: 'game-pullGacha', token });
    return data.result || null;
  } catch {
    return null;
  }
}

// ── 아이템 장착 ──

export async function equipItem(slot: 'title' | 'badge' | 'frame', inventoryItemId: string | null): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const data = await gameApiFetch({ action: 'game-equipItem', token, slot, inventoryItemId });
    return data.success === true;
  } catch {
    return false;
  }
}

// ── 소모품 사용 ──

export async function useConsumable(inventoryItemId: string): Promise<{ success: boolean; effect?: any } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    return await gameApiFetch({ action: 'game-useConsumable', token, inventoryItemId });
  } catch {
    return null;
  }
}

// ── 프레스티지 ──

export async function prestige(): Promise<{ success: boolean; newPrestigeLevel: number; xpBonus: number } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    return await gameApiFetch({ action: 'game-prestige', token });
  } catch {
    return null;
  }
}

// ── 설정 캐시 무효화 ──

export function invalidateConfigCache(): void {
  cachedConfig = null;
  configLoadedAt = 0;
  localStorage.removeItem(CONFIG_CACHE_KEY);
}
