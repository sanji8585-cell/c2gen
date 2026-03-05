import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface Achievement {
  id?: string;
  icon: string;
  name: string;
  description: string;
  category: string;
  condition_type: string;
  condition_target: number;
  reward_xp: number;
  reward_credits: number;
  reward_gacha_tickets: number;
  reward_title: string;
  hidden: boolean;
  active: boolean;
}

const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'creation', label: '창작' },
  { id: 'exploration', label: '탐험' },
  { id: 'dedication', label: '헌신' },
  { id: 'mastery', label: '마스터리' },
  { id: 'hidden', label: '히든' },
];

const CONDITION_TYPES = [
  { value: 'total_generations', label: '총 생성 횟수' },
  { value: 'total_images', label: '총 이미지 수' },
  { value: 'total_audio', label: '총 오디오 수' },
  { value: 'total_videos', label: '총 영상 수' },
  { value: 'streak_days', label: '연속 접속 일수' },
  { value: 'login_days', label: '총 접속 일수' },
  { value: 'level_reached', label: '도달 레벨' },
  { value: 'gacha_pulls', label: '총 뽑기 횟수' },
  { value: 'max_combo', label: '최대 콤보' },
  { value: 'prestige', label: '프레스티지 횟수' },
];

const EMPTY_ACHIEVEMENT: Achievement = {
  icon: '\uD83C\uDFC5',
  name: '',
  description: '',
  category: 'creation',
  condition_type: 'total_generations',
  condition_target: 10,
  reward_xp: 100,
  reward_credits: 0,
  reward_gacha_tickets: 0,
  reward_title: '',
  hidden: false,
  active: true,
};

const AchievementManager: React.FC<Props> = ({ adminToken, onToast }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Achievement>(EMPTY_ACHIEVEMENT);
  const [submitting, setSubmitting] = useState(false);

  const loadAchievements = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-listAchievements', adminToken });
      if (ok) setAchievements(data.achievements || []);
      else onToast('error', data.message || '업적 목록을 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadAchievements(); }, [loadAchievements]);

  const filtered = activeCategory === 'all'
    ? achievements
    : activeCategory === 'hidden'
      ? achievements.filter(a => a.hidden)
      : achievements.filter(a => a.category === activeCategory);

  const openAdd = () => {
    setEditItem({ ...EMPTY_ACHIEVEMENT });
    setShowModal(true);
  };

  const openEdit = (item: Achievement) => {
    setEditItem({ ...item });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem.name) { onToast('error', '업적 이름을 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertAchievement',
        adminToken,
        achievement: editItem,
      });
      if (ok) {
        onToast('success', data.message || '저장되었습니다.');
        setShowModal(false);
        loadAchievements();
      } else {
        onToast('error', data.message || '저장에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 업적을 삭제하시겠습니까?')) return;
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-deleteAchievement', adminToken, id });
      if (ok) {
        onToast('success', '삭제되었습니다.');
        setAchievements(prev => prev.filter(a => a.id !== id));
      } else {
        onToast('error', data.message || '삭제에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const categoryLabel = (cat: string) => CATEGORIES.find(c => c.id === cat)?.label || cat;

  return (
    <div className="space-y-4">
      {/* 카테고리 필터 + 액션 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition-all border ${
                activeCategory === cat.id
                  ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/50'
              }`}>
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={openAdd} className="px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all">
            + 업적 추가
          </button>
          <button onClick={loadAchievements} disabled={loading} className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
            {loading ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">해당 카테고리에 업적이 없습니다.</p>
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
                  <th className="text-left py-2.5 px-3 font-medium">카테고리</th>
                  <th className="text-left py-2.5 px-3 font-medium">조건</th>
                  <th className="text-left py-2.5 px-3 font-medium">보상</th>
                  <th className="text-center py-2.5 px-3 font-medium">히든</th>
                  <th className="text-center py-2.5 px-3 font-medium">활성</th>
                  <th className="text-right py-2.5 px-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-base">{item.icon}</td>
                    <td className="py-2 px-3">
                      <span className="text-slate-200 font-medium">{item.name}</span>
                      {item.description && <p className="text-[10px] text-slate-500 mt-0.5">{item.description}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded-full text-slate-400 text-[10px]">
                        {categoryLabel(item.category)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {CONDITION_TYPES.find(c => c.value === item.condition_type)?.label || item.condition_type}
                      <span className="text-cyan-400 ml-1">≥ {item.condition_target}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      <div className="flex flex-wrap gap-1">
                        {item.reward_xp > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">XP +{item.reward_xp}</span>}
                        {item.reward_credits > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded">크레딧 +{item.reward_credits}</span>}
                        {item.reward_gacha_tickets > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">뽑기권 +{item.reward_gacha_tickets}</span>}
                        {item.reward_title && <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded">{item.reward_title}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {item.hidden ? <span className="text-yellow-400">O</span> : <span className="text-slate-600">-</span>}
                    </td>
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
          <div className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-600">
            {filtered.length}개 업적
          </div>
        </div>
      )}

      {/* 추가/편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl mx-3 sm:mx-0" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200 mb-4">{editItem.id ? '업적 편집' : '업적 추가'}</h3>
            <div className="space-y-3">
              {/* 기본 정보 */}
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">아이콘</label>
                  <input type="text" value={editItem.icon} onChange={e => setEditItem(p => ({ ...p, icon: e.target.value }))}
                    className="w-full px-2 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-lg text-center text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">이름</label>
                  <input type="text" value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                    placeholder="업적 이름" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">설명</label>
                <input type="text" value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                  placeholder="업적 설명" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">카테고리</label>
                  <select value={editItem.category} onChange={e => setEditItem(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {CATEGORIES.filter(c => c.id !== 'all' && c.id !== 'hidden').map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">조건 타입</label>
                  <select value={editItem.condition_type} onChange={e => setEditItem(p => ({ ...p, condition_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {CONDITION_TYPES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">조건 목표값</label>
                <input type="number" value={editItem.condition_target} onChange={e => setEditItem(p => ({ ...p, condition_target: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
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
                <div className="mt-2 space-y-1">
                  <label className="text-[10px] text-slate-500">보상 칭호 (선택)</label>
                  <input type="text" value={editItem.reward_title} onChange={e => setEditItem(p => ({ ...p, reward_title: e.target.value }))}
                    placeholder="칭호 (없으면 비워두세요)" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              {/* 토글 */}
              <div className="flex gap-4 border-t border-slate-800 pt-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={editItem.hidden} onChange={e => setEditItem(p => ({ ...p, hidden: e.target.checked }))}
                    className="rounded border-slate-600" />
                  히든 업적
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={editItem.active} onChange={e => setEditItem(p => ({ ...p, active: e.target.checked }))}
                    className="rounded border-slate-600" />
                  활성화
                </label>
              </div>
            </div>

            {/* 버튼 */}
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

export default AchievementManager;
