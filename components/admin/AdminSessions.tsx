import React, { useState, useEffect, useCallback } from 'react';
import { SessionInfo, authFetch } from './adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminSessions: React.FC<Props> = ({ adminToken, onToast }) => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'allSessions', adminToken });
      if (ok) setSessions(data.sessions || []);
      else onToast('error', data.message || '세션을 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleBulkRevoke = useCallback(async () => {
    try {
      const { ok, data } = await authFetch({ action: 'bulkRevokeSessions', adminToken });
      if (ok) {
        onToast('success', data.message);
        loadSessions();
      } else {
        onToast('error', data.message || '처리에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  }, [adminToken, loadSessions, onToast]);

  const handleRevokeOne = useCallback(async (sessionToken: string, userName: string) => {
    if (!confirm(`${userName}의 세션을 만료시키겠습니까?`)) return;
    try {
      const { ok, data } = await authFetch({ action: 'revokeSessionByToken', adminToken, sessionToken });
      if (ok) {
        onToast('success', data.message);
        setSessions(prev => prev.filter(s => s.token !== sessionToken));
      } else {
        onToast('error', data.message || '처리에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  }, [adminToken, onToast]);

  const getRemainingTime = (expiresAt: string): string => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return '만료됨';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
    if (hours > 0) return `${hours}시간 ${mins}분`;
    return `${mins}분`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={loadSessions} disabled={loading} className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          {loading ? '로딩...' : '새로고침'}
        </button>
        <button onClick={handleBulkRevoke} className="px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-[11px] text-red-400 hover:bg-red-600/30 transition-all">
          만료된 세션 정리
        </button>
        <span className="text-[11px] text-slate-600">활성 세션: {sessions.length}개</span>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                <th className="text-left px-4 py-3 font-medium">사용자</th>
                <th className="text-left px-4 py-3 font-medium">이메일</th>
                <th className="text-left px-4 py-3 font-medium">만료까지</th>
                <th className="text-left px-4 py-3 font-medium">만료일시</th>
                <th className="text-right px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto" /></td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-600 text-xs">활성 세션이 없습니다.</td></tr>
              ) : sessions.map(s => (
                <tr key={s.token} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-200">{s.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-[12px]">{s.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      {getRemainingTime(s.expires_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">{new Date(s.expires_at).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevokeOne(s.token, s.name)}
                      className="text-[11px] px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-md transition-all"
                    >
                      강제 만료
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminSessions;
