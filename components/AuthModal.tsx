import React, { useEffect } from 'react';
import AuthGate from './AuthGate';

interface AuthModalProps {
  onSuccess: (name: string) => void;
  onAdminSuccess: (token: string) => void;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onAdminSuccess, onClose }) => {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        <AuthGate
          onSuccess={onSuccess}
          onAdminSuccess={onAdminSuccess}
          mode="modal"
          onClose={onClose}
          skipAutoValidation
        />
      </div>
    </div>
  );
};

export default AuthModal;
