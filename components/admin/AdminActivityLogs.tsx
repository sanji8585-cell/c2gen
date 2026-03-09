import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, ACTION_LABELS, formatUsd, timeAgo } from './adminUtils';

interface Props {
  adminToken: string;
}

interface ActivityLog {
  email: string;
  action: string;
  cost_usd: number;
  count: number;
  created_at: string;
}

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  image: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tts: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  video: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  script: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const AdminActivityLogs: React.FC<Props> = ({ adminToken }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // 필터
  const [emailFilter, setEmailFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // 자동 새로고침
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchLogs = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({
        action: 'admin-activityLogs',
        adminToken,
        email: emailFilter || undefined,
        filterAction: actionFilter || undefined,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      });
      if (ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [adminToken, emailFilter, actionFilter]);

  useEffect(() => {
    fetchLogs(page);
  }, [fetchLogs, page]);

  // 자동 새로고침 (30초)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (page === 0) fetchLogs(0);
    }, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchLogs, page]);

  const handleSearch = () => { setPage(0); fetchLogs(0); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={emailFilter}
          onChange={e => setEmailFilter(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="이메일로 검색..."
          className="flex-1 min-w-[200px] px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />

        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {[
            { id: '', label: '전체' },
            { id: 'image', label: '이미지' },
            { id: 'tts', label: 'TTS' },
            { id: 'video', label: '영상' },
            { id: 'script', label: '스크립트' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => { setActionFilter(f.id); setPage(0); }}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                actionFilter === f.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
        >
          {loading ? '로딩...' : '검색'}
        </button>

        <span className="text-[11px] text-slate-600">
          {total.toLocaleString()}건
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                <th className="text-left px-4 py-3 font-medium">시간</th>
                <th className="text-left px-4 py-3 font-medium">이메일</th>
                <th className="text-left px-4 py-3 font-medium">액션</th>
                <th className="text-right px-4 py-3 font-medium">비용 (USD)</th>
                <th className="text-right px-4 py-3 font-medium">횟수</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-600 text-xs">
                    {loading ? '로딩 중...' : '활동 기록이 없습니다.'}
                  </td>
                </tr>
              ) : logs.map((log, idx) => (
                <tr key={`${log.created_at}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="text-slate-500 text-[12px]">{timeAgo(log.created_at)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-slate-300 text-[12px]">{log.email}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ACTION_COLORS[log.action] || 'bg-slate-600/20 text-slate-400 border-slate-600/30'}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-cyan-400/80 text-[12px]">{formatUsd(Number(log.cost_usd))}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-slate-400 text-[12px]">{log.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-[11px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md transition-all disabled:opacity-30"
            >
              이전
            </button>
            <span className="text-[11px] text-slate-500">
              {page + 1} / {totalPages} 페이지
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-[11px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md transition-all disabled:opacity-30"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminActivityLogs;
