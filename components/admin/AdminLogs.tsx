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
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [tableNotFound, setTableNotFound] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ErrorLogEntry | null>(null);
  const [stats, setStats] = useState<any>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { action: 'getErrorLogs', adminToken, limit: 200 };
      if (serviceFilter !== 'all') params.service = serviceFilter;
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (resolvedFilter !== 'all') params.resolved = resolvedFilter === 'resolved';
      const { ok, data } = await authFetch(params);
      if (ok) {
        setLogs(data.logs || []);
        setTableNotFound(!!data.tableNotFound);
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, serviceFilter, severityFilter, resolvedFilter, onToast]);

  const loadStats = useCallback(async () => {
    try {
      const { ok, data } = await authFetch({ action: 'getErrorStats', adminToken });
      if (ok) setStats(data);
    } catch {}
  }, [adminToken]);

  useEffect(() => { loadLogs(); loadStats(); }, [loadLogs, loadStats]);

  // 30초 자동 새로고침
  useEffect(() => {
    const timer = setInterval(() => { loadLogs(); loadStats(); }, 30000);
    return () => clearInterval(timer);
  }, [loadLogs, loadStats]);

  const handleResolve = async (errorId: string, resolved: boolean) => {
    const { ok } = await authFetch({ action: 'resolveError', adminToken, errorId, resolved });
    if (ok) {
      setLogs(prev => prev.map(l => l.id === errorId ? { ...l, resolved } : l));
      if (selectedLog?.id === errorId) setSelectedLog({ ...selectedLog, resolved });
      onToast('success', resolved ? '해결됨으로 표시했습니다.' : '미해결로 변경했습니다.');
    }
  };

  const summary = useMemo(() => {
    const byService: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    logs.forEach(l => {
      byService[l.service] = (byService[l.service] || 0) + 1;
      bySeverity[l.severity || 'error'] = (bySeverity[l.severity || 'error'] || 0) + 1;
    });
    return { byService, bySeverity };
  }, [logs]);

  const serviceColors: Record<string, string> = {
    gemini: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    openai: 'text-green-400 bg-green-500/20 border-green-500/30',
    elevenlabs: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    fal: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
    frontend: 'text-pink-400 bg-pink-500/20 border-pink-500/30',
  };

  const severityColors: Record<string, string> = {
    info: 'text-blue-400 bg-blue-500/20',
    warn: 'text-yellow-400 bg-yellow-500/20',
    error: 'text-red-400 bg-red-500/20',
    critical: 'text-purple-400 bg-purple-500/20',
  };

  // 시간별 바 차트 데이터 (24시간)
  const hourlyBars = useMemo(() => {
    if (!stats?.last24h?.hourly) return [];
    const hours: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600000);
      const key = d.toISOString().slice(0, 13);
      hours.push({ label: `${d.getHours()}시`, count: stats.last24h.hourly[key] || 0 });
    }
    return hours;
  }, [stats]);

  const maxHourly = Math.max(1, ...hourlyBars.map(h => h.count));

  return (
    <div className="space-y-4">
      {tableNotFound && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-xl text-yellow-300 text-sm">
          <p className="font-medium">c2gen_error_logs 테이블이 없습니다.</p>
          <p className="text-[11px] text-yellow-400/70 mt-1">
            Supabase SQL Editor에서 테이블을 생성하세요.
          </p>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <p className="text-[11px] text-slate-500">24시간 에러</p>
          <p className="text-lg font-bold text-red-400">{stats?.last24h?.total || 0}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <p className="text-[11px] text-slate-500">7일 에러</p>
          <p className="text-lg font-bold text-orange-400">{stats?.last7d?.total || 0}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <p className="text-[11px] text-slate-500">미해결</p>
          <p className="text-lg font-bold text-yellow-400">{stats?.unresolved || 0}</p>
        </div>
        {['critical', 'error'].map(sev => (
          <div key={sev} className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">{sev === 'critical' ? 'Critical' : 'Error'} (24h)</p>
            <p className={`text-lg font-bold ${sev === 'critical' ? 'text-purple-400' : 'text-red-400'}`}>
              {stats?.last24h?.bySeverity?.[sev] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* 24시간 추이 바 차트 */}
      {hourlyBars.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <p className="text-[11px] text-slate-500 mb-2">24시간 에러 추이</p>
          <div className="flex items-end gap-0.5 h-16">
            {hourlyBars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-red-500/60 rounded-t-sm min-h-[1px]"
                  style={{ height: `${(h.count / maxHourly) * 100}%` }}
                  title={`${h.label}: ${h.count}건`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[8px] text-slate-600">{hourlyBars[0]?.label}</span>
            <span className="text-[8px] text-slate-600">{hourlyBars[hourlyBars.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {[
            { id: 'all', label: '전체' },
            { id: 'gemini', label: 'Gemini' },
            { id: 'openai', label: 'OpenAI' },
            { id: 'elevenlabs', label: 'ElevenLabs' },
            { id: 'fal', label: 'fal.ai' },
            { id: 'frontend', label: 'Frontend' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setServiceFilter(f.id)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                serviceFilter === f.id ? 'bg-cyan-600 text-white' : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
              {f.id !== 'all' && summary.byService[f.id] ? ` (${summary.byService[f.id]})` : ''}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {(['all', 'critical', 'error', 'warn', 'info'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                severityFilter === s ? 'bg-cyan-600 text-white' : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? '전체' : s}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {([
            { id: 'all' as const, label: '전체' },
            { id: 'unresolved' as const, label: '미해결' },
            { id: 'resolved' as const, label: '해결됨' },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setResolvedFilter(f.id)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                resolvedFilter === f.id ? 'bg-cyan-600 text-white' : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button onClick={() => { loadLogs(); loadStats(); }} disabled={loading} className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          {loading ? '로딩...' : '새로고침'}
        </button>
        <span className="text-[9px] text-slate-600">30초마다 자동 갱신</span>
      </div>

      {/* 로그 테이블 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                <th className="text-left px-4 py-3 font-medium">시간</th>
                <th className="text-left px-4 py-3 font-medium">심각도</th>
                <th className="text-left px-4 py-3 font-medium">서비스</th>
                <th className="text-left px-4 py-3 font-medium">액션</th>
                <th className="text-left px-4 py-3 font-medium">이메일</th>
                <th className="text-left px-4 py-3 font-medium">에러 메시지</th>
                <th className="text-center px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-xs">{tableNotFound ? '테이블이 생성되지 않았습니다.' : '에러 로그가 없습니다.'}</td></tr>
              ) : logs.map((log, i) => (
                <tr
                  key={log.id || i}
                  className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer ${log.resolved ? 'opacity-50' : ''}`}
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${severityColors[log.severity || 'error'] || severityColors.error}`}>
                      {log.severity || 'error'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${serviceColors[log.service] || 'text-slate-400 bg-slate-500/20 border-slate-500/30'}`}>
                      {log.service}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-[12px]">{log.action}</td>
                  <td className="px-4 py-3 text-slate-400 text-[11px]">{log.email || '-'}</td>
                  <td className="px-4 py-3 text-red-400/80 text-[12px] max-w-xs truncate" title={log.error_message}>{log.error_message}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleResolve(log.id, !log.resolved); }}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                        log.resolved
                          ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                          : 'bg-slate-700/50 text-slate-500 border-slate-600/30 hover:bg-slate-700'
                      }`}
                    >
                      {log.resolved ? '해결됨' : '미해결'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 에러 상세 모달 */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${severityColors[selectedLog.severity || 'error']}`}>
                    {selectedLog.severity || 'error'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${serviceColors[selectedLog.service] || ''}`}>
                    {selectedLog.service}
                  </span>
                  <span className="text-[10px] text-slate-500">{selectedLog.action}</span>
                </div>
                <p className="text-red-400 text-sm font-medium">{selectedLog.error_message}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-slate-300 text-xl">&times;</button>
            </div>

            <div className="space-y-3 text-[12px]">
              <div className="flex gap-4">
                <div><span className="text-slate-500">시간:</span> <span className="text-slate-300">{new Date(selectedLog.created_at).toLocaleString('ko-KR')}</span></div>
                <div><span className="text-slate-500">이메일:</span> <span className="text-slate-300">{selectedLog.email || '-'}</span></div>
              </div>

              {selectedLog.stack_trace && (
                <div>
                  <p className="text-slate-500 mb-1">Stack Trace:</p>
                  <pre className="bg-slate-950 rounded-lg p-3 text-[10px] text-slate-400 overflow-x-auto max-h-48 whitespace-pre-wrap">{selectedLog.stack_trace}</pre>
                </div>
              )}

              {selectedLog.request_context && (
                <div>
                  <p className="text-slate-500 mb-1">Request Context:</p>
                  <pre className="bg-slate-950 rounded-lg p-3 text-[10px] text-slate-400 overflow-x-auto max-h-32">
                    {JSON.stringify(selectedLog.request_context, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleResolve(selectedLog.id, !selectedLog.resolved)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedLog.resolved
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-green-600 text-white hover:bg-green-500'
                  }`}
                >
                  {selectedLog.resolved ? '미해결로 변경' : '해결됨으로 표시'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogs;
