import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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

type Tab = 'info' | 'game' | 'usage' | 'payments' | 'security' | 'referral';

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
  free: { name: '무료', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' },
  basic: { name: '베이직', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  pro: { name: '프로', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
  operator: { name: '운영자', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
};

const USAGE_TYPE_ICONS: Record<string, string> = {
  image: '🖼️',
  tts: '🔊',
  video: '🎬',
  script: '📝',
  bonus: '🎁',
  signup: '🎉',
  purchase: '💳',
  deduct: '➖',
  refund: '🔄',
};

const UserProfile: React.FC<UserProfileProps> = ({ onClose, currentCredits, currentPlan, userName, onNameChange, gameState }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [usageFilter, setUsageFilter] = useState<string>('all');

  // 프로필 편집
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // 아바타 업로드
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
        setMessage({ type: 'success', text: t('profile.nameChanged') });
      } else {
        setMessage({ type: 'error', text: d.error || t('profile.changeFailed') });
      }
    } catch {
      setMessage({ type: 'error', text: t('auth.serverError') });
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
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('이미지를 읽을 수 없습니다.')); };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: t('profile.imageOnlyError') });
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
        setMessage({ type: 'success', text: t('profile.avatarChanged') });
      } else {
        setMessage({ type: 'error', text: d.error || t('profile.uploadFailed') });
      }
    } catch {
      setMessage({ type: 'error', text: t('profile.uploadError') });
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || !newPassword) {
      setMessage({ type: 'error', text: t('profile.enterPassword') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('auth.passwordMismatch') });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: t('auth.passwordTooShort') });
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
        setMessage({ type: 'success', text: t('profile.passwordChanged') });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: d.error || t('profile.changeFailed') });
      }
    } catch {
      setMessage({ type: 'error', text: t('auth.serverError') });
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
    : history.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        switch (usageFilter) {
          case 'image': return desc.includes('이미지') || desc.includes('image') || desc.includes('gemini');
          case 'tts': return desc.includes('tts') || desc.includes('음성') || desc.includes('elevenlabs');
          case 'video': return desc.includes('영상') || desc.includes('video') || desc.includes('pixverse');
          case 'bonus': return tx.type === 'bonus' || tx.type === 'admin' || tx.amount > 0;
          case 'purchase': return tx.type === 'charge' || tx.type === 'subscription';
          default: return true;
        }
      });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{t('profile.title')}</h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >{'\✕'}</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--border-default)' }}>
          {([
            { id: 'info' as Tab, label: t('profile.info') },
            { id: 'game' as Tab, label: `🎮 ${t('profile.gameTab')}` },
            { id: 'usage' as Tab, label: t('profile.usage') },
            { id: 'payments' as Tab, label: t('profile.payments') },
            { id: 'security' as Tab, label: t('profile.security') },
            { id: 'referral' as Tab, label: t('profile.referral') },
          ]).map(tab => (
            <button
              key={tab.id}
              className={tabClass(tab.id)}
              onClick={() => { setActiveTab(tab.id); setMessage(null); }}
              style={activeTab !== tab.id ? { color: 'var(--text-secondary)' } : undefined}
            >
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
            </button>
          ))}
        </div>

        {/* 메시지 */}
        {message && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded-lg text-xs font-bold ${
            message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* 컨텐츠 */}
        <div className="overflow-y-auto p-6 flex-1">
          {/* === 내 정보 탭 === */}
          {activeTab === 'info' && (
            loading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
            ) : profile ? (
              <div className="space-y-5">
                {/* 프로필 이미지 + 이름 */}
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
                          {saving ? '...' : t('common.save')}
                        </button>
                        <button
                          onClick={() => { setEditingName(false); setNewName(profile.name); }}
                          className="px-2 py-1.5 text-xs transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {t('common.cancel')}
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
                          {/* 장착 칭호 */}
                          {equipped?.title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              {equipped.title.name}
                            </span>
                          )}
                        </div>
                        {/* 장착 배지 */}
                        {equipped?.badges && equipped.badges.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            {equipped.badges.map((b, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }} title={b.name}>
                                {b.emoji} {b.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{profile.email}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 레벨 + XP 바 */}
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

                {/* 정보 카드 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('profile.plan')}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${planInfo.bg} ${planInfo.color}`}>
                      {planInfo.name}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('common.credits')}</p>
                    <span className={`text-sm font-bold ${currentPlan === 'operator' ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {currentPlan === 'operator' ? t('profile.unlimited') : currentCredits.toLocaleString()}
                    </span>
                  </div>
                  {gs?.synced && usr ? (
                    <>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('profile.streak')}</p>
                        <span className="text-sm font-bold" style={{ color: usr.streakCount >= 7 ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {usr.streakCount}{t('profile.daysUnit')}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('profile.totalLogin')}</p>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                          {usr.loginDays}{t('profile.daysUnit')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('profile.joinDate')}</p>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(profile.createdAt).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{t('profile.loginMethod')}</p>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {profile.oauthProvider === 'google' ? 'Google' : profile.oauthProvider === 'kakao' ? 'Kakao' : t('profile.email')}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* {t('common.credits')} 단가 안내 */}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-[10px] mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>{t('profile.creditCosts')}</p>
                  <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {Object.entries(CREDIT_CONFIG.COSTS).map(([key, cost]) => (
                      <div key={key} className="flex justify-between">
                        <span>{key === 'gemini-2.5-flash-image' ? t('creditShop.imageGemini') : key === 'gpt-image-1' ? t('creditShop.imageGpt') : key === 'tts_per_1000_chars' ? t('creditShop.ttsPerK') : key === 'video' ? t('creditShop.videoConvert') : key === 'script' ? t('creditShop.scriptGen') : key}</span>
                        <span className="font-bold">{cost} {t('common.credits')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('profile.loadFailed')}</div>
            )
          )}

          {/* === 게임 탭 === */}
          {activeTab === 'game' && (
            gs?.synced && usr ? (
              <div className="space-y-4">
                {/* 통계 그리드 */}
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('profile.activityStats')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: t('profile.totalGenerations'), value: usr.totalGenerations, icon: '📝' },
                      { label: t('common.images'), value: usr.totalImages, icon: '🖼️' },
                      { label: t('common.audio'), value: usr.totalAudio, icon: '🔊' },
                      { label: t('common.video'), value: usr.totalVideos, icon: '🎬' },
                      { label: t('common.login'), value: `${usr.loginDays}${t('profile.daysUnit')}`, icon: '📅' },
                      { label: t('profile.maxCombo'), value: usr.maxCombo, icon: '⚡' },
                    ].map((s, i) => (
                      <div key={i} className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                        <div className="text-sm mb-0.5">{s.icon}</div>
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 업적 요약 */}
                {achievements && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('header.achievements')}</p>
                    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {Object.values(achievements.progress).filter(a => a.unlocked).length} / {achievements.definitions.length} {t('game.achievementsUnlocked')}
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
                      {/* 최근 업적 3개 */}
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
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('profile.noAchievements')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 뿑기 요약 */}
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('game.gacha')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{usr.totalGachaPulls}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t('profile.totalGacha')}</div>
                    </div>
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: usr.gachaTickets > 0 ? '#22c55e' : 'var(--text-primary)' }}>{usr.gachaTickets}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t('profile.tickets')}</div>
                    </div>
                    <div className="p-2.5 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>{usr.gachaPityLegendary}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t('profile.pityCounter')}</div>
                    </div>
                  </div>
                </div>

                {/* 인벤토리 요약 */}
                {inventory && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('header.inventory')}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: t('game.title'), count: inventory.titles.length },
                        { label: t('game.badge'), count: inventory.badges.length },
                        { label: t('game.frame'), count: inventory.frames.length },
                        { label: t('game.consumable'), count: inventory.consumables.length },
                      ].map((inv, i) => (
                        <div key={i} className="p-2 rounded-lg border text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                          <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{inv.count}</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{inv.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 연속 출석 마일스톤 */}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-[10px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('profile.streakMilestone')}</p>
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
                        {d}{t('profile.daysUnit')}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-3xl mb-3">{'🎮'}</div>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('profile.gamification')}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('profile.gamificationDesc')}</p>
              </div>
            )
          )}

          {/* === 사용 내역 탭 === */}
          {activeTab === 'usage' && (
            <div>
              {/* 필터 버튼 */}
              <div className="flex flex-wrap gap-1 mb-3">
                {[
                  { id: 'all', label: t('profile.filterAll') },
                  { id: 'image', label: `🖼️ ${t('common.images')}` },
                  { id: 'tts', label: '🔊 TTS' },
                  { id: 'video', label: `🎬 ${t('common.video')}` },
                  { id: 'bonus', label: `🎁 ${t('profile.filterBonus')}` },
                  { id: 'purchase', label: `💳 ${t('profile.filterPurchase')}` },
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
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('profile.noUsageHistory')}</div>
              ) : (
                <div className="space-y-1">
                  {filteredHistory.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{USAGE_TYPE_ICONS[tx.type] || '\•'}</span>
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
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tx.balance_after.toLocaleString()} {t('profile.balance')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === 결제 내역 탭 === */}
          {activeTab === 'payments' && (
            <div>
              {paymentsLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{t('profile.noPaymentHistory')}</div>
              ) : (
                <div className="space-y-1">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {p.credits.toLocaleString()} {t('common.credits')}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                            p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            p.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          }`}>
                            {p.status === 'completed' ? t('profile.statusCompleted') : p.status === 'failed' ? t('profile.statusFailed') : t('profile.statusPending')}
                          </span>
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {p.provider === 'toss' ? 'Toss' : 'Stripe'} {'\·'} {new Date(p.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {p.amount.toLocaleString()}{t('creditShop.won')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === 보안 탭 === */}
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
                    {t('profile.oauthLoginActive', { provider: profile.oauthProvider === 'google' ? 'Google' : 'Kakao' })}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('profile.oauthNoPassword')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('profile.changePassword')}</h3>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('profile.currentPassword')}</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('profile.newPassword')}</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('profile.confirmNewPassword')}</label>
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
                    {changingPassword ? t('profile.changing') : t('profile.changePassword')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* === 추천 탭 === */}
          {activeTab === 'referral' && (
            <ReferralPanelLazy />
          )}
        </div>
      </div>
    </div>
  );
};

// 추천 패널 lazy import (모듈 초기화 순서 문제 방지)
const ReferralPanelLazy: React.FC = () => {
  const [Panel, setPanel] = useState<React.FC | null>(null);
  useEffect(() => {
    import('./ReferralPanel').then(m => setPanel(() => m.default));
  }, []);
  if (!Panel) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} /></div>;
  return <Panel />;
};

export default UserProfile;
