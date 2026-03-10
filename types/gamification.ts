// ============================================================
// RPG Gamification System - Type Definitions
// ============================================================

// ── 설정 타입 ──

export interface LevelReward {
  credits: number;
  xp_multiplier: number;
  gacha_tickets: number;
}

export interface LevelConfig {
  thresholds: number[];
  titles: string[];
  emojis: string[];
  colors: string[];
  rewards: LevelReward[];
}

export interface XpRateConfig {
  script: number;
  image_per: number;
  audio_per: number;
  video_per: number;
  daily_bonus: number;
  streak_multiplier: number;
  combo_multiplier: number;
  max_combo_multiplier: number;
}

export interface GachaRarity {
  rate: number;
  color: string;
  label: string;
}

export interface GachaSettings {
  pull_interval: number;
  rarities: Record<string, GachaRarity>;
  pity: {
    epic_guarantee: number;
    legendary_guarantee: number;
  };
}

export interface StreakMilestoneReward {
  xp: number;
  credits: number;
}

export interface StreakConfig {
  milestones: number[];
  milestone_rewards: StreakMilestoneReward[];
}

export interface GenerationMilestone {
  count: number;
  emoji: string;
  title: string;
  xp: number;
  credits: number;
}

export interface MilestoneConfig {
  generation_milestones: GenerationMilestone[];
}

export interface PrestigeConfig {
  enabled: boolean;
  xp_multiplier_per_prestige: number;
  max_prestige: number;
  badge_emojis: string[];
}

export interface GameConfig {
  levels: LevelConfig;
  xpRates: XpRateConfig;
  gachaSettings: GachaSettings;
  streakSettings: StreakConfig;
  milestoneSettings: MilestoneConfig;
  prestigeSettings: PrestigeConfig;
}

// ── 업적 타입 ──

export type AchievementCategory = 'creation' | 'exploration' | 'dedication' | 'mastery' | 'hidden';

export type ConditionType =
  | 'total_generations' | 'total_images' | 'total_audio' | 'total_videos'
  | 'streak_days' | 'level_reached' | 'combo_count'
  | 'gacha_pulls' | 'total_xp' | 'login_days'
  | 'special_konami' | 'special_logo_click';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  conditionType: ConditionType;
  conditionTarget: number;
  rewardXp: number;
  rewardCredits: number;
  rewardTitle?: string;
  rewardBadge?: string;
  rewardGachaTickets: number;
  isHidden: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface UserAchievement {
  achievementId: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  notified: boolean;
}

// ── 퀘스트 타입 ──

export type QuestType = 'generate_content' | 'generate_images' | 'generate_audio' | 'create_video' | 'use_style' | 'combo_reach';

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  questType: QuestType;
  target: number;
  rewardXp: number;
  rewardCredits: number;
  minLevel: number;
  maxLevel?: number;
  weight: number;
  isActive: boolean;
}

export interface DailyQuest {
  questId: string;
  name: string;
  description: string;
  icon: string;
  questType: QuestType;
  target: number;
  progress: number;
  completed: boolean;
  rewardClaimed: boolean;
  rewardXp: number;
  rewardCredits: number;
}

// ── 뽑기/인벤토리 타입 ──

export type ItemType = 'title' | 'badge' | 'avatar_frame' | 'xp_booster' | 'credit_voucher';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface GachaItem {
  id: string;
  name: string;
  description?: string;
  itemType: ItemType;
  rarity: Rarity;
  emoji: string;
  effectValue?: { xp_multiplier?: number; duration_hours?: number; credits?: number };
  isActive: boolean;
  sortOrder: number;
}

export interface InventoryItem {
  inventoryId: string;
  itemId: string;
  name: string;
  emoji: string;
  itemType: ItemType;
  rarity: Rarity;
  quantity: number;
  isEquipped: boolean;
  isActive: boolean;
  activeUntil?: string;
  obtainedVia: string;
  effectValue?: { xp_multiplier?: number; duration_hours?: number; credits?: number };
}

export interface EquippedItemInfo {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
}

export interface EquippedItems {
  title: EquippedItemInfo | null;
  badges: EquippedItemInfo[];
  frame: EquippedItemInfo | null;
}

// ── 이벤트 타입 ──

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  icon: string;
  startAt: string;
  endAt: string;
  xpMultiplier: number;
  dropRateMultiplier: number;
  specialGachaItems: string[];
  isActive: boolean;
}

// ── 리더보드 타입 ──

export type LeaderboardPeriod = 'weekly' | 'monthly';
export type LeaderboardCategory = 'xp_earned' | 'generations' | 'streak' | 'level';

export interface LeaderboardEntry {
  rank: number;
  email: string;
  name: string;
  value: number;
  isMe?: boolean;
}

export interface LeaderboardSnapshot {
  id: string;
  periodType: LeaderboardPeriod;
  periodStart: string;
  periodEnd: string;
  category: LeaderboardCategory;
  rankings: LeaderboardEntry[];
  rewardsDistributed: boolean;
}

// ── API 응답 타입 ──

export interface RecordActionResponse {
  xpGained: number;
  totalXp: number;
  newLevel: number | null;
  oldLevel: number;
  levelTitle?: string;
  levelEmoji?: string;
  levelColor?: string;
  levelReward: LevelReward | null;
  achievementsUnlocked: (Achievement & { progress: number })[];
  questProgress: DailyQuest[];
  milestoneReached: GenerationMilestone | null;
  streakUpdated: { count: number; bonus: number; milestoneReward?: StreakMilestoneReward } | null;
  gachaResult: { item: GachaItem; isNew: boolean } | null;
  comboCount: number;
}

export interface GameSyncResponse {
  config: GameConfig;
  user: {
    xp: number;
    level: number;
    totalGenerations: number;
    totalImages: number;
    totalAudio: number;
    totalVideos: number;
    streakCount: number;
    streakLastDate: string | null;
    gachaTickets: number;
    gachaPityEpic: number;
    gachaPityLegendary: number;
    totalGachaPulls: number;
    maxCombo: number;
    prestigeLevel: number;
    prestigeXpBonus: number;
    loginDays: number;
    soundEnabled: boolean;
  };
  equipped: EquippedItems;
  achievements: {
    definitions: Achievement[];
    progress: Record<string, UserAchievement>;
    newlyUnlocked: string[];
  };
  quests: DailyQuest[];
  activeEvents: GameEvent[];
  inventory: {
    titles: InventoryItem[];
    badges: InventoryItem[];
    frames: InventoryItem[];
    consumables: InventoryItem[];
  };
}

// ── 유저 게임 상태 (Hook에서 사용) ──

export interface LevelInfo {
  level: number;
  title: string;
  emoji: string;
  color: string;
  currentXp: number;
  xpForCurrent: number;
  xpForNext: number;
  progress: number; // 0-100
  isMaxLevel: boolean;
}

export interface GameState {
  config: GameConfig | null;
  user: GameSyncResponse['user'] | null;
  equipped: EquippedItems;
  achievements: GameSyncResponse['achievements'] | null;
  quests: DailyQuest[];
  activeEvents: GameEvent[];
  inventory: GameSyncResponse['inventory'] | null;
  levelInfo: LevelInfo;
  loading: boolean;
  synced: boolean;
}

// ── 관리자 타입 ──

export interface AdminAchievementInput {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  condition_type: ConditionType;
  condition_target: number;
  reward_xp: number;
  reward_credits: number;
  reward_title?: string;
  reward_badge?: string;
  reward_gacha_tickets: number;
  is_hidden: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AdminQuestInput {
  id: string;
  name: string;
  description: string;
  icon: string;
  quest_type: QuestType;
  target: number;
  reward_xp: number;
  reward_credits: number;
  min_level: number;
  max_level?: number;
  weight: number;
  is_active: boolean;
}

export interface AdminGachaItemInput {
  id: string;
  name: string;
  description?: string;
  item_type: ItemType;
  rarity: Rarity;
  emoji: string;
  effect_value?: any;
  is_active: boolean;
  sort_order: number;
}

export interface AdminEventInput {
  id: string;
  name: string;
  description: string;
  icon: string;
  start_at: string;
  end_at: string;
  xp_multiplier: number;
  drop_rate_multiplier: number;
  special_gacha_items: string[];
  is_active: boolean;
}

export interface AdminUserGameData {
  email: string;
  xp: number;
  level: number;
  prestigeLevel: number;
  totalGenerations: number;
  totalImages: number;
  totalAudio: number;
  totalVideos: number;
  streakCount: number;
  maxCombo: number;
  gachaTickets: number;
  totalGachaPulls: number;
  loginDays: number;
  achievements: (Achievement & UserAchievement)[];
  inventory: InventoryItem[];
  equipped: EquippedItems;
  recentQuests: DailyQuest[];
}

// ── 사운드 타입 ──

export type SoundType =
  | 'levelUp' | 'achievement' | 'questComplete'
  | 'gachaCommon' | 'gachaUncommon' | 'gachaRare' | 'gachaEpic' | 'gachaLegendary'
  | 'gachaSpin' | 'gachaRevealDrum'
  | 'gachaMultiSpin' | 'gachaMultiSlotReveal' | 'gachaMultiComplete'
  | 'combo' | 'prestige' | 'milestone';
