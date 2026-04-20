import React from 'react';

type ViewMode = 'main' | 'gallery' | 'playground' | 'pilot' | 'deepscript';

interface MobileNavProps {
  activeView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  galleryCount?: number;
}

const NAV_ITEMS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'main', icon: '🎬', label: '생성' },
  { id: 'gallery', icon: '📁', label: '갤러리' },
  { id: 'playground', icon: '🎮', label: '놀이터' },
];

export default function MobileNav({ activeView, onChangeView, galleryCount }: MobileNavProps) {
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-[9980] border-t flex items-stretch"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
      {NAV_ITEMS.map(item => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-2 transition-all"
            style={{
              color: isActive ? '#3b82f6' : 'var(--text-muted)',
              backgroundColor: isActive ? 'rgba(59,130,246,0.06)' : 'transparent',
            }}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] font-bold mt-0.5" style={{ position: 'relative' }}>
              {item.label}
              {item.id === 'gallery' && galleryCount != null && galleryCount > 0 && (
                <span className="absolute -top-3 -right-4 text-[8px] font-bold px-1 py-0.5 rounded-full leading-none"
                  style={{ backgroundColor: '#3b82f6', color: '#fff', minWidth: 14, textAlign: 'center' }}>
                  {galleryCount}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
