import React, { useState, useCallback } from 'react';
import { gameFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

type BulkActionType = 'grant_xp' | 'grant_tickets' | 'grant_item' | 'unlock_achievement';

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

const ACTION_OPTIONS: { value: BulkActionType; label: string; description: string }[] = [
  { value: 'grant_xp', label: 'XP 지급', description: '선택한 유저에게 XP를 일괄 지급합니다.' },
  { value: 'grant_tickets', label: '뽑기티켓 지급', description: '선택한 유저에게 뽑기 티켓을 일괄 지급합니다.' },
  { value: 'grant_item', label: '아이템 지급', description: '선택한 유저에게 뽑기 아이템을 일괄 지급합니다.' },
  { value: 'unlock_achievement', label: '업적 해제', description: '선택한 유저의 업적을 일괄 해제합니다.' },
];

const RARITY_LABELS: Record<string, string> = {
  common: '일반', uncommon: '비일반', rare: '레어', epic: '에픽', legendary: '전설',
};

const BulkActions: React.FC<Props> = ({ adminToken, onToast }) => {
  const [targetAll, setTargetAll] = useState(true);
  const [emailList, setEmailList] = useState('');
  const [actionType, setActionType] = useState<BulkActionType>('grant_xp');
  const [xpAmount, setXpAmount] = useState(100);
  const [ticketAmount, setTicketAmount] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedAchievementId, setSelectedAchievementId] = useState('');
  const [gachaPool, setGachaPool] = useState<GachaPoolItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementOption[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: number; failed: number; total: number } | null>(null);

  const loadGachaPool = useCallback(async () => {
    if (poolLoaded) return;
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-listGachaPool', adminToken });
      if (ok) {
        setGachaPool(data.items || []);
        setPoolLoaded(true);
      }
    } catch { /* ignore */ }
  }, [adminToken, poolLoaded]);

  const loadAchievements = useCallback(async () => {
    if (achievementsLoaded) return;
    try {
      const { ok, data } = await gameFetch({ action: 'game-admin-listAchievements', adminToken });
      if (ok) {
        setAchievements((data.achievements || []).map((a: any) => ({ id: a.id, name: a.name, icon: a.icon })));
        setAchievementsLoaded(true);
      }
    } catch { /* ignore */ }
  }, [adminToken, achievementsLoaded]);

  const handleActionChange = (type: BulkActionType) => {
    setActionType(type);
    if (type === 'grant_item') loadGachaPool();
    if (type === 'unlock_achievement') loadAchievements();
  };

  const parseEmails = (): string[] => {
    return emailList
      .split(/[,\n]/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && e.includes('@'));
  };

  const getTargetLabel = () => {
    if (targetAll) return '모든 승인 유저';
    const emails = parseEmails();
    return `${emails.length}명`;
  };

  const getActionDescription = () => {
    switch (actionType) {
      case 'grant_xp':
        return `XP ${xpAmount.toLocaleString()} 지급`;
      case 'grant_tickets':
        return `뽑기티켓 ${ticketAmount}장 지급`;
      case 'grant_item': {
        const item = gachaPool.find(i => i.id === selectedItemId);
        return item ? `${item.emoji} ${item.name} 지급` : '아이템 미선택';
      }
      case 'unlock_achievement': {
        const ach = achievements.find(a => a.id === selectedAchievementId);
        return ach ? `${ach.icon} ${ach.name} 해제` : '업적 미선택';
      }
    }
  };

  const isValid = () => {
    if (!targetAll && parseEmails().length === 0) return false;
    if (actionType === 'grant_xp' && xpAmount <= 0) return false;
    if (actionType === 'grant_tickets' && ticketAmount <= 0) return false;
    if (actionType === 'grant_item' && !selectedItemId) return false;
    if (actionType === 'unlock_achievement' && !selectedAchievementId) return false;
    return true;
  };

  const handleExecute = async () => {
    setShowConfirm(false);
    setExecuting(true);
    setLastResult(null);

    const emails = targetAll ? undefined : parseEmails();

    if (!targetAll && (!emails || emails.length === 0)) {
      onToast('error', '대상 이메일을 입력해주세요.');
      setExecuting(false);
      return;
    }

    try {
      const actionMap: Record<BulkActionType, string> = {
        grant_xp: 'grantXp', grant_tickets: 'grantTickets', grant_item: 'grantItem', unlock_achievement: 'grantAchievement',
      };
      const actionParams: Record<string, any> = {};
      if (actionType === 'grant_xp') actionParams.amount = xpAmount;
      else if (actionType === 'grant_tickets') actionParams.amount = ticketAmount;
      else if (actionType === 'grant_item') actionParams.itemId = selectedItemId;
      else if (actionType === 'unlock_achievement') actionParams.achievementId = selectedAchievementId;
      actionParams.targetAll = targetAll;

      const payload: Record<string, any> = {
        action: 'game-admin-bulkAction',
        adminToken,
        bulkAction: actionMap[actionType],
        targets: emails,
        actionParams,
      };

      const { ok, data } = await gameFetch(payload);

      if (ok) {
        setLastResult(data.result || { success: 0, failed: 0, total: 0 });
        onToast('success', data.message || '일괄 작업이 완료되었습니다.');
      } else {
        onToast('error', data.message || '일괄 작업에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setExecuting(false);
  };

  const activeAction = ACTION_OPTIONS.find(a => a.value === actionType)!;

  return (
    <div className="space-y-4">
      {/* 작업 유형 선택 */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-200 mb-3">작업 유형</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ACTION_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleActionChange(opt.value)}
              className={`px-4 py-3 rounded-lg border text-[11px] transition-all text-left ${
                actionType === opt.value
                  ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30'
                  : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:bg-slate-800/60 hover:text-slate-200'
              }`}>
              <span className="font-medium block">{opt.label}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 대상 선택 */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-200 mb-3">대상 선택</h4>

        <div className="flex gap-3 mb-3">
          <button onClick={() => setTargetAll(true)}
            className={`px-4 py-2 rounded-lg border text-[11px] transition-all ${
              targetAll
                ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30'
                : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}>
            모든 승인 유저
          </button>
          <button onClick={() => setTargetAll(false)}
            className={`px-4 py-2 rounded-lg border text-[11px] transition-all ${
              !targetAll
                ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30'
                : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}>
            특정 유저 지정
          </button>
        </div>

        {!targetAll && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">이메일 목록 (쉼표 또는 줄바꿈으로 구분)</label>
            <textarea
              value={emailList}
              onChange={e => setEmailList(e.target.value)}
              placeholder="user1@example.com, user2@example.com, user3@example.com"
              rows={5}
              className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none font-mono"
            />
            <p className="text-[10px] text-slate-600">
              {parseEmails().length}개 이메일 인식됨
            </p>
          </div>
        )}
      </section>

      {/* 파라미터 */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-200 mb-3">{activeAction.label} 설정</h4>

        {actionType === 'grant_xp' && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">XP 수량</label>
            <input type="number" value={xpAmount} onChange={e => setXpAmount(parseInt(e.target.value) || 0)}
              min={1}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            <p className="text-[10px] text-slate-600">각 유저에게 {xpAmount.toLocaleString()} XP가 지급됩니다.</p>
          </div>
        )}

        {actionType === 'grant_tickets' && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">뽑기티켓 수량</label>
            <input type="number" value={ticketAmount} onChange={e => setTicketAmount(parseInt(e.target.value) || 0)}
              min={1}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            <p className="text-[10px] text-slate-600">각 유저에게 뽑기티켓 {ticketAmount}장이 지급됩니다.</p>
          </div>
        )}

        {actionType === 'grant_item' && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">아이템 선택</label>
            <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
              <option value="">아이템을 선택하세요...</option>
              {gachaPool.map(item => (
                <option key={item.id} value={item.id}>
                  {item.emoji} {item.name} ({RARITY_LABELS[item.rarity] || item.rarity})
                </option>
              ))}
            </select>
            {gachaPool.length === 0 && poolLoaded && (
              <p className="text-[10px] text-yellow-400 mt-1">뽑기 풀에 아이템이 없습니다. 먼저 뽑기 관리에서 아이템을 추가하세요.</p>
            )}
          </div>
        )}

        {actionType === 'unlock_achievement' && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">업적 선택</label>
            <select value={selectedAchievementId} onChange={e => setSelectedAchievementId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
              <option value="">업적을 선택하세요...</option>
              {achievements.map(ach => (
                <option key={ach.id} value={ach.id}>
                  {ach.icon} {ach.name}
                </option>
              ))}
            </select>
            {achievements.length === 0 && achievementsLoaded && (
              <p className="text-[10px] text-yellow-400 mt-1">등록된 업적이 없습니다. 먼저 업적 관리에서 업적을 추가하세요.</p>
            )}
          </div>
        )}
      </section>

      {/* 실행 요약 + 버튼 */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-200 mb-3">실행 확인</h4>
        <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-4 mb-4">
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">대상</span>
              <span className="text-slate-200 font-medium">{getTargetLabel()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">작업</span>
              <span className="text-cyan-400 font-medium">{getActionDescription()}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={executing || !isValid()}
          className="w-full px-4 py-3 bg-red-600/20 border border-red-600/30 rounded-lg text-sm text-red-400 font-medium hover:bg-red-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {executing ? '실행 중...' : '일괄 작업 실행'}
        </button>
      </section>

      {/* 결과 */}
      {lastResult && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-slate-200 mb-3">실행 결과</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">전체</p>
              <p className="text-sm font-semibold text-slate-200">{lastResult.total}</p>
            </div>
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-green-500 mb-1">성공</p>
              <p className="text-sm font-semibold text-green-400">{lastResult.success}</p>
            </div>
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-red-500 mb-1">실패</p>
              <p className="text-sm font-semibold text-red-400">{lastResult.failed}</p>
            </div>
          </div>
        </section>
      )}

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">일괄 작업 확인</h3>
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 mb-4">
              <p className="text-[11px] text-red-300 mb-2">이 작업은 되돌릴 수 없습니다. 정말 실행하시겠습니까?</p>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">대상</span>
                  <span className="text-slate-200">{getTargetLabel()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">작업</span>
                  <span className="text-cyan-400">{getActionDescription()}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all">
                취소
              </button>
              <button onClick={handleExecute}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[11px] rounded-lg transition-all font-medium">
                실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkActions;
