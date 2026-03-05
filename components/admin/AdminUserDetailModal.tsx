import React, { useState, useEffect, useCallback } from 'react';
import {
  UserInfo, UsageBreakdown, UsageLog, ACTION_LABELS,
  GameProfile, EquippedInfo, AchievementSummary,
  authFetch, formatUsd, formatCost, timeAgo,
} from './adminUtils';

interface Props {
  user: UserInfo;
  adminToken: string;
  onClose: () => void;
  onToast: (type: 'success' | 'error', message: string) => void;
  onRefresh?: () => void;
}

interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  charge: '충전', deduct: '차감', subscription: '구독', bonus: '보너스', refund: '환불', admin: '관리자',
};
const TYPE_COLORS: Record<string, string> = {
  charge: 'text-emerald-400', deduct: 'text-red-400', subscription: 'text-blue-400',
  bonus: 'text-yellow-400', refund: 'text-orange-400', admin: 'text-purple-400',
};

const PLAN_BADGES: Record<string, string> = {
  free: 'bg-slate-600/30 text-slate-400 border-slate-600/30',
  basic: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  pro: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  operator: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
};

const AdminUserDetailModal: React.FC<Props> = ({ user, adminToken, onClose, onToast, onRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<UsageBreakdown | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [activeSessions, setActiveSessions] = useState(0);

  // 게임 프로필
  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [equipped, setEquipped] = useState<EquippedInfo | null>(null);
  const [achSummary, setAchSummary] = useState<AchievementSummary | null>(null);

  // 빠른 지급
  const [grantXpAmount, setGrantXpAmount] = useState('');
  const [grantTicketAmount, setGrantTicketAmount] = useState('');
  const [granting, setGranting] = useState(false);

  // 크레딧 관련
  const [currentCredits, setCurrentCredits] = useState(user.credits);
  const [currentPlan, setCurrentPlan] = useState(user.plan || 'free');
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { ok, data } = await authFetch({ action: 'userDetail', adminToken, email: user.email });
        if (ok) {
          setBreakdown(data.breakdown || {});
          setLogs(data.recentUsage || []);
          setActiveSessions(data.activeSessions || 0);
          if (data.gameProfile) setGameProfile(data.gameProfile);
          if (data.equipped) setEquipped(data.equipped);
          if (data.achievementSummary) setAchSummary(data.achievementSummary);
        }
      } catch {}
      setLoading(false);
    })();
  }, [adminToken, user.email]);

  // 크레딧 거래 내역 로드
  const loadCreditHistory = useCallback(async () => {
    setTxLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'admin-creditHistory', adminToken, email: user.email });
      if (ok) {
        setCurrentCredits(data.credits);
        setCurrentPlan(data.plan);
        setTransactions(data.transactions || []);
      }
    } catch {}
    setTxLoading(false);
  }, [adminToken, user.email]);

  useEffect(() => { loadCreditHistory(); }, [loadCreditHistory]);

  // 크레딧 조정
  const handleAdjust = useCallback(async () => {
    const amount = parseInt(adjustAmount);
    if (!amount || isNaN(amount)) { onToast('error', '금액을 입력하세요.'); return; }
    setAdjusting(true);
    try {
      const { ok, data } = await authFetch({
        action: 'admin-adjustCredits', adminToken,
        email: user.email, amount, description: adjustDesc || undefined,
      });
      if (ok) {
        onToast('success', data.message);
        setCurrentCredits(data.balance);
        setAdjustAmount('');
        setAdjustDesc('');
        loadCreditHistory();
        onRefresh?.();
      } else {
        onToast('error', data.message || data.error || '조정 실패');
      }
    } catch { onToast('error', '서버 연결에 실패했습니다.'); }
    setAdjusting(false);
  }, [adjustAmount, adjustDesc, adminToken, user.email, onToast, loadCreditHistory, onRefresh]);

  const handleRevokeSession = useCallback(async () => {
    if (!confirm(`${user.email}의 모든 세션을 강제 만료하시겠습니까?`)) return;
    try {
      const { ok, data } = await authFetch({ action: 'revokeSession', adminToken, email: user.email });
      if (ok) { onToast('success', data.message); setActiveSessions(0); }
      else { onToast('error', data.message || '처리에 실패했습니다.'); }
    } catch { onToast('error', '서버 연결에 실패했습니다.'); }
  }, [adminToken, user.email, onToast]);

  // XP 지급
  const handleGrantXp = useCallback(async () => {
    const amount = parseInt(grantXpAmount);
    if (!amount || amount <= 0) { onToast('error', 'XP 수량을 입력하세요.'); return; }
    setGranting(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-grantXp', adminToken, email: user.email, amount });
      if (ok) {
        onToast('success', `XP ${amount} 지급 완료 (Lv.${data.newLevel})`);
        setGameProfile(prev => prev ? { ...prev, xp: data.newXp, level: data.newLevel } : prev);
        setGrantXpAmount('');
      } else { onToast('error', data.message || 'XP 지급 실패'); }
    } catch { onToast('error', '서버 연결에 실패했습니다.'); }
    setGranting(false);
  }, [grantXpAmount, adminToken, user.email, onToast]);

  // 뽑기권 지급
  const handleGrantTickets = useCallback(async () => {
    const amount = parseInt(grantTicketAmount);
    if (!amount || amount <= 0) { onToast('error', '뽑기권 수량을 입력하세요.'); return; }
    setGranting(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-grantTickets', adminToken, email: user.email, amount });
      if (ok) {
        onToast('success', `뽑기권 ${amount}장 지급 완료`);
        setGameProfile(prev => prev ? { ...prev, gachaTickets: data.newTickets } : prev);
        setGrantTicketAmount('');
      } else { onToast('error', data.message || '뽑기권 지급 실패'); }
    } catch { onToast('error', '서버 연결에 실패했습니다.'); }
    setGranting(false);
  }, [grantTicketAmount, adminToken, user.email, onToast]);

  // XP 바 계산
  const LEVEL_THRESHOLDS = [0,50,120,200,350,500,750,1000,1500,2500,3500,5000,7000,9500,12500,16000,20000,25000,31000,38000,46000,55000,65000,76000,88000,101000,115000,130000,150000,175000];
  const getXpProgress = (xp: number, level: number) => {
    const currentThreshold = LEVEL_THRESHOLDS[level] || 0;
    const nextThreshold = LEVEL_THRESHOLDS[level + 1] || currentThreshold + 1000;
    const progress = nextThreshold > currentThreshold ? ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100 : 100;
    return { progress: Math.min(100, Math.max(0, progress)), currentThreshold, nextThreshold };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-200">{user.name}</h3>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${PLAN_BADGES[currentPlan] || PLAN_BADGES.free}`}>
              {currentPlan.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-slate-500">보유 크레딧</p>
              <p className="text-lg font-black text-emerald-400">{currentCredits.toLocaleString()}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* 크레딧 조정 */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
            <h4 className="text-xs font-medium text-slate-400 mb-3">크레딧 조정</h4>
            <div className="flex gap-2 flex-wrap">
              <input
                type="number"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="+추가 / -차감"
                className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
              />
              <input
                type="text"
                value={adjustDesc}
                onChange={e => setAdjustDesc(e.target.value)}
                placeholder="사유 (선택)"
                className="flex-1 min-w-[120px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
              />
              <button
                onClick={handleAdjust}
                disabled={adjusting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
              >
                {adjusting ? '처리중...' : '조정'}
              </button>
            </div>
          </div>

          {/* 게임 프로필 */}
          {gameProfile && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
              <h4 className="text-xs font-medium text-slate-400 mb-3">🎮 게임 프로필</h4>

              {/* 레벨 + XP 바 */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg font-bold text-green-400">Lv.{gameProfile.level}</span>
                  {gameProfile.prestigeLevel > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium">
                      ⭐ P{gameProfile.prestigeLevel}
                    </span>
                  )}
                </div>
                {(() => {
                  const { progress, currentThreshold, nextThreshold } = getXpProgress(gameProfile.xp, gameProfile.level);
                  return (
                    <div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {gameProfile.xp.toLocaleString()} / {nextThreshold.toLocaleString()} XP ({progress.toFixed(1)}%)
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* 게임 스탯 */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">🔥 스트릭</p>
                  <p className="text-sm font-bold text-orange-400">{gameProfile.streakCount}일</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">⚡ 최대콤보</p>
                  <p className="text-sm font-bold text-yellow-400">{gameProfile.maxCombo}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">🎰 뽑기권</p>
                  <p className="text-sm font-bold text-pink-400">{gameProfile.gachaTickets}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">📊 총뽑기</p>
                  <p className="text-sm font-bold text-slate-300">{gameProfile.totalPulls}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">📅 접속일</p>
                  <p className="text-sm font-bold text-slate-300">{gameProfile.loginDays}일</p>
                </div>
              </div>

              {/* 장착 아이템 */}
              {equipped && (equipped.title || equipped.badges.length > 0 || equipped.frame) && (
                <div className="flex items-center gap-2 mb-3 text-[11px]">
                  <span className="text-slate-500">장착:</span>
                  {equipped.titleEmoji && equipped.title && (
                    <span className="px-2 py-0.5 bg-slate-700/50 rounded-full text-slate-300">{equipped.titleEmoji} {equipped.title}</span>
                  )}
                  {equipped.badges.map((b, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-slate-700/50 rounded-full text-slate-300">{b}</span>
                  ))}
                  {equipped.frame && (
                    <span className="px-2 py-0.5 bg-slate-700/50 rounded-full text-slate-300">🖼️ {equipped.frame}</span>
                  )}
                </div>
              )}

              {/* 업적 요약 */}
              {achSummary && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] text-slate-500">업적:</span>
                  <span className="text-[12px] font-medium text-purple-400">{achSummary.unlocked} / {achSummary.total} 달성</span>
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${achSummary.total > 0 ? (achSummary.unlocked / achSummary.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {/* 생성 통계 */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">스크립트</p>
                  <p className="text-xs font-medium text-slate-300">{gameProfile.totalGenerations}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">이미지</p>
                  <p className="text-xs font-medium text-slate-300">{gameProfile.totalImages}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">음성</p>
                  <p className="text-xs font-medium text-slate-300">{gameProfile.totalAudio}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">영상</p>
                  <p className="text-xs font-medium text-slate-300">{gameProfile.totalVideos}</p>
                </div>
              </div>

              {/* 빠른 지급 */}
              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={grantXpAmount}
                    onChange={e => setGrantXpAmount(e.target.value)}
                    placeholder="XP"
                    className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200 placeholder:text-slate-600"
                  />
                  <button
                    onClick={handleGrantXp}
                    disabled={granting}
                    className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 text-[11px] rounded transition-all disabled:opacity-50"
                  >
                    XP 지급
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={grantTicketAmount}
                    onChange={e => setGrantTicketAmount(e.target.value)}
                    placeholder="뽑기권"
                    className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200 placeholder:text-slate-600"
                  />
                  <button
                    onClick={handleGrantTickets}
                    disabled={granting}
                    className="px-3 py-1.5 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 border border-pink-600/30 text-[11px] rounded transition-all disabled:opacity-50"
                  >
                    뽑기권 지급
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 크레딧 거래 내역 */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">크레딧 거래 내역</h4>
            {txLoading ? (
              <p className="text-xs text-slate-600 py-4 text-center">로딩 중...</p>
            ) : transactions.length > 0 ? (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-[11px] py-1.5 px-3 bg-slate-800/30 rounded">
                    <span className={`font-medium ${TYPE_COLORS[tx.type] || 'text-slate-400'}`}>
                      {TYPE_LABELS[tx.type] || tx.type}
                    </span>
                    <span className={tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </span>
                    <span className="text-slate-500">잔액: {tx.balance_after.toLocaleString()}</span>
                    <span className="text-slate-600 max-w-[150px] truncate" title={tx.description || ''}>
                      {tx.description || '-'}
                    </span>
                    <span className="text-slate-600">{timeAgo(tx.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">거래 내역이 없습니다.</p>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
              <p className="text-slate-500 text-xs">로딩 중...</p>
            </div>
          ) : (
            <>
              {/* 사용량 요약 */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">타입별 사용량</h4>
                {breakdown && Object.keys(breakdown).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(breakdown).map(([action, info]) => (
                      <div key={action} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/30">
                        <p className="text-[11px] text-slate-500">{ACTION_LABELS[action] || action}</p>
                        <p className="text-sm font-medium text-slate-200">{info.count}회</p>
                        <p className="text-[11px] text-cyan-400">{formatCost(info.cost)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">사용 기록이 없습니다.</p>
                )}
              </div>

              {/* 세션 정보 */}
              <div className="flex items-center justify-between bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
                <div>
                  <p className="text-[11px] text-slate-500">활성 세션</p>
                  <p className="text-sm font-medium text-slate-200">{activeSessions}개</p>
                </div>
                <button
                  onClick={handleRevokeSession}
                  className="text-[11px] px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition-all"
                >
                  세션 강제 만료
                </button>
              </div>

              {/* 최근 사용 로그 */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">최근 사용 내역</h4>
                {logs.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 bg-slate-800/30 rounded">
                        <span className="text-slate-400">{ACTION_LABELS[log.action] || log.action}</span>
                        <span className="text-cyan-400/80">{formatUsd(Number(log.cost_usd))}</span>
                        <span className="text-slate-600">{timeAgo(log.created_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">사용 기록이 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetailModal;
