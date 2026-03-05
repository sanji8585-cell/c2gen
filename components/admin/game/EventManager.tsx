import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface GameEvent {
  id?: string;
  icon: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
  xp_multiplier: number;
  drop_rate_multiplier: number;
  special_gacha_items: string[];
  is_active: boolean;
}

const EMPTY_EVENT: GameEvent = {
  icon: '🎉',
  name: '',
  description: '',
  start_at: new Date().toISOString().slice(0, 16),
  end_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  xp_multiplier: 1.5,
  drop_rate_multiplier: 1.0,
  special_gacha_items: [],
  is_active: true,
};

const EventManager: React.FC<Props> = ({ adminToken, onToast }) => {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<GameEvent>(EMPTY_EVENT);
  const [submitting, setSubmitting] = useState(false);
  const [specialItemsText, setSpecialItemsText] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-listEvents', adminToken });
      if (ok) setEvents(data.events || []);
      else onToast('error', data.message || '이벤트 목록을 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const openAdd = () => {
    setEditItem({
      ...EMPTY_EVENT,
      start_at: new Date().toISOString().slice(0, 16),
      end_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    });
    setSpecialItemsText('');
    setShowModal(true);
  };

  const openEdit = (item: GameEvent) => {
    setEditItem({ ...item });
    setSpecialItemsText((item.special_gacha_items || []).join(', '));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem.name) { onToast('error', '이벤트 이름을 입력해주세요.'); return; }
    if (!editItem.start_at || !editItem.end_at) { onToast('error', '시작/종료 날짜를 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const itemToSave = {
        ...editItem,
        special_gacha_items: specialItemsText
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      };
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertEvent',
        adminToken,
        event: itemToSave,
      });
      if (ok) {
        onToast('success', data.message || '저장되었습니다.');
        setShowModal(false);
        loadEvents();
      } else {
        onToast('error', data.message || '저장에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 이벤트를 삭제하시겠습니까?')) return;
    try {
      const { ok, data } = await authFetch({ action: 'game-admin-deleteEvent', adminToken, id });
      if (ok) {
        onToast('success', '삭제되었습니다.');
        setEvents(prev => prev.filter(e => e.id !== id));
      } else {
        onToast('error', data.message || '삭제에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const toggleActive = async (item: GameEvent) => {
    try {
      const { ok, data } = await authFetch({
        action: 'game-admin-upsertEvent',
        adminToken,
        event: { ...item, is_active: !item.is_active },
      });
      if (ok) {
        setEvents(prev => prev.map(e => e.id === item.id ? { ...e, is_active: !e.is_active } : e));
      } else {
        onToast('error', data.message || '상태 변경에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  };

  const getEventStatus = (event: GameEvent): { label: string; style: string } => {
    if (!event.is_active) return { label: '비활성', style: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
    const now = Date.now();
    const start = new Date(event.start_at).getTime();
    const end = new Date(event.end_at).getTime();
    if (now < start) return { label: '예정', style: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    if (now > end) return { label: '종료', style: 'bg-red-500/20 text-red-400 border-red-500/30' };
    return { label: '진행 중', style: 'bg-green-500/20 text-green-400 border-green-500/30' };
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  };

  // 상태별 카운트
  const statusCounts = {
    active: events.filter(e => {
      const now = Date.now();
      return e.is_active && new Date(e.start_at).getTime() <= now && new Date(e.end_at).getTime() >= now;
    }).length,
    upcoming: events.filter(e => e.is_active && new Date(e.start_at).getTime() > Date.now()).length,
    ended: events.filter(e => e.is_active && new Date(e.end_at).getTime() < Date.now()).length,
    inactive: events.filter(e => !e.is_active).length,
  };

  return (
    <div className="space-y-4">
      {/* 상태 요약 + 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30">
            진행 중: {statusCounts.active}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
            예정: {statusCounts.upcoming}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">
            종료: {statusCounts.ended}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700/50 bg-slate-800/40 text-slate-400">
            전체: {events.length}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={openAdd} className="px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all">
            + 이벤트 추가
          </button>
          <button onClick={loadEvents} disabled={loading} className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
            {loading ? '로딩...' : '새로고침'}
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">등록된 이벤트가 없습니다.</p>
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
                  <th className="text-left py-2.5 px-3 font-medium">시작</th>
                  <th className="text-left py-2.5 px-3 font-medium">종료</th>
                  <th className="text-center py-2.5 px-3 font-medium">XP 배율</th>
                  <th className="text-center py-2.5 px-3 font-medium">드롭 배율</th>
                  <th className="text-center py-2.5 px-3 font-medium">상태</th>
                  <th className="text-center py-2.5 px-3 font-medium">활성</th>
                  <th className="text-right py-2.5 px-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {events.map(item => {
                  const status = getEventStatus(item);
                  return (
                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-base">{item.icon}</td>
                      <td className="py-2 px-3">
                        <span className="text-slate-200 font-medium">{item.name}</span>
                        {item.description && <p className="text-[10px] text-slate-500 mt-0.5">{item.description}</p>}
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-[10px]">{formatDate(item.start_at)}</td>
                      <td className="py-2 px-3 text-slate-400 text-[10px]">{formatDate(item.end_at)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`font-mono ${item.xp_multiplier > 1 ? 'text-cyan-400' : 'text-slate-400'}`}>
                          x{item.xp_multiplier}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`font-mono ${item.drop_rate_multiplier > 1 ? 'text-purple-400' : 'text-slate-400'}`}>
                          x{item.drop_rate_multiplier}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${status.style}`}>
                          {status.label}
                        </span>
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
            {events.length}개 이벤트
          </div>
        </div>
      )}

      {/* 추가/편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200 mb-4">{editItem.id ? '이벤트 편집' : '이벤트 추가'}</h3>
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
                    placeholder="이벤트 이름" className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">설명</label>
                <textarea value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                  placeholder="이벤트 설명" rows={2}
                  className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none" />
              </div>

              {/* 날짜 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">시작 날짜</label>
                  <input type="datetime-local" value={editItem.start_at} onChange={e => setEditItem(p => ({ ...p, start_at: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">종료 날짜</label>
                  <input type="datetime-local" value={editItem.end_at} onChange={e => setEditItem(p => ({ ...p, end_at: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              {/* 배율 */}
              <div className="border-t border-slate-800 pt-3">
                <span className="text-[10px] text-slate-500 block mb-2">이벤트 효과</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">XP 배율</label>
                    <input type="number" step="0.1" value={editItem.xp_multiplier} onChange={e => setEditItem(p => ({ ...p, xp_multiplier: parseFloat(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500">드롭률 배율</label>
                    <input type="number" step="0.1" value={editItem.drop_rate_multiplier} onChange={e => setEditItem(p => ({ ...p, drop_rate_multiplier: parseFloat(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
              </div>

              {/* 특별 뽑기 아이템 */}
              <div className="border-t border-slate-800 pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500">특별 뽑기 아이템 ID (쉼표 구분, 선택)</label>
                  <input type="text" value={specialItemsText} onChange={e => setSpecialItemsText(e.target.value)}
                    placeholder="item_id_1, item_id_2"
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>

              {/* 활성화 */}
              <div className="border-t border-slate-800 pt-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={editItem.is_active} onChange={e => setEditItem(p => ({ ...p, is_active: e.target.checked }))}
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

export default EventManager;
