// ============================================================
// useGameState - Central React hook for RPG gamification
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  GameConfig, GameSyncResponse, RecordActionResponse,
  LevelInfo, DailyQuest, GameEvent, EquippedItems,
} from '../types/gamification';
import {
  syncGameState, recordGameAction, loadGameConfig,
  calculateLevel, claimQuestReward as apiClaimQuest,
  pullGacha as apiPullGacha, equipItem as apiEquipItem,
  useConsumable as apiUseConsumable, prestige as apiPrestige,
} from '../services/gamificationService';
import { playSFX, getGachaSoundType } from '../services/soundService';

interface UseGameStateReturn {
  // 상태
  config: GameConfig | null;
  userState: GameSyncResponse['user'] | null;
  equipped: EquippedItems;
  levelInfo: LevelInfo;
  quests: DailyQuest[];
  activeEvents: GameEvent[];
  inventory: GameSyncResponse['inventory'] | null;
  achievements: GameSyncResponse['achievements'] | null;
  loading: boolean;
  synced: boolean;

  // 액션
  recordAction: (actionType: string, count: number, metadata?: Record<string, any>) => Promise<RecordActionResponse | null>;
  claimQuestReward: (questId: string) => Promise<boolean>;
  pullGacha: () => Promise<any>;
  equipItem: (slot: 'title' | 'badge' | 'frame', itemId: string | null) => Promise<boolean>;
  useConsumable: (inventoryItemId: string) => Promise<any>;
  doPrestige: () => Promise<any>;
  refreshState: () => Promise<void>;
}

const DEFAULT_EQUIPPED: EquippedItems = { title: null, badges: [], frame: null };
const DEFAULT_LEVEL: LevelInfo = {
  level: 1, title: '초보 크리에이터', emoji: '🌱', color: '#94a3b8',
  currentXp: 0, xpForCurrent: 0, xpForNext: 50, progress: 0, isMaxLevel: false,
};

export function useGameState(isAuthenticated: boolean): UseGameStateReturn {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [userState, setUserState] = useState<GameSyncResponse['user'] | null>(null);
  const [equipped, setEquipped] = useState<EquippedItems>(DEFAULT_EQUIPPED);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const [inventory, setInventory] = useState<GameSyncResponse['inventory'] | null>(null);
  const [achievements, setAchievements] = useState<GameSyncResponse['achievements'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  // 레벨 정보 (파생)
  const levelInfo = useMemo(() => {
    if (!userState) return DEFAULT_LEVEL;
    return calculateLevel(userState.xp, config);
  }, [userState?.xp, config]);

  // 전체 상태 동기화
  const refreshState = useCallback(async () => {
    setLoading(true);
    try {
      const data = await syncGameState();
      if (data) {
        setConfig(data.config);
        setUserState(data.user);
        setEquipped(data.equipped || DEFAULT_EQUIPPED);
        setQuests(data.quests || []);
        setActiveEvents(data.activeEvents || []);
        setInventory(data.inventory || null);
        setAchievements(data.achievements || null);
        setSynced(true);
      } else {
        // 비로그인 또는 실패: 설정만 로드
        const cfg = await loadGameConfig();
        setConfig(cfg);
      }
    } catch {
      const cfg = await loadGameConfig();
      setConfig(cfg);
    }
    setLoading(false);
  }, []);

  // 인증 변경 시 동기화 + 로그인 퀘스트 기록
  useEffect(() => {
    if (isAuthenticated) {
      refreshState().then(() => {
        // 로그인 퀘스트 진행 (daily_login)
        recordGameAction('daily_login', 1).catch(() => {});
      });
    } else {
      setUserState(null);
      setEquipped(DEFAULT_EQUIPPED);
      setQuests([]);
      setInventory(null);
      setAchievements(null);
      setSynced(false);
      // 설정만 로드
      loadGameConfig().then(setConfig);
      setLoading(false);
    }
  }, [isAuthenticated, refreshState]);

  // 액션 기록
  const recordAction = useCallback(async (
    actionType: string, count: number, metadata?: Record<string, any>,
  ): Promise<RecordActionResponse | null> => {
    const result = await recordGameAction(actionType, count, metadata);
    if (!result) return null;

    // 로컬 상태 즉시 업데이트
    setUserState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        xp: result.totalXp,
        level: result.newLevel ?? prev.level,
        totalGenerations: prev.totalGenerations + (actionType === 'generation_complete' ? 1 : 0),
        totalImages: prev.totalImages + (metadata?.imageCount || 0),
        totalAudio: prev.totalAudio + (metadata?.audioCount || 0),
        totalVideos: prev.totalVideos + (metadata?.videoCount || 0),
        streakCount: result.streakUpdated?.count ?? prev.streakCount,
        maxCombo: Math.max(prev.maxCombo, metadata?.sessionCombo || 0),
      };
    });

    // 사운드 효과
    if (result.newLevel) playSFX('levelUp');
    if (result.achievementsUnlocked?.length > 0) playSFX('achievement');
    if (result.milestoneReached) playSFX('milestone');
    if (result.gachaResult) playSFX(getGachaSoundType(result.gachaResult.item.rarity));
    if ((metadata?.sessionCombo || 0) >= 3) playSFX('combo');

    // 업적 로컬 상태 즉시 업데이트
    if (result.achievementsUnlocked?.length > 0) {
      setAchievements(prev => {
        if (!prev) return prev;
        const updatedProgress = { ...prev.progress };
        for (const a of result.achievementsUnlocked) {
          updatedProgress[a.id] = {
            achievementId: a.id,
            progress: a.progress,
            unlocked: true,
            unlockedAt: new Date().toISOString(),
            notified: true,
          };
        }
        return { ...prev, progress: updatedProgress };
      });
    }

    // 퀘스트 진행 업데이트 (questProgress가 있으면 항상 적용)
    if (result.questProgress && result.questProgress.length > 0) {
      setQuests(prev => prev.map(q => {
        const update = result.questProgress.find((p: any) => p.questId === q.questId);
        if (update) {
          const isJustCompleted = update.progress >= q.target && !q.completed;
          if (isJustCompleted) playSFX('questComplete');
          return { ...q, progress: update.progress, completed: isJustCompleted || q.completed };
        }
        return q;
      }));
    }

    return result;
  }, []);

  // 퀘스트 보상 수령
  const claimQuest = useCallback(async (questId: string): Promise<boolean> => {
    const result = await apiClaimQuest(questId);
    if (result?.success) {
      setQuests(prev => prev.map(q => q.questId === questId ? { ...q, rewardClaimed: true } : q));
      setUserState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          xp: prev.xp + (result.rewardXp || 0),
        };
      });
      playSFX('questComplete');
      return true;
    }
    return false;
  }, []);

  // 뽑기
  const pullGachaAction = useCallback(async () => {
    const result = await apiPullGacha();
    if (result) {
      playSFX(getGachaSoundType(result.item.rarity));
      setUserState(prev => prev ? { ...prev, gachaTickets: Math.max(0, prev.gachaTickets - 1) } : prev);
      // 인벤토리 새로고침은 refreshState에서
    }
    return result;
  }, []);

  // 장착 (옵티미스틱 업데이트 — full sync 생략)
  const equipAction = useCallback(async (slot: 'title' | 'badge' | 'frame', itemId: string | null) => {
    // 장착할 아이템 정보를 인벤토리에서 찾기
    const findItem = (invId: string | null) => {
      if (!invId || !inventory) return null;
      const all = [...(inventory.titles || []), ...(inventory.badges || []), ...(inventory.frames || [])];
      return all.find(i => i.inventoryId === invId) || null;
    };
    const targetItem = findItem(itemId);

    // 옵티미스틱: 로컬 equipped 즉시 업데이트
    setEquipped(prev => {
      const next = { ...prev };
      if (slot === 'title') {
        next.title = targetItem ? { id: targetItem.itemId, name: targetItem.name, emoji: targetItem.emoji, rarity: targetItem.rarity } : null;
      } else if (slot === 'frame') {
        next.frame = targetItem ? { id: targetItem.itemId, name: targetItem.name, emoji: targetItem.emoji, rarity: targetItem.rarity } : null;
      } else if (slot === 'badge') {
        if (targetItem) {
          const existing = prev.badges.findIndex(b => b.id === targetItem.itemId);
          if (existing >= 0) {
            next.badges = prev.badges.filter((_, i) => i !== existing);
          } else if (prev.badges.length < 3) {
            const entry = { id: targetItem.itemId, name: targetItem.name, emoji: targetItem.emoji, rarity: targetItem.rarity };
            next.badges = [...prev.badges, entry];
          }
        }
      }
      return next;
    });

    // 옵티미스틱: 인벤토리 isEquipped 플래그 업데이트
    setInventory(prev => {
      if (!prev) return prev;
      const updateList = (list: typeof prev.titles) =>
        list.map(item => {
          if (slot === 'title' && item.itemType === 'title') {
            return { ...item, isEquipped: !!(targetItem && item.inventoryId === targetItem.inventoryId) };
          }
          if (slot === 'frame' && item.itemType === 'avatar_frame') {
            return { ...item, isEquipped: !!(targetItem && item.inventoryId === targetItem.inventoryId) };
          }
          if (slot === 'badge' && item.itemType === 'badge' && targetItem && item.inventoryId === targetItem.inventoryId) {
            return { ...item, isEquipped: !item.isEquipped }; // 토글
          }
          return item;
        });
      return { titles: updateList(prev.titles), badges: updateList(prev.badges), frames: updateList(prev.frames), consumables: prev.consumables };
    });

    // API 호출 (백그라운드)
    const ok = await apiEquipItem(slot, itemId);
    if (!ok) {
      // 실패 시 full sync로 복구
      await refreshState();
    }
    return ok;
  }, [inventory, refreshState]);

  // 소모품 사용 (옵티미스틱 업데이트)
  const useConsumableAction = useCallback(async (inventoryItemId: string) => {
    const result = await apiUseConsumable(inventoryItemId);
    if (result?.success) {
      setInventory(prev => {
        if (!prev) return prev;
        const isBooster = result.effect?.type === 'xp_booster';
        return {
          ...prev,
          consumables: prev.consumables
            .map(item => {
              if (item.inventoryId !== inventoryItemId) return item;
              const newQty = Math.max(0, item.quantity - 1);
              return {
                ...item,
                quantity: newQty,
                isActive: isBooster ? true : item.isActive,
                activeUntil: isBooster ? result.effect?.until : item.activeUntil,
              };
            })
            .filter(item => item.quantity > 0 || item.isActive),
        };
      });
    } else {
      // 실패 시 서버와 인벤토리 동기화 (stale 상태 제거)
      await refreshState();
    }
    return result;
  }, [refreshState]);

  // 프레스티지
  const doPrestigeAction = useCallback(async () => {
    const result = await apiPrestige();
    if (result?.success) {
      playSFX('prestige');
      await refreshState();
    }
    return result;
  }, [refreshState]);

  return {
    config, userState, equipped, levelInfo,
    quests, activeEvents, inventory, achievements,
    loading, synced,
    recordAction,
    claimQuestReward: claimQuest,
    pullGacha: pullGachaAction,
    equipItem: equipAction,
    useConsumable: useConsumableAction,
    doPrestige: doPrestigeAction,
    refreshState,
  };
}
