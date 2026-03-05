import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, timeAgo } from './adminUtils';

interface AdminCreditsProps {
  adminToken: string;
}

interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  email: string;
  provider: string;
  amount: number;
  credits: number;
  type: string;
  status: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  charge: '충전', deduct: '차감', subscription: '구독', bonus: '보너스', refund: '환불', admin: '관리자',
};
const TYPE_COLORS: Record<string, string> = {
  charge: 'text-emerald-400', deduct: 'text-red-400', subscription: 'text-blue-400',
  bonus: 'text-yellow-400', refund: 'text-orange-400', admin: 'text-purple-400',
};

const AdminCredits: React.FC<AdminCreditsProps> = ({ adminToken }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 크레딧 조정
  const [adjustEmail, setAdjustEmail] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDescription, setAdjustDescription] = useState('');
  const [adjustMessage, setAdjustMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 유저별 크레딧 조회
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<{ credits: number; plan: string; transactions: CreditTransaction[] } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'admin-creditStats', adminToken });
      if (ok) setStats(data);
    } catch {}
    setLoading(false);
  }, [adminToken]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleLookup = useCallback(async (email?: string) => {
    const target = email || lookupEmail;
    if (!target) return;
    setLookupLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'admin-creditHistory', adminToken, email: target });
      if (ok) {
        setLookupResult({ credits: data.credits, plan: data.plan, transactions: data.transactions });
        setLookupEmail(target);
      } else {
        setLookupResult(null);
      }
    } catch {}
    setLookupLoading(false);
  }, [adminToken, lookupEmail]);

  const handleAdjust = async () => {
    const amount = parseInt(adjustAmount);
    if (!adjustEmail || !amount || isNaN(amount)) {
      setAdjustMessage({ type: 'error', text: '이메일과 금액을 입력하세요.' });
      return;
    }

    const { ok, data } = await authFetch({
      action: 'admin-adjustCredits', adminToken,
      email: adjustEmail, amount,
      description: adjustDescription || undefined,
    });

    if (ok && data.success) {
      setAdjustMessage({ type: 'success', text: `${data.message} (잔액: ${data.balance.toLocaleString()})` });
      setAdjustAmount('');
      setAdjustDescription('');
      fetchStats();
      if (lookupEmail === adjustEmail) handleLookup(adjustEmail);
    } else {
      setAdjustMessage({ type: 'error', text: data.error || data.message || '조정 실패' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="유통 크레딧 총량" value={stats?.totalCreditsInCirculation?.toLocaleString() || '0'} />
        <StatCard label="오늘 매출" value={`${(stats?.todayRevenue || 0).toLocaleString()}원`} />
        <StatCard label="베이직" value={stats?.planCounts?.basic || 0} />
        <StatCard label="프로" value={stats?.planCounts?.pro || 0} />
        <StatCard label="운영자" value={stats?.planCounts?.operator || 0} />
      </div>

      {/* 유저별 크레딧 조회 */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-200 mb-3">유저별 크레딧 조회</h3>
        <div className="flex gap-2">
          <input
            type="email"
            value={lookupEmail}
            onChange={e => setLookupEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="이메일 입력 후 엔터"
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            onClick={() => handleLookup()}
            disabled={lookupLoading || !lookupEmail}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
          >
            {lookupLoading ? '조회중...' : '조회'}
          </button>
        </div>

        {lookupResult && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-4 p-3 bg-slate-900/60 rounded-lg border border-slate-700/30">
              <div>
                <p className="text-[10px] text-slate-500">보유 크레딧</p>
                <p className="text-xl font-black text-emerald-400">{lookupResult.credits.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">플랜</p>
                <p className="text-sm font-bold text-slate-200">{lookupResult.plan.toUpperCase()}</p>
              </div>
            </div>

            {lookupResult.transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700">
                      <th className="text-left py-2 px-2">유형</th>
                      <th className="text-right py-2 px-2">금액</th>
                      <th className="text-right py-2 px-2">잔액</th>
                      <th className="text-left py-2 px-2">설명</th>
                      <th className="text-right py-2 px-2">일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupResult.transactions.map(tx => (
                      <tr key={tx.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="py-2 px-2">
                          <span className={`font-medium ${TYPE_COLORS[tx.type] || 'text-slate-400'}`}>
                            {TYPE_LABELS[tx.type] || tx.type}
                          </span>
                        </td>
                        <td className={`py-2 px-2 text-right font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-300">{tx.balance_after.toLocaleString()}</td>
                        <td className="py-2 px-2 text-slate-500 max-w-[200px] truncate" title={tx.description || ''}>
                          {tx.description || '-'}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600">{timeAgo(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-600 text-center py-4">거래 내역이 없습니다.</p>
            )}
          </div>
        )}
      </div>

      {/* 크레딧 수동 조정 */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-200 mb-3">크레딧 수동 조정</h3>

        {adjustMessage && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
            adjustMessage.type === 'success' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50'
              : 'bg-red-900/30 text-red-300 border border-red-700/50'
          }`}>
            {adjustMessage.text}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={adjustEmail}
            onChange={e => setAdjustEmail(e.target.value)}
            placeholder="사용자 이메일"
            className="flex-1 min-w-[200px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
          />
          <input
            type="number"
            value={adjustAmount}
            onChange={e => setAdjustAmount(e.target.value)}
            placeholder="+추가 / -차감"
            className="w-40 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
          />
          <input
            type="text"
            value={adjustDescription}
            onChange={e => setAdjustDescription(e.target.value)}
            placeholder="사유 (선택)"
            className="flex-1 min-w-[150px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            onClick={handleAdjust}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-all"
          >
            조정
          </button>
        </div>
      </div>

      {/* 최근 결제 내역 */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-200 mb-3">최근 결제 내역</h3>
        {(!stats?.recentPayments || stats.recentPayments.length === 0) ? (
          <div className="text-center py-6 text-slate-500 text-sm">결제 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 px-2">이메일</th>
                  <th className="text-left py-2 px-2">결제수단</th>
                  <th className="text-right py-2 px-2">금액</th>
                  <th className="text-right py-2 px-2">크레딧</th>
                  <th className="text-center py-2 px-2">상태</th>
                  <th className="text-right py-2 px-2">일시</th>
                </tr>
              </thead>
              <tbody>
                {(stats.recentPayments as PaymentRecord[]).map((p) => (
                  <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="py-2 px-2 text-slate-300">{p.email}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.provider === 'toss' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {p.provider}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">{p.amount.toLocaleString()}원</td>
                    <td className="py-2 px-2 text-right text-emerald-400 font-bold">{p.credits.toLocaleString()}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                          : p.status === 'failed' ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">
                      {new Date(p.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
    <div className="text-[11px] text-slate-500 mb-1">{label}</div>
    <div className="text-xl font-black text-slate-100">{value}</div>
  </div>
);

export default AdminCredits;
