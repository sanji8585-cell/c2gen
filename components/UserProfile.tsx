import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CREDIT_CONFIG } from '../config';
import type { CreditTransaction } from '../types';
import type { LevelInfo, EquippedItems, GameSyncResponse } from '../types/gamification';
import AvatarFrame from './AvatarFrame';

interface UserProfileProps {
  onClose: () => void;
  currentCredits: number;
  currentPlan: string;
  userName: string;
  onNameChange: (newName: string) => void;
  gameState?: {
    levelInfo: LevelInfo;
    userState: GameSyncResponse['user'] | null;
    equipped: EquippedItems;
    achievements: GameSyncResponse['achievements'] | null;
    inventory: GameSyncResponse['inventory'] | null;
    synced: boolean;
  };
}

type Tab = 'info' | 'game' | 'usage' | 'payments' | 'security';

interface ProfileData {
  email: string;
  name: string;
  plan: string;
  credits: number;
  createdAt: string;
  oauthProvider: string | null;
  avatarUrl: string | null;
}

interface PaymentRecord {
  id: string;
  provider: string;
  amount: number;
  credits: number;
  type: string;
  status: string;
  created_at: string;
}

const PLAN_LABELS: Record<string, { name: string; color: string; bg: string }> = {
  free: { name: '\uBB34\uB8CC', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' },
  basic: { name: '\uBCA0\uC774\uC9C1', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  pro: { name: '\uD504\uB85C', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
  operator: { name: '\uC6B4\uC601\uC790', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
};

const USAGE_TYPE_ICONS: Record<string, string> = {
  image: '\uD83D\uDDBC\uFE0F',
  tts: '\uD83D\uDD0A',
  video: '\uD83C\uDFAC',
  script: '\uD83D\uDCDD',
  bonus: '\uD83C\uDF81',
  signup: '\uD83C\uDF89',
  purchase: '\uD83D\uDCB3',
  deduct: '\u2796',
  refund: '\uD83D\uDD04',
};

const UserProfile: React.FC<UserProfileProps> = ({ onClose, currentCredits, currentPlan, userName, onNameChange, gameState }) => {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [usageFilter, setUsageFilter] = useState<string>('all');

  // \uD504\uB85C\uD544 \uD3B8\uC9D1
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // \uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // \uC544\uBC14\uD0C0 \uC5C5\uB85C\uB4DC
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem('c2gen_session_token');

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getProfile', token }),
      });
      const d = await r.json();
      if (r.ok) {
        setProfile(d);
        setNewName(d.name);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCreditHistory', token, limit: 50 }),
      });
      const d = await r.json();
      setHistory(d.transactions || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, [token]);

  const fetchPayments = useCallback(async () => {
    if (!token) return;
    setPaymentsLoading(true);
    try {
      const r = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': token },
        body: JSON.stringify({ action: 'payment-history' }),
      });
      const d = await r.json();
      setPayments(d.payments || []);
    } catch { /* ignore */ }
    setPaymentsLoading(false);
  }, [token]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => {
    if (activeTab === 'usage') fetchHistory();
    if (activeTab === 'payments') fetchPayments();
  }, [activeTab, fetchHistory, fetchPayments]);

  const handleSaveName = async () => {
    if (!token || !newName.trim() || newName.trim() === profile?.name) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateProfile', token, name: newName.trim() }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setProfile(p => p ? { ...p, name: newName.trim() } : p);
        localStorage.setItem('c2gen_user_name', newName.trim());
        onNameChange(newName.trim());
        setEditingName(false);
        setMessage({ type: 'success', text: '\uB2C9\uB124\uC784\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' });
      } else {
        setMessage({ type: 'error', text: d.error || '\uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' });
      }
    } catch {
      setMessage({ type: 'error', text: '\uC11C\uBC84 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' });
    }
    setSaving(false);
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const resizeImage = (file: File, maxSize: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1]);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('\uC774\uBBF8\uC9C0\uB97C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.')); };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: '\uC774\uBBF8\uC9C0 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.' });
      return;
    }

    setUploadingAvatar(true);
    setMessage(null);
    try {
      const base64 = await resizeImage(file, 512, 0.85);

      const r = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-avatar', token, data: base64 }),
      });
      const d = await r.json();
      if (r.ok && d.url) {
        setProfile(p => p ? { ...p, avatarUrl: d.url } : p);
        setMessage({ type: 'success', text: '\uD504\uB85C\uD544 \uC774\uBBF8\uC9C0\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' });
      } else {
        setMessage({ type: 'error', text: d.error || '\uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' });
      }
    } catch {
      setMessage({ type: 'error', text: '\uC5C5\uB85C\uB4DC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.' });
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || !newPassword) {
      setMessage({ type: 'error', text: '\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '\uC0C8 \uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: '\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 4\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.' });
      return;
    }

    setChangingPassword(true);
    setMessage(null);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changePassword', token, currentPassword, newPassword }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setMessage({ type: 'success', text: '\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: d.error || '\uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' });
      }
    } catch {
      setMessage({ type: 'error', text: '\uC11C\uBC84 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.' });
    }
    setChangingPassword(false);
  };

  const planInfo = PLAN_LABELS[currentPlan] || PLAN_LABELS.free;

  const tabClass = (tab: Tab) =>
    activeTab === tab
      ? 'px-3 py-2 text-xs font-bold transition-colors relative text-brand-400'
      : 'px-3 py-2 text-xs font-bold transition-colors relative';

  const txTypeColor = (_type: string, amount: number) => {
    if (amount > 0) return 'text-emerald-400';
    return 'text-red-400';
  };

  // Game state helpers
  const gs = gameState;
  const usr = gs?.userState;
  const lvl = gs?.levelInfo;
  const equipped = gs?.equipped;
  const achievements = gs?.achievements;
  const inventory = gs?.inventory;

  const filteredHistory = usageFilter === 'all'
    ? history
    : history.filter(tx => tx.type === usageFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* \uD5E4\uB354 */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>\uB0B4 \uD504\uB85C\uD544</h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >{'\u2715'}</button>
        </div>

        {/* \uD0ED */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--border-default)' }}>
          {([
            { id: 'info' as Tab, label: '\uB0B4 \uC815\uBCF4' },
            { id: 'game' as Tab, label: '\uD83C\uDFAE \uAC8C\uC784' },
            { id: 'usage' as Tab, label: '\uC0AC\uC6A9 \uB0B4\uC5ED' },
            { id: 'payments' as Tab, label: '\uACB0\uC81C \uB0B4\uC5ED' },
            { id: 'security' as Tab, label: '\uBCF4\uC548' },
          ]).map(t => (
            <button
              key={t.id}
              className={tabClass(t.id)}
              onClick={() => { setActiveTab(t.id); setMessage(null); }}
              style={activeTab !== t.id ? { color: 'var(--text-secondary)' } : undefined}
            >
              {t.label}
              {activeTab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
            </button>
          ))}
        </div>

        {/* \uBA54\uC2DC\uC9C0 */}
        {message && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded-lg text-xs font-bold ${
            message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* \uCEE8\uD150\uCE20 */}
        <div className="overflow-y-auto p-6 flex-1">
          {/* === \uB0B4 \uC815\uBCF4 \uD0ED === */}
          {activeTab === 'info' && (
            loading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uB85C\uB529 \uC911...</div>
            ) : profile ? (
              <div className="space-y-5">
                {/* \uD504\uB85C\uD544 \uC774\uBBF8\uC9C0 + \uC774\uB984 */}
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <button
                      onClick={handleAvatarClick}
                      className="transition-all hover:opacity-80"
                      style={{ width: 64, height: 64 }}
                      disabled={uploadingAvatar}
                    >
                      <AvatarFrame
                        name={profile.name}
                        size={64}
                        rarity={equipped?.frame?.rarity || null}
                        frameName={equipped?.frame?.name}
                        avatarUrl={profile.avatarUrl}
                      />
                    </button>
                    {uploadingAvatar && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center cursor-pointer" onClick={handleAvatarClick}>
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          maxLength={30}
                          className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                          autoFocus
                        />
                        <button
                          onClick={handleSaveName}
                          disabled={saving || !newName.trim()}
                          className="px-3 py-1.5 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 rounded-lg text-xs font-bold border border-brand-500/30 transition-all disabled:opacity-50"
                        >
                          {saving ? '...' : '\uC800\uC7A5'}
                        </button>
                        <button
                          onClick={() => { setEditingName(false); setNewName(profile.name); }}
                          className="px-2 py-1.5 text-xs transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          \uCDE8\uC18C
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
                          <button
                            onClick={() => setEditingName(true)}
                            className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {/* \uC7A5\uCC29 \uCE6D\uD638 */}
                          {equipped?.title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              {equipped.title.name}
                            </span>
                          )}
                        </div>
                        {/* \uC7A5\uCC29 \uBC30\uC9C0 */}
                        {equipped?.badges && equipped.badges.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            {equipped.badges.map((b, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                                {b.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{profile.email}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* \uB808\uBCA8 + XP \uBC14 */}
                {gs?.synced && lvl && (
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{lvl.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: lvl.color }}>{lvl.title}</span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Lv.{lvl.level}</span>
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                        {lvl.isMaxLevel ? 'MAX' : `${lvl.currentXp - lvl.xpForCurrent} / ${lvl.xpForNext - lvl.xpForCurrent} XP`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${lvl.progress}%`, backgroundColor: lvl.color }}
                      />
                    </div>
                    {usr && usr.prestigeLevel > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
                          Prestige {usr.prestigeLevel} (+{usr.prestigeXpBonus}% XP)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* \uC815\uBCF4 \uCE74\uB4DC */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uB4F1\uAE09</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${planInfo.bg} ${planInfo.color}`}>
                      {planInfo.name}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uD06C\uB808\uB527</p>
                    <span className={`text-sm font-bold ${currentPlan === 'operator' ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {currentPlan === 'operator' ? '\uBB34\uC81C\uD55C' : currentCredits.toLocaleString()}
                    </span>
                  </div>
                  {gs?.synced && usr ? (
                    <>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uC5F0\uC18D \uCD9C\uC11D</p>
                        <span className="text-sm font-bold" style={{ color: usr.streakCount >= 7 ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {usr.streakCount}\uC77C
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uCD1D \uB85C\uADF8\uC778</p>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                          {usr.loginDays}\uC77C
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uAC00\uC785\uC77C</p>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(profile.createdAt).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>\uB85C\uADF8\uC778 \uBC29\uC2DD</p>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {profile.oauthProvider === 'google' ? 'Google' : profile.oauthProvider === 'kakao' ? 'Kakao' : '\uC774\uBA54\uC77C'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* \uD06C\uB808\uB527 \uB2E8\uAC00 \uC548\uB0B4 */}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-[10px] mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>\uD06C\uB808\uB527 \uC0AC\uC6A9 \uB2E8\uAC00</p>
                  <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {Object.entries(CREDIT_CONFIG.COSTS).map(([key, cost]) => (
                      <div key={key} className="flex justify-between">
                        <span>{key === 'gemini-2.5-flash-image' ? 'Gemini \uC774\uBBF8\uC9C0' : key === 'gpt-image-1' ? 'GPT \uC774\uBBF8\uC9C0' : key === 'tts_per_1000_chars' ? 'TTS (1000\uC790)' : key === 'video' ? '\uC601\uC0C1 \uBCC0\uD658' : key === 'script' ? '\uC2A4\uD06C\uB9BD\uD2B8' : key}</span>
                        <span className="font-bold">{cost} \uD06C\uB808\uB527</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uD504\uB85C\uD544\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</div>
            )
          )}

          {/* === \uAC8C\uC784 \uD0ED === */}
          {activeTab === 'game' && (
            gs?.synced && usr ? (
              <div className="space-y-4">
                {/* \uD1B5\uACC4 \uADF8\uB9AC\uB4DC */}
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>\uD65C\uB3D9 \uD1B5\uACC4</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '\uCD1D \uC0DD\uC131', value: usr.totalGenerations, icon: '\uD83D\uDCCA' },
                      { label: '\uC774\uBBF8\uC9C0', value: usr.totalImages, icon: '\uD83D\uDDBC\uFE0F' },
                      { label: '\uC624\uB514\uC624', value: usr.totalAudio, icon: '\uD83D\uDD0A' },
                      { label: '\uC601\uC0C1', value: usr.totalVideos, icon: '\uD83C\uDFAC' },
                      { label: '\uB85C\uADF8\uC778', value: `${usr.loginDays}\uC77C`, icon: '\uD83D\uDCC5' },
                      { label: '\uCD5C\uACE0 \uCF64\uBCF4', value: usr.maxCombo, icon: '\uD83D\uDD25' },
                    ].map((s, i) => (
                      <div key={i} className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <div className="text-sm mb-0.5">{s.icon}</div>
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* \uC5C5\uC801 \uC694\uC57D */}
                {achievements && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>\uC5C5\uC801</p>
                    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {Object.values(achievements.progress).filter(a => a.unlocked).length} / {achievements.definitions.length} \uB2EC\uC131
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {Math.round((Object.values(achievements.progress).filter(a => a.unlocked).length / Math.max(1, achievements.definitions.length)) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${(Object.values(achievements.progress).filter(a => a.unlocked).length / Math.max(1, achievements.definitions.length)) * 100}%` }}
                        />
                      </div>
                      {/* \uCD5C\uADFC \uC5C5\uC801 3\uAC1C */}
                      <div className="space-y-1">
                        {achievements.definitions
                          .filter(a => achievements.progress[a.id]?.unlocked)
                          .slice(-3)
                          .reverse()
                          .map(a => (
                            <div key={a.id} className="flex items-center gap-2 text-[10px]">
                              <span>{a.icon}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                            </div>
                          ))}
                        {Object.values(achievements.progress).filter(a => a.unlocked).length === 0 && (
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>\uC544\uC9C1 \uB2EC\uC131\uD55C \uC5C5\uC801\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* \uBFD1\uAE30 \uC694\uC57D */}
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>\uBFD1\uAE30 (Gacha)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{usr.totalGachaPulls}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>\uCD1D \uBFD1\uAE30</div>
                    </div>
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: usr.gachaTickets > 0 ? '#22c55e' : 'var(--text-primary)' }}>{usr.gachaTickets}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>\uD2F0\uCF13</div>
                    </div>
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>{usr.gachaPityLegendary}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>\uCC9C\uC7A5 \uCE74\uC6B4\uD130</div>
                    </div>
                  </div>
                </div>

                {/* \uC778\uBCA4\uD1A0\uB9AC \uC694\uC57D */}
                {inventory && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>\uC778\uBCA4\uD1A0\uB9AC</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '\uCE6D\uD638', count: inventory.titles.length },
                        { label: '\uBC30\uC9C0', count: inventory.badges.length },
                        { label: '\uD504\uB808\uC784', count: inventory.frames.length },
                        { label: '\uC18C\uBAA8\uD488', count: inventory.consumables.length },
                      ].map((inv, i) => (
                        <div key={i} className="p-2 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                          <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{inv.count}</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{inv.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* \uC5F0\uC18D \uCD9C\uC11D \uB9C8\uC77C\uC2A4\uD1A4 */}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-[10px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>\uC5F0\uC18D \uCD9C\uC11D \uB9C8\uC77C\uC2A4\uD1A4</p>
                  <div className="flex items-center gap-1">
                    {[3, 7, 14, 30].map(d => (
                      <div
                        key={d}
                        className="flex-1 text-center py-1 rounded text-[9px] font-bold"
                        style={{
                          backgroundColor: usr.streakCount >= d ? 'rgba(234, 179, 8, 0.15)' : 'var(--bg-elevated)',
                          color: usr.streakCount >= d ? '#eab308' : 'var(--text-muted)',
                          border: `1px solid ${usr.streakCount >= d ? 'rgba(234, 179, 8, 0.3)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        {d}\uC77C
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-3xl mb-3">{'\uD83C\uDFAE'}</div>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>\uAC8C\uC774\uBBF8\uD53C\uCF00\uC774\uC158</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>\uB85C\uADF8\uC778 \uD6C4 \uAC8C\uC784 \uB370\uC774\uD130\uAC00 \uB3D9\uAE30\uD654\uB418\uBA74 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
              </div>
            )
          )}

          {/* === \uC0AC\uC6A9 \uB0B4\uC5ED \uD0ED === */}
          {activeTab === 'usage' && (
            <div>
              {/* \uD544\uD130 \uBC84\uD2BC */}
              <div className="flex flex-wrap gap-1 mb-3">
                {[
                  { id: 'all', label: '\uC804\uCCB4' },
                  { id: 'image', label: '\uD83D\uDDBC\uFE0F \uC774\uBBF8\uC9C0' },
                  { id: 'tts', label: '\uD83D\uDD0A TTS' },
                  { id: 'video', label: '\uD83C\uDFAC \uC601\uC0C1' },
                  { id: 'bonus', label: '\uD83C\uDF81 \uBCF4\uC0C1' },
                  { id: 'purchase', label: '\uD83D\uDCB3 \uCDA9\uC804' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setUsageFilter(f.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold border transition-all"
                    style={{
                      backgroundColor: usageFilter === f.id ? 'var(--bg-elevated)' : 'transparent',
                      borderColor: usageFilter === f.id ? 'var(--border-default)' : 'var(--border-subtle)',
                      color: usageFilter === f.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {historyLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uB85C\uB529 \uC911...</div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uC0AC\uC6A9 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>
              ) : (
                <div className="space-y-1">
                  {filteredHistory.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{USAGE_TYPE_ICONS[tx.type] || '\u2022'}</span>
                        <div>
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tx.description || tx.type}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {new Date(tx.created_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${txTypeColor(tx.type, tx.amount)}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tx.balance_after.toLocaleString()} \uC794\uC561</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === \uACB0\uC81C \uB0B4\uC5ED \uD0ED === */}
          {activeTab === 'payments' && (
            <div>
              {paymentsLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uB85C\uB529 \uC911...</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>\uACB0\uC81C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>
              ) : (
                <div className="space-y-1">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {p.credits.toLocaleString()} \uD06C\uB808\uB527
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                            p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            p.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          }`}>
                            {p.status === 'completed' ? '\uC644\uB8CC' : p.status === 'failed' ? '\uC2E4\uD328' : '\uB300\uAE30'}
                          </span>
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {p.provider === 'toss' ? 'Toss' : 'Stripe'} {'\u00B7'} {new Date(p.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {p.amount.toLocaleString()}\uC6D0
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === \uBCF4\uC548 \uD0ED === */}
          {activeTab === 'security' && (
            <div>
              {profile?.oauthProvider ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
                    <svg className="w-7 h-7" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {profile.oauthProvider === 'google' ? 'Google' : 'Kakao'} \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778 \uC911
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    \uC18C\uC15C \uB85C\uADF8\uC778 \uACC4\uC815\uC740 \uBE44\uBC00\uBC88\uD638\uB97C \uBCC4\uB3C4\uB85C \uAD00\uB9AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD</h3>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>\uD604\uC7AC \uBE44\uBC00\uBC88\uD638</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>\uC0C8 \uBE44\uBC00\uBC88\uD638</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full py-2.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 text-sm font-bold border border-brand-500/30 transition-all disabled:opacity-50"
                  >
                    {changingPassword ? '\uBCC0\uACBD \uC911...' : '\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
