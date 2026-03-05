import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CREDIT_CONFIG } from '../config';
import type { CreditTransaction } from '../types';

interface UserProfileProps {
  onClose: () => void;
  currentCredits: number;
  currentPlan: string;
  userName: string;
  onNameChange: (newName: string) => void;
}

type Tab = 'info' | 'usage' | 'payments' | 'security';

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

const UserProfile: React.FC<UserProfileProps> = ({ onClose, currentCredits, currentPlan, userName, onNameChange }) => {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

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
        setMessage({ type: 'success', text: '닉네임이 변경되었습니다.' });
      } else {
        setMessage({ type: 'error', text: d.error || '변경에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결에 실패했습니다.' });
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
      setMessage({ type: 'error', text: '이미지 파일만 업로드할 수 있습니다.' });
      return;
    }

    setUploadingAvatar(true);
    setMessage(null);
    try {
      // 이미지 리사이즈 (최대 512px, JPEG 85% 품질)
      const base64 = await resizeImage(file, 512, 0.85);

      const r = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-avatar', token, data: base64 }),
      });
      const d = await r.json();
      if (r.ok && d.url) {
        setProfile(p => p ? { ...p, avatarUrl: d.url } : p);
        setMessage({ type: 'success', text: '프로필 이미지가 변경되었습니다.' });
      } else {
        setMessage({ type: 'error', text: d.error || '업로드에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '업로드 중 오류가 발생했습니다.' });
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || !newPassword) {
      setMessage({ type: 'error', text: '비밀번호를 입력해주세요.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: '새 비밀번호는 4자 이상이어야 합니다.' });
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
        setMessage({ type: 'success', text: '비밀번호가 변경되었습니다.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: d.error || '변경에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결에 실패했습니다.' });
    }
    setChangingPassword(false);
  };

  const planInfo = PLAN_LABELS[currentPlan] || PLAN_LABELS.free;

  const tabClass = (tab: Tab) =>
    activeTab === tab
      ? 'px-4 py-2 text-sm font-bold transition-colors relative text-brand-400'
      : 'px-4 py-2 text-sm font-bold transition-colors relative';

  const txTypeColor = (type: string, amount: number) => {
    if (amount > 0) return 'text-emerald-400';
    return 'text-red-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>내 프로필</h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--border-default)' }}>
          {([
            { id: 'info' as Tab, label: '내 정보' },
            { id: 'usage' as Tab, label: '사용 내역' },
            { id: 'payments' as Tab, label: '결제 내역' },
            { id: 'security' as Tab, label: '보안' },
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
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
            ) : profile ? (
              <div className="space-y-5">
                {/* 프로필 이미지 + 이름 */}
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <button
                      onClick={handleAvatarClick}
                      className="w-16 h-16 rounded-full overflow-hidden border-2 transition-all hover:opacity-80"
                      style={{ borderColor: 'var(--border-default)' }}
                      disabled={uploadingAvatar}
                    >
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="프로필" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white text-xl font-black">
                          {profile.name.charAt(0).toUpperCase()}
                        </div>
                      )}
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
                  <div className="flex-1">
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
                          {saving ? '...' : '저장'}
                        </button>
                        <button
                          onClick={() => { setEditingName(false); setNewName(profile.name); }}
                          className="px-2 py-1.5 text-xs transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
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
                      </div>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{profile.email}</p>
                  </div>
                </div>

                {/* 정보 카드 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>등급</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${planInfo.bg} ${planInfo.color}`}>
                      {planInfo.name}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>크레딧</p>
                    <span className={`text-sm font-bold ${currentPlan === 'operator' ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {currentPlan === 'operator' ? '무제한' : currentCredits.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>가입일</p>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(profile.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>로그인 방식</p>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {profile.oauthProvider === 'google' ? 'Google' : profile.oauthProvider === 'kakao' ? 'Kakao' : '이메일'}
                    </span>
                  </div>
                </div>

                {/* 크레딧 단가 안내 */}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-[10px] mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>크레딧 사용 단가</p>
                  <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {Object.entries(CREDIT_CONFIG.COSTS).map(([key, cost]) => (
                      <div key={key} className="flex justify-between">
                        <span>{key === 'gemini-2.5-flash-image' ? 'Gemini 이미지' : key === 'gpt-image-1' ? 'GPT 이미지' : key === 'tts_per_1000_chars' ? 'TTS (1000자)' : key === 'video' ? '영상 변환' : key === 'script' ? '스크립트' : key}</span>
                        <span className="font-bold">{cost} 크레딧</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>프로필을 불러올 수 없습니다.</div>
            )
          )}

          {/* === 사용 내역 탭 === */}
          {activeTab === 'usage' && (
            <div>
              {historyLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>사용 내역이 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {history.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tx.description || tx.type}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(tx.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${txTypeColor(tx.type, tx.amount)}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tx.balance_after.toLocaleString()} 잔액</div>
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
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>결제 내역이 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {p.credits.toLocaleString()} 크레딧
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                            p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            p.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          }`}>
                            {p.status === 'completed' ? '완료' : p.status === 'failed' ? '실패' : '대기'}
                          </span>
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {p.provider === 'toss' ? 'Toss' : 'Stripe'} · {new Date(p.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {p.amount.toLocaleString()}원
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
                    {profile.oauthProvider === 'google' ? 'Google' : 'Kakao'} 계정으로 로그인 중
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    소셜 로그인 계정은 비밀번호를 별도로 관리하지 않습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>비밀번호 변경</h3>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>현재 비밀번호</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>새 비밀번호</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold mb-1 block" style={{ color: 'var(--text-muted)' }}>새 비밀번호 확인</label>
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
                    {changingPassword ? '변경 중...' : '비밀번호 변경'}
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
