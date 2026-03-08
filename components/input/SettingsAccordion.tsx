import React, { useState } from 'react';

interface SettingsAccordionProps {
  icon: string;              // emoji icon
  iconGradient: string;      // CSS gradient string for icon bg
  title: string;
  summary: React.ReactNode;  // collapsed state 2-line summary JSX
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SettingsAccordion: React.FC<SettingsAccordionProps> = ({
  icon,
  iconGradient,
  title,
  summary,
  isOpen,
  onToggle,
  children,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        borderRadius: 16,
        border: isOpen
          ? '1px solid rgba(96, 165, 250, 0.3)'
          : '1px solid var(--border-default)',
        boxShadow: isOpen
          ? '0 0 15px rgba(96, 165, 250, 0.08), 0 2px 8px rgba(0,0,0,0.15)'
          : 'none',
        background: 'var(--bg-surface)',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '18px 22px',
          cursor: 'pointer',
          background: isHovered ? 'rgba(30, 40, 70, 0.4)' : 'transparent',
          transition: 'background 0.2s ease',
          userSelect: 'none',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: iconGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>

        {/* Title + Summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
            }}
          >
            {title}
          </div>
          {!isOpen && summary && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.8,
                color: 'var(--text-secondary)',
                marginTop: 2,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {summary}
            </div>
          )}
        </div>

        {/* Chevron */}
        <div
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'transform 0.3s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--text-muted)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 5L7 9L11 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          maxHeight: isOpen ? 2000 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.4s ease',
        }}
      >
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '18px 22px',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsAccordion;
