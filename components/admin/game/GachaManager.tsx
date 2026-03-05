import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface GachaItem {
  id?: string;
  emoji: string;
  name: string;
  description: string;
  item_type: string;
  rarity: string;
  effect_value: {
    xp_multiplier?: number;
    duration_hours?: number;
    credits?: number;
  };
  is_active: boolean;
  sort_order: number;
}

const ITEM_TYPES = [
  { value: 'title', label: '칭호' },
  { value: 'badge', label: '뱃지' },
  { value: 'avatar_frame', label: '아바타 프레임' },
  { value: 'xp_booster', label: 'XP 부스터' },
  { value: 'credit_voucher', label: '크레딧 바우처' },
];

const RARITIES = [
  { value: 'common', label: '일반', color: '#94a3b8' },
  { value: 'uncommon', label: '비일반', color: '#22c55e' },
  { value: 'rare', label: '레어', color: '#8b5cf6' },
  { value: 'epic', label: '에픽', color: '#f59e0b' },
  { value: 'legendary', label: '전설', color: '#ef4444' },
];

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

const EMPTY_ITEM: GachaItem = {
  emoji: '🎁',
  name: '',
  description: '',
  item_type: 'title',
  rarity: 'common',
  effect_value: {},
  is_active: true,
  sort_order: 0,
};

const GachaManager: React.FC<Props> = ({ adminToken, onToast }) => {
  const [items, setItems] = useState<GachaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<GachaItem>(EMPTY_ITEM);
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-listGachaPool', adminToken });
      if (ok) setItems(data.items || []);
      else onToast('error', data.message || '뽑기 풀을 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const openAdd = () => {
    setEditItem({ ...EMPTY_ITEM, sort_order: items.length });
    setShowModal(true);
  };

  const openEdit = (item: GachaItem) => {
    setEditItem({ ...item, effect_value: item.effect_value ? { ...item.effect_value } : {} });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem.name) { onToast('error', '아이템 이름을 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertGachaItem',
        adminToken,
        item: editItem,
      });
      if (ok) {
        onToast('success', data.message || '저장되었습니다.');
        setShowModal(false);
        loadItems();
      } else {
        onToast('error', data.message || '저장에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 아이템을 삭제하시겠습니까?')) return;
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-deleteGachaItem', adminToken, id });
      if (ok) {
        onToast('success', '삭제되었습니다.');
        setItems(prev => prev.filter(i => i.id !== id));
      } else {
        onToast('error', data.message || '삭제에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const toggleActive = async (item: GachaItem) => {
    try {
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertGachaItem',
        adminToken,
        item: { ...item, is_active: !item.is_active },
      });
      if (ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
      } else {
        onToast('error', data.message || '상태 변경에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const itemTypeLabel = (type: string) => ITEM_TYPES.find(t => t.value === type)?.label || type;
  const rarityInfo = (rarity: string) => RARITIES.find(r => r.value === rarity) || RARITIES[0];
  const hasEffect = (type: string) => type === 'xp_booster' || type === 'credit_voucher';

  const rarityCounts = RARITIES.map(r => ({
    ...r,
    count: items.filter(i => i.rarity === r.value).length,
  }));

  return (
    <div className="space-y-4">
      {/* 등급별 통계 + 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {rarityCounts.map(r => (
            <span key={r.value} className="text-[10px] px-2 py-0.5 rounded-full border" style={{
              color: r.color,
              borderColor: r.color + '40',
              backgroundColor: r.color + '15',
            }}>
              {r.label}: {r.count}
            </span>
          ))}
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700/50 bg-slate-800/40 text-slate-400">
            전체: {items.length} (활성: {items.filter(i => i.is_active).length})
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={openAdd} className="px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all">
            + 아이템 추가
          </button>
          <button onClick={loadItems} disabled={loading} className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
            {loading ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">등록된 뽑기 아이템이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <p className="text-[10px] text-slate-600 sm:hidden mb-1 px-3 pt-2">&larr; 좌우로 스크롤하세요 &rarr;</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 bg-slate-900/50">
                  <th className="text-left py-2.5 px-3 font-medium">이모지</th>
                  <th className="text-left py-2.5 px-3 font-medium">이름</th>
                  <th className="text-left py-2.5 px-3 font-medium">아이템 타입</th>
                  <th className="text-left py-2.5 px-3 font-medium">등급</th>
                  <th className="text-left py-2.5 px-3 font-medium">효과</th>
                  <th className="text-center py-2.5 px-3 font-medium">활성</th>
                  <th className="text-right py-2.5 px-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const rInfo = rarityInfo(item.rarity);
                  return (
                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-base">{item.emoji}</td>
                      <td className="py-2 px-3">
                        <span className="text-slate-200 font-medium">{item.name}</span>
                        {item.description && <p className="text-[10px] text-slate-500 mt-0.5">{item.description}</p>}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded-full text-slate-400 text-[10px]">
                          {itemTypeLabel(item.item_type)}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border" style={{
                          color: rInfo.color,
                          borderColor: rInfo.color + '40',
                          backgroundColor: rInfo.color + '15',
                        }}>
                          {rInfo.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-[10px]">
                        {item.effect_value?.xp_multiplier && (
                          <span className="text-cyan-400">XP x{item.effect_value.xp_multiplier}</span>
                        )}
                        {item.effect_value?.duration_hours && (
                          <span className="text-slate-500 ml-1">({item.effect_value.duration_hours}h)</span>
                        )}
                        {item.effect_value?.credits && (
                          <span className="text-yellow-400">+{item.effect_value.credits} 크레딧</span>
                        )}
                        {!item.effect_value?.xp_multiplier && !item.effect_value?.credits && (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => toggleActive(item)}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                            item.is_active
                              ? 'bg-green-600/20 text-green-400 border-green-600/30'
                              : 'bg-red-600/20 text-red-400 border-red-600/30'
                          }`}>
                          {item.is_active ? 'ON' : 'OFF'}
                        </button>
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
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-600">
            {items.length}개 아이템 (활성: {items.filter(i => i.is_active).length}개)
          </div>
        </div>
      )}

      {/* 추가/편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200 mb-4">{editItem.id ? '아이템 편집' : '아이템 추가'}</h3>
            <div className="space-y-3">
              {/* 기본 정보 */}
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">이모지</label>
                  <input type="text" value={editItem.emoji} onChange={e => setEditItem(p => ({ ...p, emoji: e.target.value }))}
                    className="w-full px-2 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-lg text-center text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">이름</label>
                  <input type="text" value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                    placeholder="아이템 이름" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">설명 (선택)</label>
                <input type="text" value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                  placeholder="아이템 설명" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">아이템 타입</label>
                  <select value={editItem.item_type} onChange={e => setEditItem(p => ({ ...p, item_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {ITEM_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">등급</label>
                  <select value={editItem.rarity} onChange={e => setEditItem(p => ({ ...p, rarity: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {RARITIES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 등급 미리보기 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">등급 미리보기:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border" style={{
                  color: RARITY_COLORS[editItem.rarity] || RARITY_COLORS.common,
                  borderColor: (RARITY_COLORS[editItem.rarity] || RARITY_COLORS.common) + '40',
                  backgroundColor: (RARITY_COLORS[editItem.rarity] || RARITY_COLORS.common) + '15',
                }}>
                  {editItem.emoji} {rarityInfo(editItem.rarity).label}
                </span>
              </div>

              {/* 효과값 (소모품만) */}
              {hasEffect(editItem.item_type) && (
                <div className="border-t border-slate-800 pt-3">
                  <span className="text-[10px] text-slate-500 block mb-2">효과</span>
                  {editItem.item_type === 'xp_booster' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">XP 배율</label>
                        <input type="number" step="0.1" value={editItem.effect_value?.xp_multiplier ?? 1.5}
                          onChange={e => setEditItem(p => ({
                            ...p, effect_value: { ...p.effect_value, xp_multiplier: parseFloat(e.target.value) || 1 }
                          }))}
                          className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">지속 시간 (시간)</label>
                        <input type="number" value={editItem.effect_value?.duration_hours ?? 24}
                          onChange={e => setEditItem(p => ({
                            ...p, effect_value: { ...p.effect_value, duration_hours: parseInt(e.target.value) || 1 }
                          }))}
                          className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                      </div>
                    </div>
                  )}
                  {editItem.item_type === 'credit_voucher' && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500">크레딧 수량</label>
                      <input type="number" value={editItem.effect_value?.credits ?? 10}
                        onChange={e => setEditItem(p => ({
                          ...p, effect_value: { ...p.effect_value, credits: parseInt(e.target.value) || 0 }
                        }))}
                        className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                    </div>
                  )}
                </div>
              )}

              {/* 순서 + 활성화 */}
              <div className="border-t border-slate-800 pt-3">
                <div className="flex items-center gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">정렬 순서</label>
                    <input type="number" value={editItem.sort_order} onChange={e => setEditItem(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                      className="w-20 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer mt-4">
                    <input type="checkbox" checked={editItem.is_active} onChange={e => setEditItem(p => ({ ...p, is_active: e.target.checked }))}
                      className="rounded border-slate-600" />
                    활성화
                  </label>
                </div>
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

export default GachaManager;
