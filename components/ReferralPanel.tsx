import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ReferralReward {
  id: string;
  referred_email: string;
  tier: number;
  credits: number;
  status: string;
  created_at: string;
}

interface DirectReferral {
  email: string;
  name: string;
  status: string;
  createdAt: number;
}

interface ReferralInfo {
  referralCode: string;
  referredBy: string | null;
  directReferrals: DirectReferral[];
  tierCounts: Record<number, number>;
  totalEarned: number;
  rewards: ReferralReward[];
}

const ReferralPanel: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('c2gen_session_token');
      if (!token) return;
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'referral-getMyInfo', token }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setInfo(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const copyLink = () => {
    if (!info) return;
    const link = `${window.location.origin}/?ref=${info.referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyCode = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!info) return null;

  const totalDirect = info.directReferrals.length;
  const approvedDirect = info.directReferrals.filter(r => r.status === 'approved').length;

  return (
    <div className="space-y-5">
      {/* 소개 배너 */}
      <div className="rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.2)' }}>
        <p className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('referral.bannerTitle')}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {t('referral.bannerDesc')}
        </p>
      </div>

      {/* 내 추천 링크 */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('referral.yourLink')}</h3>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{t('referral.shareLinkDesc')}</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 px-3 py-2 rounded-lg text-xs font-mono truncate" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {window.location.origin}/?ref={info.referralCode}
          </div>
          <button onClick={copyLink}
            className="px-3 py-2 rounded-lg text-xs font-bold transition-all flex-shrink-0"
            style={{ backgroundColor: copied ? '#22c55e' : 'var(--brand-500)', color: '#fff' }}
          >
            {copied ? t('referral.copied') : t('referral.copyLink')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('referral.yourCode')}:</span>
          <button onClick={copyCode}
            className="px-2 py-0.5 rounded text-xs font-bold tracking-wider transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--brand-500)' }}
          >
            {info.referralCode}
          </button>
        </div>
        {info.referredBy && (
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
            {t('referral.referredBy')}: {info.referredBy}
          </p>
        )}
      </div>

      {/* 보상 안내 */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('referral.howItWorks')}</h3>
        <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>1</span>
            <span>{t('referral.step1')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>2</span>
            <span>{t('referral.step2')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>3</span>
            <span><b>{t('referral.step3')}</b></span>
          </div>
        </div>
        <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {t('referral.tierNote')}
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('referral.directReferrals')} value={totalDirect} sub={`${t('referral.approved')} ${approvedDirect}`} />
        <StatCard label={t('referral.totalEarned')} value={`${info.totalEarned.toLocaleString()}`} sub={t('common.credits')} />
        <StatCard label={t('referral.tiersActive')} value={Object.keys(info.tierCounts).length} sub={t('referral.tiersActiveSub')} />
      </div>

      {/* 단계별 추천 현황 */}
      {Object.keys(info.tierCounts).length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t('referral.tierRewardStatus')}</h3>
          <div className="space-y-2">
            {Object.entries(info.tierCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([tier, count]) => (
              <div key={tier} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>{t('referral.tierLabel', { tier })}</span>
                <span className="font-bold" style={{ color: 'var(--brand-500)' }}>{t('referral.countUnit', { count })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 직접 추천한 사람들 */}
      {info.directReferrals.length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t('referral.referralHistory')}</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {info.directReferrals.map(r => (
              <div key={r.email} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{r.email}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  r.status === 'approved' ? 'text-green-400 bg-green-500/10' :
                  r.status === 'pending' ? 'text-yellow-400 bg-yellow-500/10' :
                  'text-red-400 bg-red-500/10'
                }`}>
                  {r.status === 'approved' ? t('referral.statusApproved') : r.status === 'pending' ? t('referral.statusPending') : t('referral.statusRejected')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 보상 이력 */}
      {info.rewards.length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t('referral.rewardHistory')}</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {info.rewards.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('referral.tierLabel', { tier: r.tier })}</span>
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{r.referred_email}</span>
                </div>
                <span className="font-bold" style={{ color: '#22c55e' }}>+{r.credits}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
  </div>
);

export default ReferralPanel;
