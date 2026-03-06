import React, { useState, useMemo } from 'react';
import type { InventoryItem, EquippedItems, Rarity } from '../types/gamification';

// ── 타입 정의 ──

type TabKey = 'titles' | 'badges' | 'frames' | 'consumables' | 'gacha';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: {
    titles: InventoryItem[];
    badges: InventoryItem[];
    frames: InventoryItem[];
    consumables: InventoryItem[];
  };
  equipped: EquippedItems;
  gachaTickets: number;
  onEquipItem: (slot: 'title' | 'badge' | 'frame', itemId: string | null) => void;
  onUseConsumable: (inventoryItemId: string) => void;
  onPullGacha: () => void;
  isDark: boolean;
}

// ── 상수 ──

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

const RARITY_LABELS: Record<Rarity, string> = {
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
};

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'titles', label: '칭호', icon: '🏷️' },
  { key: 'badges', label: '뱃지', icon: '🎖️' },
  { key: 'frames', label: '프레임', icon: '🖼️' },
  { key: 'consumables', label: '소모품', icon: '🧪' },
  { key: 'gacha', label: '뽑기', icon: '🎰' },
];

// ── 서브 컴포넌트 ──

const RarityBadge: React.FC<{ rarity: Rarity }> = ({ rarity }) => (
  <span
    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase leading-none"
    style={{
      backgroundColor: `${RARITY_COLORS[rarity]}20`,
      color: RARITY_COLORS[rarity],
      border: `1px solid ${RARITY_COLORS[rarity]}40`,
    }}
  >
    {RARITY_LABELS[rarity]}
  </span>
);

const EquippedSlot: React.FC<{
  label: string;
  item: { id: string; name: string; emoji: string } | null;
  isDark: boolean;
}> = ({ label, item, isDark }) => (
  <div
    className="flex flex-col items-center gap-1 min-w-[72px]"
    style={{
      padding: '8px',
      borderRadius: '10px',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      border: item
        ? '2px solid #f59e0b'
        : `1px dashed ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
    }}
  >
    <span className="text-[10px] font-medium opacity-50 uppercase tracking-wider">{label}</span>
    {item ? (
      <>
        <span className="text-2xl leading-none">{item.emoji}</span>
        <span className="text-[11px] font-medium text-center leading-tight truncate max-w-[64px]">
          {item.name}
        </span>
      </>
    ) : (
      <>
        <span className="text-2xl leading-none opacity-20">-</span>
        <span className="text-[11px] opacity-30">비어있음</span>
      </>
    )}
  </div>
);

// ── 메인 컴포넌트 ──

const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  inventory,
  equipped,
  gachaTickets,
  onEquipItem,
  onUseConsumable,
  onPullGacha,
  isDark,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('titles');

  // 탭별 아이템 정렬: 장착 중 우선, 전설 우선
  const RARITY_ORDER: Record<Rarity, number> = useMemo(
    () => ({ legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 }),
    []
  );

  const sortedItems = useMemo(() => {
    if (activeTab === 'gacha') return [];
    const items = [...(inventory[activeTab] || [])];
    items.sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) return a.isEquipped ? -1 : 1;
      const ra = RARITY_ORDER[a.rarity] ?? 5;
      const rb = RARITY_ORDER[b.rarity] ?? 5;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    return items;
  }, [activeTab, inventory, RARITY_ORDER]);

  if (!isOpen) return null;

  // 테마 변수
  const bgSurface = isDark ? '#1e1e2e' : '#ffffff';
  const bgOverlay = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardHoverBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';

  const handleEquipToggle = (item: InventoryItem) => {
    const slotMap: Record<string, 'title' | 'badge' | 'frame'> = {
      title: 'title',
      badge: 'badge',
      avatar_frame: 'frame',
    };
    const slot = slotMap[item.itemType];
    if (!slot) return;

    if (item.isEquipped) {
      onEquipItem(slot, null);
    } else {
      onEquipItem(slot, item.inventoryId);
    }
  };

  const isEquippableTab = activeTab === 'titles' || activeTab === 'badges' || activeTab === 'frames';

  // 아이템 카드 렌더링
  const renderItemCard = (item: InventoryItem) => {
    const isEquipped = item.isEquipped;
    const isConsumable = activeTab === 'consumables';
    const isActiveConsumable = isConsumable && item.isActive;

    return (
      <div
        key={item.inventoryId}
        className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 cursor-default group"
        style={{
          backgroundColor: cardBg,
          border: isEquipped
            ? '2px solid #f59e0b'
            : `1px solid ${borderColor}`,
          boxShadow: isEquipped
            ? '0 0 12px rgba(245,158,11,0.2), inset 0 0 12px rgba(245,158,11,0.05)'
            : 'none',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = cardHoverBg;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = cardBg;
        }}
      >
        {/* 장착 표시 */}
        {isEquipped && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
            <span className="text-[10px] text-white font-bold">E</span>
          </div>
        )}

        {/* 활성 소모품 표시 */}
        {isActiveConsumable && (
          <div className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full bg-green-500 text-white text-[9px] font-bold shadow-md">
            활성
          </div>
        )}

        {/* 이모지 */}
        <span className="text-3xl leading-none select-none">{item.emoji}</span>

        {/* 이름 */}
        <span
          className="text-xs font-semibold text-center leading-tight line-clamp-2"
          style={{ color: textPrimary }}
        >
          {item.name}
        </span>

        {/* 희귀도 + 수량 */}
        <div className="flex items-center gap-1.5">
          <RarityBadge rarity={item.rarity} />
          {item.quantity > 1 && (
            <span
              className="text-[10px] font-bold"
              style={{ color: textSecondary }}
            >
              x{item.quantity}
            </span>
          )}
        </div>

        {/* 효과 정보 (소모품) */}
        {isConsumable && item.effectValue && (
          <div
            className="text-[10px] text-center leading-tight px-1"
            style={{ color: textSecondary }}
          >
            {item.effectValue.xp_multiplier && (
              <span>XP x{item.effectValue.xp_multiplier}</span>
            )}
            {item.effectValue.duration_hours && (
              <span> / {item.effectValue.duration_hours}h</span>
            )}
            {item.effectValue.credits && (
              <span>+{item.effectValue.credits} 크레딧</span>
            )}
          </div>
        )}

        {/* 활성 종료 시간 */}
        {isActiveConsumable && item.activeUntil && (
          <div className="text-[9px] text-green-400 font-medium">
            ~{new Date(item.activeUntil).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* 액션 버튼 */}
        {isEquippableTab && (
          <button
            onClick={() => handleEquipToggle(item)}
            className="w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150"
            style={{
              backgroundColor: isEquipped
                ? 'rgba(245,158,11,0.15)'
                : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
              color: isEquipped ? '#f59e0b' : textSecondary,
              border: isEquipped
                ? '1px solid rgba(245,158,11,0.3)'
                : `1px solid ${borderColor}`,
            }}
            onMouseEnter={(e) => {
              if (isEquipped) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.15)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.3)';
              } else {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(59,130,246,0.15)';
                (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (isEquipped) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(245,158,11,0.15)';
                (e.currentTarget as HTMLButtonElement).style.color = '#f59e0b';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.3)';
              } else {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.06)';
                (e.currentTarget as HTMLButtonElement).style.color = textSecondary;
                (e.currentTarget as HTMLButtonElement).style.borderColor = borderColor;
              }
            }}
          >
            {isEquipped ? '해제' : '장착'}
          </button>
        )}

        {isConsumable && !isActiveConsumable && (
          <button
            onClick={() => onUseConsumable(item.inventoryId)}
            className="w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150"
            style={{
              backgroundColor: 'rgba(34,197,94,0.12)',
              color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.25)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(34,197,94,0.25)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(34,197,94,0.12)';
            }}
          >
            사용
          </button>
        )}
      </div>
    );
  };

  // 빈 상태 렌더링
  const renderEmptyState = (tabKey: TabKey) => {
    const messages: Record<TabKey, { icon: string; text: string }> = {
      titles: { icon: '🏷️', text: '획득한 칭호가 없습니다.\n업적 달성이나 뽑기를 통해 칭호를 얻어보세요!' },
      badges: { icon: '🎖️', text: '획득한 뱃지가 없습니다.\n다양한 활동으로 뱃지를 수집해보세요!' },
      frames: { icon: '🖼️', text: '획득한 프레임이 없습니다.\n뽑기에서 특별한 프레임을 얻어보세요!' },
      consumables: { icon: '🧪', text: '보유한 소모품이 없습니다.\n뽑기를 통해 부스터 아이템을 얻어보세요!' },
      gacha: { icon: '🎰', text: '' },
    };
    const msg = messages[tabKey];
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="text-5xl opacity-30">{msg.icon}</span>
        <p
          className="text-sm text-center whitespace-pre-line leading-relaxed"
          style={{ color: textSecondary }}
        >
          {msg.text}
        </p>
      </div>
    );
  };

  // 뽑기 탭 렌더링
  const renderGachaTab = () => (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* 뽑기 비주얼 */}
      <div
        className="relative w-32 h-32 rounded-2xl flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #f59e0b 100%)',
          boxShadow: '0 0 40px rgba(139,92,246,0.3), 0 0 80px rgba(236,72,153,0.15)',
        }}
      >
        <span className="text-6xl animate-bounce">🎰</span>
        <div
          className="absolute inset-0 rounded-2xl animate-pulse"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), transparent)',
          }}
        />
      </div>

      {/* 티켓 수 */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium" style={{ color: textSecondary }}>
          보유 뽑기권
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl">🎫</span>
          <span
            className="text-3xl font-black tabular-nums"
            style={{
              color: gachaTickets > 0 ? '#8b5cf6' : textSecondary,
            }}
          >
            {gachaTickets}
          </span>
          <span className="text-sm font-medium" style={{ color: textSecondary }}>
            장
          </span>
        </div>
      </div>

      {/* 뽑기 버튼 */}
      <button
        onClick={onPullGacha}
        disabled={gachaTickets <= 0}
        className="relative px-8 py-3.5 rounded-xl text-base font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: gachaTickets > 0
            ? 'linear-gradient(135deg, #8b5cf6, #ec4899)'
            : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          boxShadow: gachaTickets > 0
            ? '0 4px 20px rgba(139,92,246,0.4)'
            : 'none',
          color: gachaTickets > 0 ? '#ffffff' : textSecondary,
        }}
        onMouseEnter={(e) => {
          if (gachaTickets > 0) {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 30px rgba(139,92,246,0.5)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          if (gachaTickets > 0) {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(139,92,246,0.4)';
          }
        }}
      >
        1회 뽑기
      </button>

      {gachaTickets <= 0 && (
        <p className="text-xs text-center" style={{ color: textSecondary }}>
          뽑기권이 부족합니다. 레벨업, 업적 달성, 출석 보상으로 획득할 수 있습니다.
        </p>
      )}

      {/* 확률 안내 */}
      <div
        className="w-full max-w-xs rounded-xl p-4"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${borderColor}`,
        }}
      >
        <h4
          className="text-xs font-bold mb-3 text-center uppercase tracking-wider"
          style={{ color: textSecondary }}
        >
          등급별 확률
        </h4>
        <div className="flex flex-col gap-2">
          {(
            [
              { rarity: 'legendary' as Rarity, rate: '1%' },
              { rarity: 'epic' as Rarity, rate: '5%' },
              { rarity: 'rare' as Rarity, rate: '15%' },
              { rarity: 'uncommon' as Rarity, rate: '35%' },
              { rarity: 'common' as Rarity, rate: '44%' },
            ] as const
          ).map(({ rarity, rate }) => (
            <div key={rarity} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: RARITY_COLORS[rarity] }}
                />
                <span className="text-xs font-medium" style={{ color: textPrimary }}>
                  {RARITY_LABELS[rarity]}
                </span>
              </div>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: RARITY_COLORS[rarity] }}
              >
                {rate}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: bgOverlay, backdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: bgSurface,
          color: textPrimary,
          border: `1px solid ${borderColor}`,
        }}
      >
        {/* ── 헤더 ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎒</span>
            <h2 className="text-lg sm:text-xl font-bold">인벤토리</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-colors duration-150"
            style={{
              color: textSecondary,
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = isDark
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        {/* ── 현재 장착 중인 아이템 ── */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
              장착 중
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <EquippedSlot label="칭호" item={equipped.title} isDark={isDark} />
            <EquippedSlot label="프레임" item={equipped.frame} isDark={isDark} />
            {/* 뱃지 슬롯들 (최대 3개 표시) */}
            {[0, 1, 2].map((idx) => (
              <EquippedSlot
                key={`badge-slot-${idx}`}
                label={`뱃지${idx + 1}`}
                item={equipped.badges[idx] || null}
                isDark={isDark}
              />
            ))}
          </div>
        </div>

        {/* ── 탭 네비게이션 ── */}
        <div
          className="flex shrink-0 overflow-x-auto"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count =
              tab.key === 'gacha'
                ? gachaTickets
                : (inventory[tab.key as keyof typeof inventory] || []).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-150"
                style={{
                  color: isActive ? '#8b5cf6' : textSecondary,
                  backgroundColor: isActive
                    ? isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)'
                    : 'transparent',
                  borderBottom: isActive ? '2px solid #8b5cf6' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = isDark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                    style={{
                      backgroundColor: isActive
                        ? 'rgba(139,92,246,0.15)'
                        : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                      color: isActive ? '#8b5cf6' : textSecondary,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── 탭 콘텐츠 ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
          {activeTab === 'gacha' ? (
            renderGachaTab()
          ) : sortedItems.length === 0 ? (
            renderEmptyState(activeTab)
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {sortedItems.map((item) => renderItemCard(item))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryModal;
