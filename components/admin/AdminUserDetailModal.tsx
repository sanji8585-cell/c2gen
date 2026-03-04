import React, { useState, useEffect, useCallback } from 'react';
import {
  UserInfo, UsageBreakdown, UsageLog, ACTION_LABELS,
  authFetch, formatUsd, formatCost, timeAgo,
} from './adminUtils';

interface Props {
  user: UserInfo;
  adminToken: string;
  onClose: () => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminUserDetailModal: React.FC<Props> = ({ user, adminToken, onClose, onToast }) => {
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<UsageBreakdown | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [activeSessions, setActiveSessions] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { ok, data } = await authFetch({ action: 'userDetail', adminToken, email: user.email });
        if (ok) {
          setBreakdown(data.breakdown || {});
          setLogs(data.recentUsage || []);
          setActiveSessions(data.activeSessions || 0);
        }
      } catch {}
      setLoading(false);
    })();
  }, [adminToken, user.email]);

  const handleRevokeSession = useCallback(async () => {
    if (!confirm(`${user.email}의 모든 세션을 강제 만료하시겠습니까?`)) return;
    try {
      const { ok, data } = await authFetch({ action: 'revokeSession', adminToken, email: user.email });
      if (ok) {
        onToast('success', data.message);
        setActiveSessions(0);
      } else {
        onToast('error', data.message || '처리에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  }, [adminToken, user.email, onToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-200">{user.name}</h3>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
              <p className="text-slate-500 text-xs">로딩 중...</p>
            </div>
          ) : (
            <>
              {/* 사용량 요약 */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">타입별 사용량</h4>
                {breakdown && Object.keys(breakdown).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(breakdown).map(([action, info]) => (
                      <div key={action} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/30">
                        <p className="text-[11px] text-slate-500">{ACTION_LABELS[action] || action}</p>
                        <p className="text-sm font-medium text-slate-200">{info.count}회</p>
                        <p className="text-[11px] text-cyan-400">{formatCost(info.cost)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">사용 기록이 없습니다.</p>
                )}
              </div>

              {/* 세션 정보 */}
              <div className="flex items-center justify-between bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
                <div>
                  <p className="text-[11px] text-slate-500">활성 세션</p>
                  <p className="text-sm font-medium text-slate-200">{activeSessions}개</p>
                </div>
                <button
                  onClick={handleRevokeSession}
                  className="text-[11px] px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition-all"
                >
                  세션 강제 만료
                </button>
              </div>

              {/* 최근 사용 로그 */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">최근 사용 내역</h4>
                {logs.length > 0 ? (
                  <div className="space-y-1 max-h-[240px] overflow-y-auto">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 bg-slate-800/30 rounded">
                        <span className="text-slate-400">{ACTION_LABELS[log.action] || log.action}</span>
                        <span className="text-cyan-400/80">{formatUsd(Number(log.cost_usd))}</span>
                        <span className="text-slate-600">{timeAgo(log.created_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">사용 기록이 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetailModal;
