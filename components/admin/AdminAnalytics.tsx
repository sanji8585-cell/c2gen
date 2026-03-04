import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeSeriesEntry, UserRanking, authFetch, formatCost, ACTION_LABELS } from './adminUtils';
import { exportUsageToCSV } from './exportUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

type Period = '7d' | '30d' | '90d';

function getDateRange(period: Period): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (period === '7d') start.setDate(start.getDate() - 7);
  else if (period === '30d') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 90);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

const AdminAnalytics: React.FC<Props> = ({ adminToken, onToast }) => {
  const [period, setPeriod] = useState<Period>('30d');
  const [timeSeries, setTimeSeries] = useState<TimeSeriesEntry[]>([]);
  const [userRanking, setUserRanking] = useState<UserRanking[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);
      const { ok, data } = await authFetch({ action: 'usageTimeSeries', adminToken, startDate, endDate });
      if (ok) {
        setTimeSeries(data.timeSeries || []);
        setUserRanking(data.userRanking || []);
      } else {
        onToast('error', data.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, period, onToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const summary = useMemo(() => {
    const totalCost = timeSeries.reduce((s, d) => s + d.totalCost, 0);
    const totalCount = timeSeries.reduce((s, d) => s + d.totalCount, 0);
    const actionMap: Record<string, { cost: number; count: number }> = {};
    timeSeries.forEach(d => {
      Object.entries(d.actions).forEach(([action, v]) => {
        if (!actionMap[action]) actionMap[action] = { cost: 0, count: 0 };
        actionMap[action].cost += v.cost;
        actionMap[action].count += v.count;
      });
    });
    return { totalCost, totalCount, actionMap };
  }, [timeSeries]);

  const maxDailyCost = useMemo(() => Math.max(...timeSeries.map(d => d.totalCost), 0.001), [timeSeries]);

  const handleExport = () => {
    exportUsageToCSV(timeSeries, userRanking, period);
    onToast('success', 'CSV 파일이 다운로드되었습니다.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-[11px] font-medium transition-all ${
                period === p ? 'bg-cyan-600 text-white' : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
            </button>
          ))}
        </div>
        <button onClick={loadData} disabled={loading} className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          {loading ? '로딩...' : '새로고침'}
        </button>
        <button onClick={handleExport} disabled={timeSeries.length === 0} className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all disabled:opacity-50">
          CSV 내보내기
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <p className="text-[11px] text-slate-500">총 비용</p>
          <p className="text-lg font-bold text-cyan-400 mt-1">{formatCost(summary.totalCost)}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <p className="text-[11px] text-slate-500">총 호출 수</p>
          <p className="text-lg font-bold text-slate-200 mt-1">{summary.totalCount.toLocaleString()}회</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <p className="text-[11px] text-slate-500">일평균 비용</p>
          <p className="text-lg font-bold text-amber-400 mt-1">{formatCost(timeSeries.length ? summary.totalCost / timeSeries.length : 0)}</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <p className="text-[11px] text-slate-500">활성 사용자</p>
          <p className="text-lg font-bold text-green-400 mt-1">{userRanking.length}명</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : (
        <>
          {/* Daily cost bar chart */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-slate-200 mb-4">일별 비용 추이</h3>
            {timeSeries.length === 0 ? (
              <p className="text-center text-slate-600 text-xs py-8">데이터가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(timeSeries.length * 24, 400) }}>
                  <svg width="100%" height="200" viewBox={`0 0 ${Math.max(timeSeries.length * 24, 400)} 200`} preserveAspectRatio="xMinYMin meet">
                    {timeSeries.map((d, i) => {
                      const gap = 4;
                      const totalWidth = Math.max(timeSeries.length * 24, 400);
                      const barWidth = Math.max(8, (totalWidth / timeSeries.length) - gap);
                      const barHeight = Math.max(2, (d.totalCost / maxDailyCost) * 160);
                      const x = i * (barWidth + gap) + gap / 2;
                      return (
                        <g key={d.date}>
                          <rect x={x} y={170 - barHeight} width={barWidth} height={barHeight} rx="2" fill="rgb(34, 211, 238)" fillOpacity="0.6">
                            <title>{`${d.date}: $${d.totalCost.toFixed(4)} (${d.totalCount}건)`}</title>
                          </rect>
                        </g>
                      );
                    })}
                    <line x1="0" y1="172" x2="100%" y2="172" stroke="rgb(51, 65, 85)" strokeWidth="1" />
                  </svg>
                  <div className="flex justify-between text-[9px] text-slate-600 mt-1 px-1">
                    <span>{timeSeries[0]?.date}</span>
                    {timeSeries.length > 2 && <span>{timeSeries[Math.floor(timeSeries.length / 2)]?.date}</span>}
                    <span>{timeSeries[timeSeries.length - 1]?.date}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action breakdown + User ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-200 mb-4">액션별 비용</h3>
              <div className="space-y-3">
                {Object.entries(summary.actionMap)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([action, data]) => {
                    const pct = summary.totalCost > 0 ? (data.cost / summary.totalCost) * 100 : 0;
                    const colors: Record<string, string> = { image: 'bg-cyan-500', tts: 'bg-amber-500', video: 'bg-purple-500', script: 'bg-green-500' };
                    return (
                      <div key={action}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-300">{ACTION_LABELS[action] || action}</span>
                          <span className="text-slate-400">{formatCost(data.cost)} ({data.count}건)</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[action] || 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(summary.actionMap).length === 0 && (
                  <p className="text-center text-slate-600 text-xs py-4">데이터가 없습니다.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-200 mb-4">사용자별 비용 TOP 20</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {userRanking.map((u, i) => (
                  <div key={u.email} className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-600 w-5 text-right">{i + 1}</span>
                    <span className="text-slate-300 flex-1 truncate">{u.email}</span>
                    <span className="text-cyan-400">{formatCost(u.cost)}</span>
                    <span className="text-slate-500">{u.count}건</span>
                  </div>
                ))}
                {userRanking.length === 0 && (
                  <p className="text-center text-slate-600 text-xs py-4">데이터가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminAnalytics;
