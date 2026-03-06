import React, { useMemo } from 'react';
import type { Rarity } from '../types/gamification';

interface AvatarFrameProps {
  name: string;
  size: number;
  rarity?: Rarity | null;
  frameName?: string;
}

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

const AvatarFrame: React.FC<AvatarFrameProps> = ({ name, size, rarity, frameName }) => {
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }, [name]);

  const fontSize = Math.max(8, Math.round(size * 0.38));

  // 프레임 없음 — 기본 아바타만
  if (!rarity) {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          fontSize,
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}
      >
        {initials}
      </div>
    );
  }

  const color = RARITY_COLORS[rarity];
  const borderW = size >= 36 ? 2.5 : size >= 28 ? 2 : 1.5;
  const innerSize = size - borderW * 2;

  // 전설: conic-gradient 회전 테두리
  if (rarity === 'legendary') {
    const ringPad = borderW + 1;
    const outerSize = size + ringPad * 2;
    return (
      <div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: outerSize, height: outerSize }}
        title={frameName}
      >
        {/* 회전하는 conic-gradient 링 */}
        <div
          className="absolute inset-0 rounded-full frame-legendary-ring frame-animated"
          style={{
            background: `conic-gradient(from var(--frame-angle, 0deg), #ef4444, #f59e0b, #ec4899, #8b5cf6, #ef4444)`,
            animation: 'frame-legendary-spin 3s linear infinite',
            opacity: 0.7,
          }}
        />
        {/* 글로우 맥동 래퍼 */}
        <div
          className="absolute rounded-full frame-animated"
          style={{
            inset: ringPad - borderW,
            animation: 'frame-legendary-glow 2s ease-in-out infinite',
          }}
        />
        {/* 스파클 1 */}
        <div
          className="absolute frame-animated"
          style={{
            width: 4, height: 4, borderRadius: '50%',
            backgroundColor: '#fbbf24',
            top: 0, left: '50%', transform: 'translateX(-50%)',
            animation: 'frame-legendary-sparkle 2s ease-in-out infinite',
          }}
        />
        {/* 스파클 2 */}
        <div
          className="absolute frame-animated"
          style={{
            width: 3, height: 3, borderRadius: '50%',
            backgroundColor: '#ec4899',
            bottom: 1, right: 2,
            animation: 'frame-legendary-sparkle 2s ease-in-out infinite 0.7s',
          }}
        />
        {/* 스파클 3 */}
        <div
          className="absolute frame-animated"
          style={{
            width: 3, height: 3, borderRadius: '50%',
            backgroundColor: '#8b5cf6',
            bottom: 1, left: 2,
            animation: 'frame-legendary-sparkle 2s ease-in-out infinite 1.3s',
          }}
        />
        {/* 아바타 내부 */}
        <div
          className="relative rounded-full flex items-center justify-center z-10"
          style={{
            width: size,
            height: size,
            backgroundColor: 'var(--bg-elevated)',
            border: `${borderW}px solid transparent`,
            fontSize,
            fontWeight: 700,
            color: 'var(--text-muted)',
          }}
        >
          {initials}
        </div>
      </div>
    );
  }

  // 영웅: 금빛 글로우 + hue-rotate 맥동
  if (rarity === 'epic') {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated"
        style={{
          width: size,
          height: size,
          backgroundColor: 'var(--bg-elevated)',
          border: `${borderW}px solid ${color}`,
          animation: 'frame-epic-glow 3s ease-in-out infinite',
          fontSize,
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}
        title={frameName}
      >
        {initials}
      </div>
    );
  }

  // 희귀: 맥동하는 보라빛 글로우
  if (rarity === 'rare') {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated"
        style={{
          width: size,
          height: size,
          backgroundColor: 'var(--bg-elevated)',
          border: `${borderW}px solid ${color}`,
          animation: 'frame-rare-pulse 2s ease-in-out infinite',
          fontSize,
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}
        title={frameName}
      >
        {initials}
      </div>
    );
  }

  // 고급: 정적 글로우
  // 일반: 테두리만
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--bg-elevated)',
        border: `${rarity === 'uncommon' ? 2 : 1.5}px solid ${color}`,
        boxShadow: rarity === 'uncommon'
          ? `0 0 6px ${color}44, 0 0 12px ${color}22`
          : undefined,
        fontSize,
        fontWeight: 700,
        color: 'var(--text-muted)',
      }}
      title={frameName}
    >
      {initials}
    </div>
  );
};

export default AvatarFrame;
