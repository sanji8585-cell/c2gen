import React, { useState, useEffect, useCallback } from 'react';

interface AuthGateProps {
  onSuccess: (name: string) => void;
  onAdminSuccess: (token: string) => void;
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

const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, onAdminSuccess }) => {
  const [tab, setTab] = useState<Tab>('login');
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

  // 관리자
  const [adminPassword, setAdminPassword] = useState('');

  // 공지사항
  const [announcements, setAnnouncements] = useState<{id: string; title: string; content: string; type: string}[]>([]);

  // 마운트 시 기존 세션 확인
  useEffect(() => {
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
  }, [onSuccess, onAdminSuccess]);

  // 공지사항 불러오기
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
    setSubmitting(true);
    try {
      const { ok, data } = await authFetch({ action: 'register', name: regName, email: regEmail, password: regPassword });
      if (ok && data.success) {
        setSuccess(data.message);
        setRegName(''); setRegEmail(''); setRegPassword(''); setRegConfirm('');
        setTimeout(() => setTab('login'), 2000);
      } else {
        setError(data.message || '회원가입에 실패했습니다.');
      }
    } catch { setError('서버 연결에 실패했습니다.'); }
    setSubmitting(false);
  }, [regName, regEmail, regPassword, regConfirm]);

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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            C2 GEN
          </h1>
          <p className="text-slate-500 text-sm mt-1">AI 스토리보드 & 영상 자동 생성</p>
        </div>

        {/* 탭 전환 (로그인/회원가입만) */}
        <div className="flex rounded-xl overflow-hidden mb-6 bg-slate-900/50 border border-slate-800/50">
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
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
          <form onSubmit={handleLogin} className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/60 p-6 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이메일</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
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
          </form>
        )}

        {/* 회원가입 폼 */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/60 p-6 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이름</label>
              <input
                type="text"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                placeholder="이름 입력"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이메일</label>
              <input
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호</label>
              <input
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                placeholder="비밀번호 (4자 이상)"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호 확인</label>
              <input
                type="password"
                value={regConfirm}
                onChange={e => setRegConfirm(e.target.value)}
                placeholder="비밀번호 재입력"
                className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '가입 중...' : '회원가입'}
            </button>
            <p className="text-[11px] text-slate-500 text-center">
              가입 후 관리자 승인이 필요합니다
            </p>
          </form>
        )}

        {/* 관리자 로그인 폼 */}
        {tab === 'admin' && (
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/60 p-6">
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">관리자 비밀번호</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="관리자 비밀번호 입력"
                  className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
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

      {/* 숨겨진 관리자 진입점 - 우하단 구석 */}
      {tab !== 'admin' && (
        <button
          onClick={() => { setTab('admin'); clearMessages(); }}
          className="fixed bottom-3 right-3 w-6 h-6 rounded-full opacity-0 hover:opacity-30 transition-opacity cursor-default"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      {tab === 'admin' && (
        <button
          onClick={() => { setTab('login'); clearMessages(); }}
          className="fixed bottom-3 right-3 text-[10px] text-slate-700 hover:text-slate-500 transition-colors"
        >
          돌아가기
        </button>
      )}
    </div>
  );
};

export default AuthGate;
