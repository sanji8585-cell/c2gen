import React, { useState, useEffect, useCallback } from 'react';

interface ReferralSettings {
  enabled: boolean;
  max_tiers: number;
  tier1_reward: number;
  tier2_reward: number;
  tier3_reward: number;
  tier4_reward: number;
  tier5_reward: number;
  signup_bonus: number;
  reward_trigger: string;
}

interface AdminStats {
  totalReferred: number;
  totalPaid: number;
  totalPending: number;
  topReferrers: { email: string; count: number }[];
}

const AdminReferral: React.FC = () => {
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const adminToken = localStorage.getItem('c2gen_session_token');

  const callAPI = useCallback(async (action: string, params: Record<string, any> = {}) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: adminToken, adminToken, ...params }),
    });
    return res.json();
  }, [adminToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, statsRes] = await Promise.all([
        callAPI('referral-getSettings'),
        callAPI('referral-adminStats'),
      ]);
      if (settingsRes.success) setSettings(settingsRes.settings);
      if (statsRes.success) setStats(statsRes);
    } catch {} finally { setLoading(false); }
  }, [callAPI]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await callAPI('referral-updateSettings', { settings });
    } catch {} finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-8">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-4 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>추천 가입자</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.totalReferred}</p>
          </div>
          <div className="rounded-xl border p-4 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>지급 보상</p>
            <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{stats.totalPaid.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border p-4 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>대기 보상</p>
            <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{stats.totalPending.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Top 추천인 */}
      {stats && stats.topReferrers.length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Top 추천인</h3>
          <div className="space-y-2">
            {stats.topReferrers.map((r, i) => (
              <div key={r.email} className="flex items-center justify-between text-xs">
                <span>
                  <span className="font-bold mr-2" style={{ color: i < 3 ? '#f59e0b' : 'var(--text-muted)' }}>#{i + 1}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{r.email}</span>
                </span>
                <span className="font-bold" style={{ color: 'var(--brand-500)' }}>{r.count}건</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 설정 */}
      {settings && (
        <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>추천 설정</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>활성화</span>
              <input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SettingInput label="최대 단계" value={settings.max_tiers} min={1} max={5}
              onChange={v => setSettings({ ...settings, max_tiers: v })} />
            <SettingInput label="가입자 보너스" value={settings.signup_bonus} min={0}
              onChange={v => setSettings({ ...settings, signup_bonus: v })} />
          </div>

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>단계별 보상 (크레딧)</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map(tier => (
                <SettingInput key={tier} label={`${tier}단계`}
                  value={(settings as any)[`tier${tier}_reward`]}
                  min={0}
                  onChange={v => setSettings({ ...settings, [`tier${tier}_reward`]: v })}
                  disabled={tier > settings.max_tiers}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>보상 지급 시점</p>
            <select value={settings.reward_trigger}
              onChange={e => setSettings({ ...settings, reward_trigger: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            >
              <option value="approved">관리자 승인 시</option>
              <option value="signup">회원가입 즉시</option>
              <option value="first_project">첫 프로젝트 생성 시</option>
            </select>
          </div>

          <button onClick={saveSettings} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      )}
    </div>
  );
};

const SettingInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, min, max, onChange, disabled }) => (
  <div>
    <label className="text-[10px] block mb-1" style={{ color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{label}</label>
    <input type="number" value={value} min={min} max={max} disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full px-2 py-1.5 rounded-lg text-sm border text-center disabled:opacity-30"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
    />
  </div>
);

export default AdminReferral;
