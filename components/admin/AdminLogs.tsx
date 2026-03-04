import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ErrorLogEntry, authFetch } from './adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminLogs: React.FC<Props> = ({ adminToken, onToast }) => {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState('all');
  const [tableNotFound, setTableNotFound] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { action: 'getErrorLogs', adminToken, limit: 200 };
      if (serviceFilter !== 'all') params.service = serviceFilter;
      const { ok, data } = await authFetch(params);
      if (ok) {
        setLogs(data.logs || []);
        setTableNotFound(!!data.tableNotFound);
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, serviceFilter, onToast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const summary = useMemo(() => {
    const byService: Record<string, number> = {};
    logs.forEach(l => { byService[l.service] = (byService[l.service] || 0) + 1; });
    return byService;
  }, [logs]);

  const serviceColors: Record<string, string> = {
    gemini: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    elevenlabs: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    fal: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  };

  return (
    <div className="space-y-4">
      {tableNotFound && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-xl text-yellow-300 text-sm">
          <p className="font-medium">c2gen_error_logs 테이블이 없습니다.</p>
          <p className="text-[11px] text-yellow-400/70 mt-1">
            Supabase SQL Editor에서 다음 SQL을 실행하세요:<br />
            <code className="text-yellow-300/80">CREATE TABLE c2gen_error_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, service text, action text, error_message text, email text, created_at timestamptz DEFAULT now());</code>
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <p className="text-[11px] text-slate-500">전체 에러</p>
          <p className="text-lg font-bold text-red-400">{logs.length}</p>
        </div>
        {['gemini', 'elevenlabs', 'fal'].map(svc => (
          <div key={svc} className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">{svc}</p>
            <p className="text-lg font-bold text-slate-200">{summary[svc] || 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {[
            { id: 'all', label: '전체' },
            { id: 'gemini', label: 'Gemini' },
            { id: 'elevenlabs', label: 'ElevenLabs' },
            { id: 'fal', label: 'fal.ai' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setServiceFilter(f.id)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                serviceFilter === f.id ? 'bg-cyan-600 text-white' : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={loadLogs} disabled={loading} className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {/* Logs table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                <th className="text-left px-4 py-3 font-medium">시간</th>
                <th className="text-left px-4 py-3 font-medium">서비스</th>
                <th className="text-left px-4 py-3 font-medium">액션</th>
                <th className="text-left px-4 py-3 font-medium">에러 메시지</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-10"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-slate-600 text-xs">{tableNotFound ? '테이블이 생성되지 않았습니다.' : '에러 로그가 없습니다.'}</td></tr>
              ) : logs.map((log, i) => (
                <tr key={log.id || i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${serviceColors[log.service] || 'text-slate-400 bg-slate-500/20 border-slate-500/30'}`}>
                      {log.service}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-[12px]">{log.action}</td>
                  <td className="px-4 py-3 text-red-400/80 text-[12px] max-w-md truncate" title={log.error_message}>{log.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;
