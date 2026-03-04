import React, { useState, useEffect, useCallback } from 'react';

interface AuthGateProps {
  onSuccess: (name: string) => void;
}

type Tab = 'login' | 'register' | 'admin';

interface UserInfo {
  email: string;
  name: string;
  status: string;
  createdAt: number;
}

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

const AuthGate: React.FC<AuthGateProps> = ({ onSuccess }) => {
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
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // 마운트 시 기존 세션 확인
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) { setLoading(false); return; }

    authFetch({ action: 'validate', token }).then(({ data }) => {
      if (data.valid) {
        localStorage.setItem(STORAGE_KEYS.USER_NAME, data.name);
        onSuccess(data.name);
      } else {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_NAME);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [onSuccess]);

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
        setAdminToken(data.token);
        localStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, data.token);
        setAdminPassword('');
        loadUsers(data.token);
      } else {
        setError(data.message || '관리자 인증에 실패했습니다.');
      }
    } catch { setError('서버 연결에 실패했습니다.'); }
    setSubmitting(false);
  }, [adminPassword]);

  // 유저 목록 로드
  const loadUsers = useCallback(async (token?: string) => {
    const t = token || adminToken;
    if (!t) return;
    setAdminLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'listUsers', adminToken: t });
      if (ok) setUsers(data.users || []);
      else { setAdminToken(null); setError('관리자 세션이 만료되었습니다.'); }
    } catch { setError('유저 목록을 불러올 수 없습니다.'); }
    setAdminLoading(false);
  }, [adminToken]);

  // 유저 승인/거부/삭제
  const handleUserAction = useCallback(async (action: 'approveUser' | 'rejectUser' | 'deleteUser', email: string) => {
    if (!adminToken) return;
    clearMessages();
    try {
      const { ok, data } = await authFetch({ action, adminToken, email });
      if (ok) {
        setSuccess(data.message);
        loadUsers();
      } else setError(data.message || '처리에 실패했습니다.');
    } catch { setError('서버 연결에 실패했습니다.'); }
  }, [adminToken, loadUsers]);

  // 관리자 탭 진입 시 저장된 토큰 확인
  useEffect(() => {
    if (tab === 'admin' && !adminToken) {
      const saved = localStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN);
      if (saved) {
        authFetch({ action: 'validate', token: saved }).then(({ data }) => {
          if (data.valid && data.email === 'admin') {
            setAdminToken(saved);
            loadUsers(saved);
          } else {
            localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
          }
        });
      }
    }
  }, [tab, adminToken, loadUsers]);

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

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      approved: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const labels: Record<string, string> = { pending: '대기', approved: '승인', rejected: '거부' };
    return (
      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

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

        {/* 탭 전환 */}
        <div className="flex rounded-xl overflow-hidden mb-6 bg-slate-900/50 border border-slate-800/50">
          {[
            { id: 'login' as Tab, label: '로그인' },
            { id: 'register' as Tab, label: '회원가입' },
            { id: 'admin' as Tab, label: '관리자' },
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

        {/* 관리자 패널 */}
        {tab === 'admin' && (
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/60 p-6">
            {!adminToken ? (
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
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">회원 관리</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadUsers()}
                      disabled={adminLoading}
                      className="text-[11px] px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all"
                    >
                      {adminLoading ? '로딩...' : '새로고침'}
                    </button>
                    <button
                      onClick={() => { setAdminToken(null); localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN); }}
                      className="text-[11px] px-3 py-1 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                    >
                      로그아웃
                    </button>
                  </div>
                </div>

                {users.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">등록된 회원이 없습니다.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {users.map(user => (
                      <div key={user.email} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-medium text-slate-200">{user.name}</span>
                            <span className="text-[11px] text-slate-500 ml-2">{user.email}</span>
                          </div>
                          {statusBadge(user.status)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-600">
                            {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                          <div className="flex gap-1.5">
                            {user.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleUserAction('approveUser', user.email)}
                                  className="text-[11px] px-2.5 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 rounded-lg transition-all"
                                >
                                  승인
                                </button>
                                <button
                                  onClick={() => handleUserAction('rejectUser', user.email)}
                                  className="text-[11px] px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition-all"
                                >
                                  거부
                                </button>
                              </>
                            )}
                            {user.status === 'approved' && (
                              <button
                                onClick={() => handleUserAction('rejectUser', user.email)}
                                className="text-[11px] px-2.5 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border border-yellow-600/30 rounded-lg transition-all"
                              >
                                차단
                              </button>
                            )}
                            {user.status === 'rejected' && (
                              <button
                                onClick={() => handleUserAction('approveUser', user.email)}
                                className="text-[11px] px-2.5 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 rounded-lg transition-all"
                              >
                                승인
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`${user.name} 님을 삭제하시겠습니까?`)) {
                                  handleUserAction('deleteUser', user.email);
                                }
                              }}
                              className="text-[11px] px-2.5 py-1 bg-slate-700/50 hover:bg-red-900/50 text-slate-500 hover:text-red-400 rounded-lg transition-all"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthGate;
