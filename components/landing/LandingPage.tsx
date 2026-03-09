import React from 'react';
import LandingNav from './LandingNav';
import HeroSection from './HeroSection';
import WorkflowSection from './WorkflowSection';

interface LandingPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenAuth: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ isDark, onToggleTheme, onOpenAuth }) => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <LandingNav isDark={isDark} onToggleTheme={onToggleTheme} onOpenAuth={onOpenAuth} />
      <HeroSection onOpenAuth={onOpenAuth} />
      <WorkflowSection />
    </div>
  );
};

export default LandingPage;
