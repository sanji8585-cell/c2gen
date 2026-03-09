import React from 'react';

interface LandingPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenAuth: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ isDark, onToggleTheme, onOpenAuth }) => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <h1 className="text-4xl font-bold text-center pt-20">C2GEN Landing (WIP)</h1>
      <button onClick={onOpenAuth} className="block mx-auto mt-8 px-6 py-3 bg-brand-500 text-white rounded-lg">
        무료로 시작하기
      </button>
    </div>
  );
};

export default LandingPage;
