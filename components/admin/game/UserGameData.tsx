import React, { useState, useCallback } from 'react';
import { gameFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface UserGameProfile {
  xp: number;
  level: number;
  prestige: number;
  total_generations: number;
  total_images: number;
  total_audio: number;
  total_videos: number;
  streak_count: number;
  max_combo: number;
  gacha_tickets: number;
  total_pulls: number;
  login_days: number;
  last_login_date: string | null;
  title: string;
  title_emoji: string;
}

interface UserAchievement {
  id: string;
  name: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
  unlocked_at: string | null;
}

interface UserInventoryItem {
  id: string;
  name: string;
  emoji: string;
  rarity: string;
  count: number;
  effect_type: string;
  obtained_at: string;
}

interface GachaPoolItem {
  id: string;
  name: string;
  emoji: string;
  rarity: string;
}

interface AchievementOption {
  id: string;
  name: string;
  icon: string;
}

const RARITY_STYLES: Record<string, string> = {
  common: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  uncommon: 'bg-green-500/20 text-green-400 border-green-500/30',
  rare: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  epic: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  legendary: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const RARITY_LABELS: Record<string, string> = {
  common: '일반', uncommon: '비일반', rare: '레어', epic: '에픽', legendary: '전설',
};

const UserGameData: React.FC<Props> = ({ adminToken, onToast }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserGameProfile | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [inventory, setInventory] = useState<UserInventoryItem[]>([]);
  const [gachaPool, setGachaPool] = useState<GachaPoolItem[]>([]);
  const [achievementOptions, setAchievementOptions] = useState<AchievementOption[]>([]);

  // 관리자 액션 상태
  const [grantXpAmount, setGrantXpAmount] = useState(100);
  const [grantTicketAmount, setGrantTicketAmount] = useState(1);
  const [grantItemId, setGrantItemId] = useState('');
  const [grantAchievementId, setGrantAchievementId] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const searchUser = useCallback(async () => {
    if (!email.trim()) { onToast('error', '이메일을 입력해주세요.'); return; }
    setLoading(true);
    setProfile(null);
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-userGameData', adminToken, email: email.trim() });
      if (ok) {
        setProfile(data.profile || null);
        setAchievements(data.achievements || []);
        setInventory(data.inventory || []);
        setGachaPool(data.gachaPool || []);
        setAchievementOptions(data.achievementOptions || []);
        if (!data.profile) onToast('error', '해당 유저의 게임 데이터가 없습니다.');
      } else {
        onToast('error', data.message || '유저 데이터를 불러올 수 없습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, email, onToast]);

  const handleGrantXp = async () => {
    if (grantXpAmount <= 0) { onToast('error', 'XP 양을 입력해주세요.'); return; }
    setActionLoading('xp');
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-grantXp', adminToken, email: email.trim(), amount: grantXpAmount });
      if (ok) {
        onToast('success', data.message || `XP ${grantXpAmount} 지급 완료`);
        searchUser();
      } else {
        onToast('error', data.message || 'XP 지급에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setActionLoading(null);
  };

  const handleGrantTickets = async () => {
    if (grantTicketAmount <= 0) { onToast('error', '티켓 수량을 입력해주세요.'); return; }
    setActionLoading('tickets');
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-grantTickets', adminToken, email: email.trim(), amount: grantTicketAmount });
      if (ok) {
        onToast('success', data.message || `뽑기티켓 ${grantTicketAmount}장 지급 완료`);
        searchUser();
      } else {
        onToast('error', data.message || '뽑기티켓 지급에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setActionLoading(null);
  };

  const handleGrantItem = async () => {
    if (!grantItemId) { onToast('error', '아이템을 선택해주세요.'); return; }
    setActionLoading('item');
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-grantItem', adminToken, email: email.trim(), itemId: grantItemId });
      if (ok) {
        onToast('success', data.message || '아이템 지급 완료');
        searchUser();
      } else {
        onToast('error', data.message || '아이템 지급에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setActionLoading(null);
  };

  const handleGrantAchievement = async () => {
    if (!grantAchievementId) { onToast('error', '업적을 선택해주세요.'); return; }
    setActionLoading('achievement');
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-grantAchievement', adminToken, email: email.trim(), achievementId: grantAchievementId });
      if (ok) {
        onToast('success', data.message || '업적 부여 완료');
        searchUser();
      } else {
        onToast('error', data.message || '업적 부여에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setActionLoading(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') searchUser();
  };

  return (
    <div className="space-y-4">
      {/* 검색 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="유저 이메일 입력..."
            className="flex-1 px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
          <button onClick={searchUser} disabled={loading}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-all disabled:opacity-50">
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      )}

      {profile && !loading && (
        <>
          {/* 프로필 요약 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{profile.title_emoji || '\uD83C\uDF31'}</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">{email}</h3>
                <p className="text-[11px] text-slate-500">{profile.title || '초보 크리에이터'} | 프레스티지 {profile.prestige}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: 'XP', value: profile.xp.toLocaleString(), color: 'text-cyan-400' },
                { label: '레벨', value: profile.level, color: 'text-green-400' },
                { label: '프레스티지', value: profile.prestige, color: 'text-purple-400' },
                { label: '총 생성', value: profile.total_generations, color: 'text-slate-300' },
                { label: '이미지', value: profile.total_images, color: 'text-slate-300' },
                { label: '오디오', value: profile.total_audio, color: 'text-slate-300' },
                { label: '영상', value: profile.total_videos, color: 'text-slate-300' },
                { label: '연속 접속', value: `${profile.streak_count}일`, color: 'text-amber-400' },
                { label: '최대 콤보', value: profile.max_combo, color: 'text-red-400' },
                { label: '뽑기권', value: profile.gacha_tickets, color: 'text-yellow-400' },
                { label: '총 뽑기', value: profile.total_pulls, color: 'text-slate-300' },
                { label: '접속 일수', value: `${profile.login_days}일`, color: 'text-blue-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-800/40 border border-slate-800 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">{stat.label}</p>
                  <p className={`text-sm font-semibold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 업적 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">업적 ({achievements.filter(a => a.unlocked).length}/{achievements.length})</h4>
            {achievements.length === 0 ? (
              <p className="text-[11px] text-slate-500">업적 데이터가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {achievements.map(ach => (
                  <div key={ach.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    ach.unlocked
                      ? 'bg-green-900/20 border-green-700/30'
                      : 'bg-slate-800/30 border-slate-800/50 opacity-60'
                  }`}>
                    <span className="text-lg">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-200 font-medium truncate">{ach.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${Math.min(100, (ach.progress / ach.target) * 100)}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-500 flex-shrink-0">{ach.progress}/{ach.target}</span>
                      </div>
                    </div>
                    {ach.unlocked && <span className="text-green-400 text-[10px] flex-shrink-0">완료</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 인벤토리 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">인벤토리 ({inventory.length})</h4>
            {inventory.length === 0 ? (
              <p className="text-[11px] text-slate-500">보유 아이템이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {inventory.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-800 rounded-lg">
                    <span className="text-lg">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-200 font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${RARITY_STYLES[item.rarity] || RARITY_STYLES.common}`}>
                          {RARITY_LABELS[item.rarity] || item.rarity}
                        </span>
                        {item.count > 1 && <span className="text-[9px] text-slate-500">x{item.count}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 관리자 액션 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-4">관리자 액션</h4>
            <div className="space-y-4">
              {/* XP 지급 */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-[10px] text-slate-500 block">XP 지급</label>
                  <input type="number" value={grantXpAmount} onChange={e => setGrantXpAmount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <button onClick={handleGrantXp} disabled={actionLoading === 'xp'}
                  className="px-4 py-2 bg-blue-600/20 border border-blue-600/30 rounded-lg text-[11px] text-blue-400 hover:bg-blue-600/30 transition-all disabled:opacity-50 w-full sm:w-auto">
                  {actionLoading === 'xp' ? '처리 중...' : 'XP 지급'}
                </button>
              </div>

              {/* 뽑기티켓 지급 */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-[10px] text-slate-500 block">뽑기티켓 지급</label>
                  <input type="number" value={grantTicketAmount} onChange={e => setGrantTicketAmount(parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <button onClick={handleGrantTickets} disabled={actionLoading === 'tickets'}
                  className="px-4 py-2 bg-yellow-600/20 border border-yellow-600/30 rounded-lg text-[11px] text-yellow-400 hover:bg-yellow-600/30 transition-all disabled:opacity-50 w-full sm:w-auto">
                  {actionLoading === 'tickets' ? '처리 중...' : '티켓 지급'}
                </button>
              </div>

              {/* 아이템 지급 */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-[10px] text-slate-500 block">아이템 지급</label>
                  <select value={grantItemId} onChange={e => setGrantItemId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    <option value="">아이템 선택...</option>
                    {gachaPool.map(item => (
                      <option key={item.id} value={item.id}>{item.emoji} {item.name} ({RARITY_LABELS[item.rarity] || item.rarity})</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleGrantItem} disabled={actionLoading === 'item'}
                  className="px-4 py-2 bg-purple-600/20 border border-purple-600/30 rounded-lg text-[11px] text-purple-400 hover:bg-purple-600/30 transition-all disabled:opacity-50 w-full sm:w-auto">
                  {actionLoading === 'item' ? '처리 중...' : '아이템 지급'}
                </button>
              </div>

              {/* 업적 부여 */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-[10px] text-slate-500 block">업적 부여</label>
                  <select value={grantAchievementId} onChange={e => setGrantAchievementId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    <option value="">업적 선택...</option>
                    {achievementOptions.map(ach => (
                      <option key={ach.id} value={ach.id}>{ach.icon} {ach.name}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleGrantAchievement} disabled={actionLoading === 'achievement'}
                  className="px-4 py-2 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all disabled:opacity-50 w-full sm:w-auto">
                  {actionLoading === 'achievement' ? '처리 중...' : '업적 부여'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {!profile && !loading && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">유저 이메일을 입력하고 검색해주세요.</p>
        </div>
      )}
    </div>
  );
};

export default UserGameData;
