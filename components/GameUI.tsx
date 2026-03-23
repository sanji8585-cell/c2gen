import React from 'react';
import EventBanner from './EventBanner';
import DailyQuestPanel from './DailyQuestPanel';
import GameOverlay from './GameOverlay';
import CompletionScreen from './CompletionScreen';
import AchievementShowcase from './AchievementShowcase';
import InventoryModal from './InventoryModal';
import LeaderboardWidget from './LeaderboardWidget';

interface GameUIProps {
  game: any;
  isDark: boolean;
  overlayLevelUp: any;
  overlayAchievement: any;
  overlayGacha: any;
  overlayMilestone: any;
  setOverlayLevelUp: (v: any) => void;
  setOverlayAchievement: (v: any) => void;
  setOverlayGacha: (v: any) => void;
  setOverlayMilestone: (v: any) => void;
  completionData: any;
  setCompletionData: (v: any) => void;
  setShowThumbnailGenerator: (v: boolean) => void;
  showAchievements: boolean;
  setShowAchievements: (v: boolean) => void;
  showInventory: boolean;
  setShowInventory: (v: boolean) => void;
  showLeaderboard: boolean;
  setShowLeaderboard: (v: boolean) => void;
  setConsumablePopup: (v: any) => void;
  fetchCredits: () => Promise<void>;
}

const GameUI: React.FC<GameUIProps> = ({
  game, isDark,
  overlayLevelUp, overlayAchievement, overlayGacha, overlayMilestone,
  setOverlayLevelUp, setOverlayAchievement, setOverlayGacha, setOverlayMilestone,
  completionData, setCompletionData, setShowThumbnailGenerator,
  showAchievements, setShowAchievements,
  showInventory, setShowInventory,
  showLeaderboard, setShowLeaderboard,
  setConsumablePopup, fetchCredits,
}) => {
  return (
    <>
      {/* 이벤트 배너 */}
      <EventBanner events={game.activeEvents} isDark={isDark} />

      {/* 일일 퀘스트 패널 */}
      {game.synced && (
        <DailyQuestPanel
          quests={game.quests}
          onClaimReward={game.claimQuestReward}
          isDark={isDark}
        />
      )}

      {/* 게임 오버레이 (레벨업/업적/뽑기/마일스톤) */}
      {(overlayLevelUp || overlayAchievement || overlayGacha || overlayMilestone) && (
        <GameOverlay
          levelUp={overlayLevelUp}
          achievementUnlock={overlayAchievement}
          gachaResult={overlayGacha}
          milestone={overlayMilestone}
          gachaSettings={game.config?.gachaSettings}
          onDismiss={() => { setOverlayLevelUp(null); setOverlayAchievement(null); setOverlayGacha(null); setOverlayMilestone(null); }}
        />
      )}

      {/* 생성 완료 결과 화면 */}
      {completionData && (
        <CompletionScreen
          {...completionData}
          onClose={() => setCompletionData(null)}
          onOpenThumbnail={() => { setCompletionData(null); setShowThumbnailGenerator(true); }}
        />
      )}

      {/* 업적 쇼케이스 모달 */}
      {showAchievements && game.achievements && (
        <AchievementShowcase
          isOpen={showAchievements}
          onClose={() => setShowAchievements(false)}
          achievements={game.achievements}
          isDark={isDark}
        />
      )}

      {/* 인벤토리 모달 */}
      {showInventory && game.inventory && (
        <InventoryModal
          isOpen={showInventory}
          onClose={() => setShowInventory(false)}
          inventory={game.inventory}
          equipped={game.equipped}
          gachaTickets={game.userState?.gachaTickets ?? 0}
          onEquipItem={game.equipItem}
          onUseConsumable={async (inventoryItemId: string) => {
            const result = await game.useConsumable(inventoryItemId);
            if (result?.success) {
              if (result.effect?.type === 'credit_voucher') {
                await fetchCredits();
                setConsumablePopup({ type: 'credit_voucher', credits: result.effect.credits });
                setTimeout(() => setConsumablePopup(null), 3500);
              } else if (result.effect?.type === 'xp_booster') {
                setConsumablePopup({ type: 'xp_booster', multiplier: result.effect.multiplier, until: result.effect.until });
                setTimeout(() => setConsumablePopup(null), 4000);
              }
            }
          }}
          onPullGacha={async () => {
            const result = await game.pullGacha();
            if (result?.item) {
              setOverlayGacha({ item: result.item, isNew: result.isNew });
              Promise.all([game.recordAction('gacha_pull', 1), game.refreshState()]).catch(() => {});
            }
          }}
          onPullGachaMulti={async () => {
            const result = await game.pullGacha();
            if (result?.item) {
              game.recordAction('gacha_pull', 1).catch(() => {});
            }
            game.refreshState().catch(() => {});
            return result;
          }}
          isDark={isDark}
        />
      )}

      {/* 리더보드 모달 */}
      <LeaderboardWidget
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        userLevel={game.levelInfo.level}
        userXp={game.levelInfo.currentXp}
        userStreak={game.userState?.streakCount ?? 0}
        isDark={isDark}
      />
    </>
  );
};

export default GameUI;
