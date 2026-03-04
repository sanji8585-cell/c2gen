
import React from 'react';

const FourLeafClover: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* 상단 잎 */}
    <path d="M50 12C50 12 38 20 38 32C38 40 43 46 50 48C57 46 62 40 62 32C62 20 50 12 50 12Z" fill="url(#leaf1)" />
    {/* 우측 잎 */}
    <path d="M88 50C88 50 80 38 68 38C60 38 54 43 52 50C54 57 60 62 68 62C80 62 88 50 88 50Z" fill="url(#leaf2)" />
    {/* 하단 잎 */}
    <path d="M50 88C50 88 62 80 62 68C62 60 57 54 50 52C43 54 38 60 38 68C38 80 50 88 50 88Z" fill="url(#leaf3)" />
    {/* 좌측 잎 */}
    <path d="M12 50C12 50 20 62 32 62C40 62 46 57 48 50C46 43 40 38 32 38C20 38 12 50 12 50Z" fill="url(#leaf4)" />
    {/* 중심 원 */}
    <circle cx="50" cy="50" r="5" fill="#fbbf24" />
    {/* 줄기 */}
    <path d="M50 55C50 55 52 70 56 80" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="leaf1" x1="50" y1="12" x2="50" y2="48">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf2" x1="88" y1="50" x2="52" y2="50">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf3" x1="50" y1="88" x2="50" y2="52">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leaf4" x1="12" y1="50" x2="48" y2="50">
        <stop stopColor="#4ade80" />
        <stop offset="1" stopColor="#16a34a" />
      </linearGradient>
    </defs>
  </svg>
);

const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-green-900/60 to-emerald-900/60 rounded-xl flex items-center justify-center shadow-lg shadow-green-900/30 border border-green-700/30">
            <FourLeafClover className="w-7 h-7" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-green-300 via-emerald-200 to-white">
              C2
            </span>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              GEN
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            AI Content Studio
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
