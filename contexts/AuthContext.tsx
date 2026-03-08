/**
 * 인증 Context (App.tsx에서 분리)
 * - 로그인/로그아웃/세션 복원
 * - 관리자 인증
 * - AuthModal 상태
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  userName: string | null;
  isAdmin: boolean;
  adminToken: string | null;
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
  handleAuthSuccess: (name: string) => void;
  handleAdminSuccess: (token: string) => void;
  handleLogout: () => Promise<void>;
  handleAdminLogout: () => void;
  setUserName: (name: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleAuthSuccess = useCallback((name: string) => {
    setIsAuthenticated(true);
    setUserName(name);
    setShowAuthModal(false);
  }, []);

  const handleAdminSuccess = useCallback((token: string) => {
    setIsAdmin(true);
    setAdminToken(token);
    setShowAuthModal(false);
  }, []);

  const handleAdminLogout = useCallback(() => {
    setIsAdmin(false);
    setAdminToken(null);
    localStorage.removeItem('c2gen_admin_token');
    window.history.replaceState({}, '', '/');
  }, []);

  const handleLogout = useCallback(async () => {
    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      try {
        await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout', token }),
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem('c2gen_session_token');
    localStorage.removeItem('c2gen_user_name');
    setIsAuthenticated(false);
    setUserName(null);
  }, []);

  // 페이지 로드 시 기존 세션 자동 복원
  useEffect(() => {
    (async () => {
      const savedAdmin = localStorage.getItem('c2gen_admin_token');
      if (savedAdmin) {
        try {
          const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validate', token: savedAdmin }) });
          const d = await r.json();
          if (d.valid && d.email === 'admin') { handleAdminSuccess(savedAdmin); return; }
          localStorage.removeItem('c2gen_admin_token');
        } catch {}
      }
      const token = localStorage.getItem('c2gen_session_token');
      if (token) {
        try {
          const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validate', token }) });
          const d = await r.json();
          if (d.valid) { localStorage.setItem('c2gen_user_name', d.name); setIsAuthenticated(true); setUserName(d.name); return; }
          localStorage.removeItem('c2gen_session_token');
          localStorage.removeItem('c2gen_user_name');
        } catch {}
      }
    })();
  }, [handleAdminSuccess]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated, userName, isAdmin, adminToken, showAuthModal,
      setShowAuthModal, handleAuthSuccess, handleAdminSuccess,
      handleLogout, handleAdminLogout, setUserName,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
