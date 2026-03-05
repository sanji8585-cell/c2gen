import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface Quest {
  id?: string;
  icon: string;
  name: string;
  description: string;
  quest_type: string;
  target: number;
  reward_xp: number;
  reward_credits: number;
  reward_gacha_tickets: number;
  min_level: number;
  max_level: number;
  weight: number;
  active: boolean;
}

const QUEST_TYPES = [
  { value: 'generate_script', label: '스크립트 생성' },
  { value: 'generate_images', label: '이미지 생성' },
  { value: 'generate_audio', label: '오디오 생성' },
  { value: 'generate_video', label: '영상 생성' },
  { value: 'login', label: '로그인' },
  { value: 'gacha_pull', label: '뽑기 수행' },
  { value: 'combo_reach', label: '콤보 달성' },
  { value: 'share_project', label: '프로젝트 공유' },
];

const EMPTY_QUEST: Quest = {
  icon: '\uD83D\uDCCC',
  name: '',
  description: '',
  quest_type: 'generate_script',
  target: 1,
  reward_xp: 50,
  reward_credits: 5,
  reward_gacha_tickets: 0,
  min_level: 1,
  max_level: 99,
  weight: 10,
  active: true,
};

const QuestManager: React.FC<Props> = ({ adminToken, onToast }) => {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Quest>(EMPTY_QUEST);
  const [submitting, setSubmitting] = useState(false);

  const loadQuests = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-listQuests', adminToken });
      if (ok) setQuests(data.quests || []);
      else onToast('error', data.message || '퀘스트 목록을 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const openAdd = () => {
    setEditItem({ ...EMPTY_QUEST });
    setShowModal(true);
  };

  const openEdit = (item: Quest) => {
    setEditItem({ ...item });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem.name) { onToast('error', '퀘스트 이름을 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertQuest',
        adminToken,
        quest: editItem,
      });
      if (ok) {
        onToast('success', data.message || '저장되었습니다.');
        setShowModal(false);
        loadQuests();
      } else {
        onToast('error', data.message || '저장에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 퀘스트를 삭제하시겠습니까?')) return;
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-deleteQuest', adminToken, id });
      if (ok) {
        onToast('success', '삭제되었습니다.');
        setQuests(prev => prev.filter(q => q.id !== id));
      } else {
        onToast('error', data.message || '삭제에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const questTypeLabel = (type: string) => QUEST_TYPES.find(q => q.value === type)?.label || type;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] text-slate-600">{quests.length}개 퀘스트 (활성: {quests.filter(q => q.active).length})</span>
        <div className="flex gap-2">
          <button onClick={openAdd} className="px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all">
            + 퀘스트 추가
          </button>
          <button onClick={loadQuests} disabled={loading} className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
            {loading ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : quests.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">등록된 퀘스트가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <p className="text-[10px] text-slate-600 sm:hidden mb-1 px-3 pt-2">&larr; 좌우로 스크롤하세요 &rarr;</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 bg-slate-900/50">
                  <th className="text-left py-2.5 px-3 font-medium">아이콘</th>
                  <th className="text-left py-2.5 px-3 font-medium">이름</th>
                  <th className="text-left py-2.5 px-3 font-medium">퀘스트 타입</th>
                  <th className="text-center py-2.5 px-3 font-medium">목표</th>
                  <th className="text-left py-2.5 px-3 font-medium">보상</th>
                  <th className="text-center py-2.5 px-3 font-medium">레벨 범위</th>
                  <th className="text-center py-2.5 px-3 font-medium">가중치</th>
                  <th className="text-center py-2.5 px-3 font-medium">활성</th>
                  <th className="text-right py-2.5 px-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {quests.map(item => (
                  <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-base">{item.icon}</td>
                    <td className="py-2 px-3">
                      <span className="text-slate-200 font-medium">{item.name}</span>
                      {item.description && <p className="text-[10px] text-slate-500 mt-0.5">{item.description}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded-full text-slate-400 text-[10px]">
                        {questTypeLabel(item.quest_type)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-cyan-400 font-mono">{item.target}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {item.reward_xp > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">XP +{item.reward_xp}</span>}
                        {item.reward_credits > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded">크레딧 +{item.reward_credits}</span>}
                        {item.reward_gacha_tickets > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">뽑기권 +{item.reward_gacha_tickets}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">
                      <span className="font-mono">{item.min_level}-{item.max_level}</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400 font-mono">{item.weight}</td>
                    <td className="py-2 px-3 text-center">
                      {item.active ? <span className="text-green-400">O</span> : <span className="text-red-400">X</span>}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="px-2 py-1 bg-cyan-600/20 text-cyan-400 border border-cyan-600/30 rounded text-[10px] hover:bg-cyan-600/30 transition-all">
                          편집
                        </button>
                        <button onClick={() => item.id && handleDelete(item.id)} className="px-2 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-[10px] hover:bg-red-600/30 transition-all">
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 추가/편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200 mb-4">{editItem.id ? '퀘스트 편집' : '퀘스트 추가'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">아이콘</label>
                  <input type="text" value={editItem.icon} onChange={e => setEditItem(p => ({ ...p, icon: e.target.value }))}
                    className="w-full px-2 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-lg text-center text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">이름</label>
                  <input type="text" value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                    placeholder="퀘스트 이름" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">설명</label>
                <input type="text" value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                  placeholder="퀘스트 설명" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">퀘스트 타입</label>
                  <select value={editItem.quest_type} onChange={e => setEditItem(p => ({ ...p, quest_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {QUEST_TYPES.map(q => (
                      <option key={q.value} value={q.value}>{q.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">목표 횟수</label>
                  <input type="number" value={editItem.target} onChange={e => setEditItem(p => ({ ...p, target: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              {/* 보상 */}
              <div className="border-t border-slate-800 pt-3">
                <span className="text-[10px] text-slate-500 block mb-2">보상</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">XP</label>
                    <input type="number" value={editItem.reward_xp} onChange={e => setEditItem(p => ({ ...p, reward_xp: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">크레딧</label>
                    <input type="number" value={editItem.reward_credits} onChange={e => setEditItem(p => ({ ...p, reward_credits: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">뽑기권</label>
                    <input type="number" value={editItem.reward_gacha_tickets} onChange={e => setEditItem(p => ({ ...p, reward_gacha_tickets: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
              </div>

              {/* 레벨 범위 + 가중치 */}
              <div className="border-t border-slate-800 pt-3">
                <span className="text-[10px] text-slate-500 block mb-2">출현 조건</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">최소 레벨</label>
                    <input type="number" value={editItem.min_level} onChange={e => setEditItem(p => ({ ...p, min_level: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">최대 레벨</label>
                    <input type="number" value={editItem.max_level} onChange={e => setEditItem(p => ({ ...p, max_level: parseInt(e.target.value) || 99 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">가중치</label>
                    <input type="number" value={editItem.weight} onChange={e => setEditItem(p => ({ ...p, weight: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
              </div>

              {/* 활성화 */}
              <div className="border-t border-slate-800 pt-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={editItem.active} onChange={e => setEditItem(p => ({ ...p, active: e.target.checked }))}
                    className="rounded border-slate-600" />
                  활성화
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all">
                취소
              </button>
              <button onClick={handleSave} disabled={submitting} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] rounded-lg transition-all disabled:opacity-50">
                {submitting ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestManager;
