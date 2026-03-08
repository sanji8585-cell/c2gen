import React, { useState, useEffect, useCallback } from 'react';
import { UserInfo, SystemStats, authFetch, ADMIN_STORAGE_KEY } from './adminUtils';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminProjects from './AdminProjects';
import AdminAnalytics from './AdminAnalytics';
import AdminSessions from './AdminSessions';
import AdminAnnouncements from './AdminAnnouncements';
import AdminLogs from './AdminLogs';
import AdminApiKeys from './AdminApiKeys';
import AdminCredits from './AdminCredits';
import AdminActivityLogs from './AdminActivityLogs';
import AdminGamification from './AdminGamification';
import AdminReferral from './AdminReferral';
import AdminPlayground from './AdminPlayground';
import AdminInquiries from './AdminInquiries';

type Section = 'overview' | 'users' | 'projects' | 'playground' | 'analytics' | 'credits' | 'sessions' | 'announcements' | 'inquiries' | 'activity' | 'logs' | 'apikeys' | 'gamification' | 'referral';

interface Props {
  adminToken: string;
  onLogout: () => void;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const AdminDashboard: React.FC<Props> = ({ adminToken, onLogout }) => {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 프로젝트 탭으로 이동 시 선택할 사용자
  const [projectUserEmail, setProjectUserEmail] = useState<string | undefined>();
  // 사용자 탭 필터
  const [usersFilter, setUsersFilter] = useState<string | undefined>();

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const { ok, data } = await authFetch({ action: 'listUsers', adminToken });
      if (ok) {
        setUsers(data.users || []);
      } else {
        // 세션 만료
        showToast('error', '관리자 세션이 만료되었습니다.');
        onLogout();
      }
    } catch {
      showToast('error', '유저 목록을 불러올 수 없습니다.');
    }
  }, [adminToken, onLogout, showToast]);

  const loadStats = useCallback(async () => {
    try {
      const { ok, data } = await authFetch({ action: 'systemStats', adminToken });
      if (ok) setStats(data);
    } catch {}
  }, [adminToken]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadStats()]);
    setLoading(false);
  }, [loadUsers, loadStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const navigateToUsers = useCallback((filter?: string) => {
    setUsersFilter(filter);
    setActiveSection('users');
  }, []);

  const navigateToProjects = useCallback((user: UserInfo) => {
    setProjectUserEmail(user.email);
    setActiveSection('projects');
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    onLogout();
  }, [onLogout]);

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: '대시보드',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: 'users',
      label: '회원 관리',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'projects',
      label: '프로젝트',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'analytics',
      label: '사용량 분석',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: 'credits',
      label: '크레딧/결제',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      id: 'gamification',
      label: '게이미피케이션',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" /><line x1="6" y1="12" x2="6" y2="12.01" /><line x1="10" y1="12" x2="10" y2="12.01" /><line x1="14" y1="12" x2="14" y2="12.01" /><line x1="18" y1="12" x2="18" y2="12.01" />
        </svg>
      ),
    },
    {
      id: 'referral',
      label: '추천인 관리',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'playground',
      label: '놀이터 관리',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
    },
    {
      id: 'sessions',
      label: '세션 관리',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: 'announcements',
      label: '공지사항',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      id: 'inquiries',
      label: '문의 관리',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'apikeys',
      label: 'API 키',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      ),
    },
    {
      id: 'activity',
      label: '활동 로그',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: 'logs',
      label: '에러 로그',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* 사이드바 */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200`}>
        {/* 로고 */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              C2
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-sm font-bold text-slate-200">C2 GEN</h1>
                <p className="text-[10px] text-slate-500">Admin Dashboard</p>
              </div>
            )}
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveSection(item.id);
                if (item.id !== 'users') setUsersFilter(undefined);
                if (item.id !== 'projects') setProjectUserEmail(undefined);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                activeSection === item.id
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
              title={item.label}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
              {sidebarOpen && item.id === 'users' && stats?.pendingUsers ? (
                <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                  {stats.pendingUsers}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* 하단 */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              {sidebarOpen ? (
                <><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></>
              ) : (
                <><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></>
              )}
            </svg>
            {sidebarOpen && <span>사이드바 접기</span>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 border border-cyan-600/20 hover:border-cyan-600/40 transition-all"
            title="사용자 로그인 페이지로 이동"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            {sidebarOpen ? <span>사용자 모드로 전환</span> : null}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* 헤더 */}
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 bg-slate-950/80 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-slate-200">
            {navItems.find(n => n.id === activeSection)?.label || '대시보드'}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={loading}
              className="text-[11px] px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all disabled:opacity-50"
            >
              {loading ? '로딩 중...' : '전체 새로고침'}
            </button>
          </div>
        </header>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'overview' && (
            <AdminOverview
              stats={stats}
              users={users}
              loading={loading}
              onNavigateToUsers={navigateToUsers}
            />
          )}
          {activeSection === 'users' && (
            <AdminUsers
              users={users}
              adminToken={adminToken}
              loading={loading}
              initialFilter={usersFilter}
              onRefresh={refreshAll}
              onViewProjects={navigateToProjects}
              onToast={showToast}
            />
          )}
          {activeSection === 'projects' && (
            <AdminProjects
              users={users}
              adminToken={adminToken}
              initialUserEmail={projectUserEmail}
              onRefresh={refreshAll}
              onToast={showToast}
            />
          )}
          {activeSection === 'analytics' && (
            <AdminAnalytics adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'sessions' && (
            <AdminSessions adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'announcements' && (
            <AdminAnnouncements adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'activity' && (
            <AdminActivityLogs adminToken={adminToken} />
          )}
          {activeSection === 'logs' && (
            <AdminLogs adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'credits' && (
            <AdminCredits adminToken={adminToken} />
          )}
          {activeSection === 'apikeys' && (
            <AdminApiKeys adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'gamification' && (
            <AdminGamification adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'referral' && (
            <AdminReferral />
          )}
          {activeSection === 'playground' && (
            <AdminPlayground adminToken={adminToken} onToast={showToast} />
          )}
          {activeSection === 'inquiries' && (
            <AdminInquiries adminToken={adminToken} onToast={showToast} />
          )}
        </div>
      </main>

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg transition-all ${
          toast.type === 'success'
            ? 'bg-green-900/80 border-green-700/50 text-green-300'
            : 'bg-red-900/80 border-red-700/50 text-red-300'
        }`}>
          <p className="text-sm">{toast.message}</p>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
