import React, { useState, useEffect, useCallback } from 'react';
import { Announcement, authFetch } from './adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminAnnouncements: React.FC<Props> = ({ adminToken, onToast }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableNotFound, setTableNotFound] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'urgent'>('info');
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'listAnnouncements', adminToken });
      if (ok) {
        setAnnouncements(data.announcements || []);
        setTableNotFound(!!data.tableNotFound);
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) { onToast('error', '제목과 내용을 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'createAnnouncement', adminToken, title, content, type });
      if (ok) {
        onToast('success', data.message);
        setTitle(''); setContent(''); setType('info'); setShowForm(false);
        loadAnnouncements();
      } else {
        onToast('error', data.message || data.error || '등록에 실패했습니다.');
        if (data.sql) console.log('테이블 생성 SQL:', data.sql);
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  }, [adminToken, title, content, type, loadAnnouncements, onToast]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;
    try {
      const { ok } = await authFetch({ action: 'deleteAnnouncement', adminToken, id });
      if (ok) {
        onToast('success', '공지사항이 삭제되었습니다.');
        setAnnouncements(prev => prev.filter(a => a.id !== id));
      }
    } catch {
      onToast('error', '삭제에 실패했습니다.');
    }
  }, [adminToken, onToast]);

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    try {
      const { ok } = await authFetch({ action: 'toggleAnnouncement', adminToken, id, active: !active });
      if (ok) {
        setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, active: !active } : a));
      }
    } catch {}
  }, [adminToken]);

  const typeStyles: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const typeLabels: Record<string, string> = { info: '안내', warning: '주의', urgent: '긴급' };

  return (
    <div className="space-y-4">
      {tableNotFound && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-xl text-yellow-300 text-sm">
          <p className="font-medium">c2gen_announcements 테이블이 없습니다.</p>
          <p className="text-[11px] text-yellow-400/70 mt-1">새 공지 등록 시 필요한 SQL이 콘솔에 출력됩니다. Supabase SQL Editor에서 실행해주세요.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => setShowForm(v => !v)} className="px-3 py-2 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all">
          {showForm ? '폼 닫기' : '새 공지 작성'}
        </button>
        <button onClick={loadAnnouncements} disabled={loading} className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          {loading ? '로딩...' : '새로고침'}
        </button>
        <span className="text-[11px] text-slate-600">{announcements.length}개 공지</span>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex gap-3">
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="제목"
              className="flex-1 px-4 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <select
              value={type} onChange={e => setType(e.target.value as any)}
              className="px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="info">안내</option>
              <option value="warning">주의</option>
              <option value="urgent">긴급</option>
            </select>
          </div>
          <textarea
            value={content} onChange={e => setContent(e.target.value)}
            placeholder="공지 내용을 입력하세요..."
            rows={3}
            className="w-full px-4 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
          />
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-all disabled:opacity-50">
            {submitting ? '등록 중...' : '공지 등록'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">등록된 공지사항이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(ann => (
            <div key={ann.id} className={`bg-slate-900/80 border rounded-xl p-4 transition-all ${ann.active ? 'border-slate-800' : 'border-slate-800/30 opacity-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${typeStyles[ann.type] || typeStyles.info}`}>
                      {typeLabels[ann.type] || ann.type}
                    </span>
                    {!ann.active && <span className="text-[10px] text-slate-600">(비활성)</span>}
                    <span className="text-[10px] text-slate-600">{new Date(ann.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200">{ann.title}</p>
                  <p className="text-[12px] text-slate-400 mt-1 whitespace-pre-wrap">{ann.content}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(ann.id, ann.active)}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-all ${
                      ann.active
                        ? 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border-yellow-600/30'
                        : 'bg-green-600/20 hover:bg-green-600/40 text-green-400 border-green-600/30'
                    }`}
                  >
                    {ann.active ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="text-[11px] px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-md transition-all"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAnnouncements;
