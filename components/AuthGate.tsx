import React, { useState, useEffect, useCallback } from 'react';

interface AuthGateProps {
  onSuccess: (name: string) => void;
  onAdminSuccess: (token: string) => void;
  mode?: 'page' | 'modal';
  onClose?: () => void;
  skipAutoValidation?: boolean;
  initialTab?: Tab;
}

type Tab = 'login' | 'register' | 'admin';

const STORAGE_KEYS = {
  TOKEN: 'c2gen_session_token',
  USER_NAME: 'c2gen_user_name',
  ADMIN_TOKEN: 'c2gen_admin_token',
};

async function authFetch(body: Record<string, any>) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !data.message) data.message = data.error || `오류가 발생했습니다. (${res.status})`;
  return { ok: res.ok, data };
}

const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, onAdminSuccess, mode = 'page', onClose, skipAutoValidation, initialTab }) => {
  const isModal = mode === 'modal';
  const [tab, setTab] = useState<Tab>(initialTab || 'login');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 로그인
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 회원가입
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regTermsAgreed, setRegTermsAgreed] = useState(false);
  const [regMarketingAgreed, setRegMarketingAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // 관리자
  const [adminPassword, setAdminPassword] = useState('');

  // 공지사항
  const [announcements, setAnnouncements] = useState<{id: string; title: string; content: string; type: string}[]>([]);

  // OAuth 설정
  const [oauthConfig, setOauthConfig] = useState<{ googleClientId?: string; kakaoJsKey?: string } | null>(null);

  // 마운트 시 기존 세션 확인 (모달 모드에서는 스킵)
  useEffect(() => {
    if (skipAutoValidation) {
      setLoading(false);
      return;
    }
    (async () => {
      // 관리자 토큰 먼저 확인
      const savedAdmin = localStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN);
      if (savedAdmin) {
        try {
          const { data } = await authFetch({ action: 'validate', token: savedAdmin });
          if (data.valid && data.email === 'admin') {
            onAdminSuccess(savedAdmin);
            return;
          }
          localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
        } catch {}
      }

      // 일반 사용자 토큰 확인
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (token) {
        try {
          const { data } = await authFetch({ action: 'validate', token });
          if (data.valid) {
            localStorage.setItem(STORAGE_KEYS.USER_NAME, data.name);
            onSuccess(data.name);
            setLoading(false);
            return;
          }
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER_NAME);
        } catch {}
      }
      setLoading(false);
    })();
  }, [onSuccess, onAdminSuccess, skipAutoValidation]);

  // 공지사항 + OAuth 설정 불러오기
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getActiveAnnouncements' }),
        });
        const data = await res.json();
        if (data.announcements?.length > 0) setAnnouncements(data.announcements);
      } catch {}
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getOAuthConfig' }),
        });
        const data = await res.json();
        if (data.googleClientId || data.kakaoJsKey) setOauthConfig(data);
      } catch {}
    })();
  }, []);

  const clearMessages = () => { setError(null); setSuccess(null); };

  // 로그인 핸들러
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!loginEmail || !loginPassword) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'login', email: loginEmail, password: loginPassword });
      if (ok && data.success) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
        localStorage.setItem(STORAGE_KEYS.USER_NAME, data.name);
        onSuccess(data.name);
      } else {
        setError(data.message || '로그인에 실패했습니다.');
      }
    } catch { setError('서버 연결에 실패했습니다.'); }
    setSubmitting(false);
  }, [loginEmail, loginPassword, onSuccess]);

  // 회원가입 핸들러
  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!regName || !regEmail || !regPassword) { setError('모든 필드를 입력해주세요.'); return; }
    if (regPassword !== regConfirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (regPassword.length < 4) { setError('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (!regTermsAgreed) { setError('이용약관 및 개인정보처리방침에 동의해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'register', name: regName, email: regEmail, password: regPassword, termsAgreedAt: new Date().toISOString(), marketingAgreed: regMarketingAgreed });
      if (ok && data.success) {
        setSuccess(data.message);
        setRegName(''); setRegEmail(''); setRegPassword(''); setRegConfirm(''); setRegTermsAgreed(false); setRegMarketingAgreed(false);
        setTimeout(() => setTab('login'), 2000);
      } else {
        setError(data.message || '회원가입에 실패했습니다.');
      }
    } catch { setError('서버 연결에 실패했습니다.'); }
    setSubmitting(false);
  }, [regName, regEmail, regPassword, regConfirm, regTermsAgreed]);

  // ── 소셜 로그인 핸들러 ──
  const handleOAuthLogin = useCallback(async (provider: 'google' | 'kakao', token: string) => {
    clearMessages();
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'oauthLogin', provider, token });
      if (ok && data.success) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
        localStorage.setItem(STORAGE_KEYS.USER_NAME, data.name);
        onSuccess(data.name);
      } else if (data.pending) {
        setSuccess(data.message);
      } else {
        setError(data.message || `${provider} 로그인에 실패했습니다.`);
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    }
    setSubmitting(false);
  }, [onSuccess]);

  const handleGoogleLogin = useCallback(() => {
    const google = (window as any).google;
    if (!google?.accounts?.id) {
      setError('Google 로그인 SDK가 로드되지 않았습니다.');
      return;
    }
    if (!oauthConfig?.googleClientId) {
      setError('Google 로그인이 설정되지 않았습니다.');
      return;
    }
    google.accounts.id.initialize({
      client_id: oauthConfig.googleClientId,
      callback: (response: any) => {
        if (response.credential) {
          handleOAuthLogin('google', response.credential);
        }
      },
    });
    google.accounts.id.prompt();
  }, [handleOAuthLogin, oauthConfig]);

  const handleKakaoLogin = useCallback(() => {
    const Kakao = (window as any).Kakao;
    if (!Kakao) {
      setError('Kakao 로그인 SDK가 로드되지 않았습니다.');
      return;
    }
    if (!oauthConfig?.kakaoJsKey) {
      setError('Kakao 로그인이 설정되지 않았습니다.');
      return;
    }
    if (!Kakao.isInitialized()) {
      Kakao.init(oauthConfig.kakaoJsKey);
    }
    Kakao.Auth.login({
      success: (authObj: any) => {
        handleOAuthLogin('kakao', authObj.access_token);
      },
      fail: () => {
        setError('Kakao 로그인이 취소되었습니다.');
      },
    });
  }, [handleOAuthLogin, oauthConfig]);

  // 관리자 로그인
  const handleAdminLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!adminPassword) { setError('관리자 비밀번호를 입력해주세요.'); return; }
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'adminLogin', password: adminPassword });
      if (ok && data.success) {
        localStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, data.token);
        setAdminPassword('');
        onAdminSuccess(data.token);
      } else {
        setError(data.message || '관리자 인증에 실패했습니다.');
      }
    } catch { setError('서버 연결에 실패했습니다.'); }
    setSubmitting(false);
  }, [adminPassword, onAdminSuccess]);

  if (loading) {
    return (
      <div className={isModal ? 'flex items-center justify-center py-16' : 'min-h-screen flex items-center justify-center'} style={isModal ? undefined : { backgroundColor: 'var(--bg-base)' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>인증 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={isModal ? 'relative' : 'min-h-screen flex items-center justify-center p-4'} style={isModal ? undefined : { backgroundColor: 'var(--bg-base)' }}>
      <div className="w-full max-w-md">
        {/* 모달 닫기 버튼 */}
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="absolute top-1 right-1 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            C2 GEN
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>AI 스토리보드 & 영상 자동 생성</p>
        </div>

        {/* 탭 전환 (로그인/회원가입만) */}
        <div className="flex rounded-xl overflow-hidden mb-6 border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 50%, transparent)' }}>
          {[
            { id: 'login' as Tab, label: '로그인' },
            { id: 'register' as Tab, label: '회원가입' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); clearMessages(); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-cyan-600 text-white'
                  : ''
              }`}
              style={tab !== t.id ? { color: 'var(--text-secondary)' } : undefined}
              onMouseEnter={e => { if (tab !== t.id) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; } }}
              onMouseLeave={e => { if (tab !== t.id) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.backgroundColor = ''; } }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 메시지 */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-900/30 border border-green-700/50 text-green-300 text-sm">
            {success}
          </div>
        )}

        {/* 공지사항 */}
        {announcements.length > 0 && tab !== 'admin' && (
          <div className="mb-4 space-y-2">
            {announcements.map(ann => (
              <div key={ann.id} className={`p-3 rounded-lg border text-sm ${
                ann.type === 'urgent' ? 'bg-red-900/30 border-red-700/50 text-red-300'
                : ann.type === 'warning' ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300'
                : 'bg-blue-900/30 border-blue-700/50 text-blue-300'
              }`}>
                <p className="font-medium text-[13px]">{ann.title}</p>
                <p className="text-[12px] mt-0.5 opacity-80">{ann.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* 로그인 폼 */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="backdrop-blur-md rounded-2xl border p-6 space-y-4" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }}>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>이메일</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>비밀번호</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '로그인 중...' : '로그인'}
            </button>

            {/* 소셜 로그인 (설정된 경우에만 표시) */}
            {oauthConfig && (oauthConfig.googleClientId || oauthConfig.kakaoJsKey) && <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--border-subtle)' }} />
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="px-3" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)', color: 'var(--text-muted)' }}>또는</span>
              </div>
            </div>

            {/* 소셜 로그인 버튼 */}
            <div className="space-y-2">
              {oauthConfig?.googleClientId && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={submitting}
                className="w-full py-2.5 border rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: 'white', borderColor: '#dadce0', color: '#3c4043' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google로 로그인
              </button>
              )}
              {oauthConfig?.kakaoJsKey && (
              <button
                type="button"
                onClick={handleKakaoLogin}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: '#FEE500', color: '#191919' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#191919">
                  <path d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.12c-.1.36.3.65.62.45l4.84-3.2c.42.04.85.06 1.28.06 5.52 0 10-3.36 10-7.5S17.52 3 12 3z"/>
                </svg>
                Kakao로 로그인
              </button>
              )}
            </div>
            </>}
          </form>
        )}

        {/* 회원가입 폼 */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="backdrop-blur-md rounded-2xl border p-6 space-y-4" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }}>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>이름</label>
              <input
                type="text"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                placeholder="이름 입력"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>이메일</label>
              <input
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>비밀번호</label>
              <input
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                placeholder="비밀번호 (4자 이상)"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>비밀번호 확인</label>
              <input
                type="password"
                value={regConfirm}
                onChange={e => setRegConfirm(e.target.value)}
                placeholder="비밀번호 재입력"
                className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                autoComplete="new-password"
              />
            </div>
            {/* 약관 동의 */}
            <div className="space-y-2 pt-1">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="terms-agree"
                  checked={regTermsAgreed}
                  onChange={e => setRegTermsAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-cyan-500 cursor-pointer"
                />
                <label htmlFor="terms-agree" className="text-[11px] leading-relaxed cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-red-400 font-bold mr-0.5">[필수]</span>
                  <button type="button" onClick={() => setShowTerms(true)} className="text-cyan-500 hover:text-cyan-400 underline underline-offset-2">이용약관</button>
                  {' 및 '}
                  <button type="button" onClick={() => setShowTerms(true)} className="text-cyan-500 hover:text-cyan-400 underline underline-offset-2">개인정보처리방침</button>
                  에 동의합니다.
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="marketing-agree"
                  checked={regMarketingAgreed}
                  onChange={e => setRegMarketingAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-cyan-500 cursor-pointer"
                />
                <label htmlFor="marketing-agree" className="text-[11px] leading-relaxed cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-slate-400 font-bold mr-0.5">[선택]</span>
                  마케팅 및 광고성 정보 수신에 동의합니다.
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '가입 중...' : '회원가입'}
            </button>
            <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
              가입 후 관리자 승인이 필요합니다
            </p>
          </form>
        )}

        {/* 관리자 로그인 폼 */}
        {tab === 'admin' && (
          <div className="backdrop-blur-md rounded-2xl border p-6" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }}>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>관리자 비밀번호</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="관리자 비밀번호 입력"
                  className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '인증 중...' : '관리자 인증'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 약관 모달 */}
      {showTerms && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowTerms(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>이용약관 및 개인정보처리방침</h2>
              <button onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-slate-200 text-xl leading-none px-2">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 text-[12px] leading-relaxed space-y-5" style={{ color: 'var(--text-secondary)' }}>

              <section>
                <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>제1장 이용약관</h3>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제1조 (목적)</h4>
                <p>본 약관은 C2 GEN AI Content Studio(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자의 권리·의무·책임사항을 규정함을 목적으로 합니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제2조 (서비스 제공 및 변경)</h4>
                <p>① 회사는 AI 기반 콘텐츠 생성 서비스를 제공합니다.<br/>
                ② 회사는 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이에 대해 별도의 보상 의무를 부담하지 않습니다.<br/>
                ③ 서비스 변경 시 사전 공지를 원칙으로 하되, 긴급한 경우 사후 공지할 수 있습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제3조 (회원가입 및 계정)</h4>
                <p>① 회원가입은 관리자 승인제로 운영되며, 승인 여부는 관리자의 재량에 따릅니다.<br/>
                ② 회사는 다음 각 호에 해당하는 경우 사전 통보 없이 회원의 서비스 이용을 제한하거나 계정을 삭제할 수 있습니다.<br/>
                &nbsp;&nbsp;1. 타인의 정보를 도용한 경우<br/>
                &nbsp;&nbsp;2. 서비스를 이용하여 법령 또는 공서양속에 반하는 콘텐츠를 생성한 경우<br/>
                &nbsp;&nbsp;3. 과도한 API 호출 등 서비스 운영에 지장을 초래하는 경우<br/>
                &nbsp;&nbsp;4. 기타 본 약관을 위반한 경우<br/>
                ③ 계정 삭제 시 잔여 크레딧은 환불되지 않습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제4조 (크레딧 및 결제)</h4>
                <p>① 서비스 이용에는 크레딧이 소요되며, 크레딧은 유료 충전 또는 회사의 무상 지급을 통해 획득합니다.<br/>
                ② 충전된 크레딧은 원칙적으로 환불되지 않습니다. 다만, 관련 법령에 따른 환불 의무가 있는 경우에는 그에 따릅니다.<br/>
                ③ 회사는 크레딧 가격을 변경할 수 있으며, 변경 시 7일 전 서비스 내 공지합니다.<br/>
                ④ 최종 사용일로부터 6개월간 크레딧 사용 이력이 없는 경우, 잔여 크레딧은 소멸될 수 있습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제5조 (지적재산권)</h4>
                <p>① 서비스의 소프트웨어, UI, 알고리즘 등에 대한 지적재산권은 회사에 귀속됩니다.<br/>
                ② AI를 통해 생성된 콘텐츠(이미지, 음성, 영상, 스크립트 등)에 대해 이용자는 비독점적 사용 권한을 부여받으며, 개인적·상업적 목적으로 사용할 수 있습니다.<br/>
                ③ 회사는 이용자가 생성한 콘텐츠를 서비스 개선, 품질 분석, 홍보 목적으로 비독점적으로 사용할 수 있는 권리를 보유합니다.<br/>
                ④ 이용자는 서비스를 통해 생성한 콘텐츠에 대해 제3자에 대한 배타적 저작권을 주장할 수 없습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제6조 (면책 조항)</h4>
                <p>① 서비스는 "있는 그대로(AS-IS)" 제공되며, 회사는 AI 생성 결과물의 정확성, 품질, 적합성에 대해 어떠한 보증도 하지 않습니다.<br/>
                ② 회사는 다음 각 호의 손해에 대해 책임을 부담하지 않습니다.<br/>
                &nbsp;&nbsp;1. 천재지변, 전쟁, 기간통신사업자의 서비스 중지 등 불가항력으로 인한 서비스 중단<br/>
                &nbsp;&nbsp;2. 제3자 API(Google, ElevenLabs, fal.ai 등)의 장애 또는 정책 변경으로 인한 서비스 제한<br/>
                &nbsp;&nbsp;3. 이용자의 귀책사유로 인한 서비스 이용 장애<br/>
                ③ 회사의 총 손해배상 책임은 해당 이용자가 최근 3개월간 회사에 지급한 금액을 상한으로 합니다.<br/>
                ④ 회사는 간접 손해, 영업 손실, 데이터 손실, 기대 이익의 상실에 대해 책임을 부담하지 않습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제7조 (서비스 양도)</h4>
                <p>회사는 서비스의 전부 또는 일부를 제3자에게 양도·합병할 수 있으며, 이 경우 회원 정보는 승계됩니다. 회사는 이를 사전에 공지합니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제8조 (약관의 변경)</h4>
                <p>① 회사는 관련 법령에 위배되지 않는 범위에서 본 약관을 변경할 수 있습니다.<br/>
                ② 약관 변경 시 서비스 내 공지하며, 공지 후 7일 이내에 이의를 제기하지 않고 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 간주합니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>제9조 (관할 및 준거법)</h4>
                <p>본 약관은 대한민국 법률에 따라 규율되며, 분쟁 발생 시 서울중앙지방법원을 제1심 전속관할법원으로 합니다.</p>
              </section>

              <hr className="border-slate-200 dark:border-slate-700" />

              <section>
                <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>제2장 개인정보처리방침</h3>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>1. 수집하는 개인정보 항목</h4>
                <p>• 필수: 이메일 주소, 이름, 비밀번호(해시 처리하여 저장)<br/>
                • 자동 수집: 서비스 이용 기록, 접속 시간, 생성한 콘텐츠 데이터</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>2. 개인정보의 이용 목적</h4>
                <p>• 회원 식별 및 서비스 제공<br/>
                • 크레딧 관리 및 결제 처리<br/>
                • 부정 이용 방지 및 서비스 운영 관리<br/>
                • 서비스 개선 및 이용 통계 분석</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>3. 제3자 제공</h4>
                <p>AI 서비스 제공을 위해 아래 제3자에게 콘텐츠 데이터가 전달됩니다.<br/>
                • Google LLC (Gemini API) — 스크립트 생성, 이미지 생성<br/>
                • ElevenLabs, Inc. — 음성 합성(TTS)<br/>
                • fal.ai — 이미지 생성, 영상 변환<br/>
                각 업체의 개인정보처리방침은 해당 업체의 웹사이트를 참조하시기 바랍니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>4. 보관 기간</h4>
                <p>회원 탈퇴 시까지 보관하며, 관련 법령에 따른 의무 보관 기간이 있는 경우 해당 기간까지 보관합니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>5. 이용자의 권리</h4>
                <p>이용자는 자신의 개인정보에 대해 열람, 정정, 삭제를 요청할 수 있습니다. 요청은 관리자 이메일로 접수하며, 7영업일 이내에 처리합니다.</p>
              </section>

              <hr className="border-slate-200 dark:border-slate-700" />

              <section>
                <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>제3장 마케팅 및 광고성 정보 수신 동의 (선택)</h3>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>1. 수신 항목</h4>
                <p>• 신규 기능 안내, 이벤트·프로모션 정보, 크레딧 할인 혜택<br/>
                • 서비스 업데이트 및 활용 팁</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>2. 수신 방법</h4>
                <p>이메일, 서비스 내 알림</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>3. 철회 방법</h4>
                <p>마케팅 수신 동의는 언제든지 철회할 수 있으며, 관리자 이메일 또는 서비스 내 설정에서 수신 거부할 수 있습니다. 수신 거부 시에도 서비스 이용에는 영향이 없습니다.</p>

                <h4 className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>4. 보관 기간</h4>
                <p>수신 동의 철회 시 또는 회원 탈퇴 시까지</p>
              </section>

              <p className="text-[10px] pt-2" style={{ color: 'var(--text-muted)' }}>
                시행일: 2025년 1월 1일 | 최종 수정일: 2026년 3월 5일
              </p>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              <button
                onClick={() => { setRegTermsAgreed(true); setShowTerms(false); }}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-all"
              >
                동의하고 닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AuthGate;
