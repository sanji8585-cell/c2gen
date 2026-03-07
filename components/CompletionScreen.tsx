import React from 'react';
import { useTranslation } from 'react-i18next';

interface CompletionScreenProps {
  cost: {
    images: number;
    tts: number;
    videos: number;
    total: number;
    imageCount: number;
    ttsCharacters: number;
    videoCount: number;
  };
  sceneCount: number;
  xpGained: number;
  combo: number;
  elapsedSeconds: number;
  questProgress?: { completed: number; total: number };
  gachaTickets?: number;
  onClose: () => void;
  onOpenThumbnail?: () => void;
}

export default function CompletionScreen({
  cost,
  sceneCount,
  xpGained,
  combo,
  elapsedSeconds,
  questProgress,
  gachaTickets,
  onOpenThumbnail,
  onClose,
}: CompletionScreenProps) {
  const imgCredits = cost.imageCount * 16;
  const ttsCredits = Math.ceil(cost.ttsCharacters / 1000) * 15;
  const videoCredits = cost.videoCount * 73;
  const scriptCredits = 5;
  const totalCredits = scriptCredits + imgCredits + ttsCredits + videoCredits;

  const creditsPerScene = sceneCount > 0 ? totalCredits / sceneCount : 999;
  const grade = creditsPerScene <= 15 ? 'SS' : creditsPerScene <= 22 ? 'S' : creditsPerScene <= 30 ? 'AA' : 'A';
  const { t } = useTranslation();
  const gradeColors: Record<string, { color: string; glow: string; label: string }> = {
    SS: { color: '#fbbf24', glow: '#fbbf2466', label: t('completion.gradeSS') },
    S: { color: '#f59e0b', glow: '#f59e0b44', label: t('completion.gradeS') },
    AA: { color: '#22c55e', glow: '#22c55e44', label: t('completion.gradeAA') },
    A: { color: '#60a5fa', glow: '#60a5fa44', label: t('completion.gradeA') },
  };
  const gi = gradeColors[grade];
  const gradeColor = gi.color;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = minutes > 0 ? `${minutes}${t('completion.minutes')} ${seconds}${t('completion.seconds')}` : `${seconds}${t('completion.seconds')}`;

  const rows = [
    { icon: '🎬', label: t('completion.scene'), count: `${sceneCount}${t('completion.unit.scenes')}`, credits: 0 },
    { icon: '🖼️', label: t('completion.image'), count: `${cost.imageCount}${t('completion.unit.images')}`, credits: imgCredits },
    { icon: '🎙️', label: t('completion.tts'), count: `${cost.ttsCharacters}${t('completion.unit.chars')}`, credits: ttsCredits },
    { icon: '🎥', label: t('completion.video'), count: `${cost.videoCount}${t('completion.unit.videos')}`, credits: videoCredits },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: '36px 40px 28px',
          minWidth: 380,
          maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(14,165,233,0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 배경 장식 */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* 타이틀 */}
        <div style={{
          textAlign: 'center',
          marginBottom: 24,
          animation: 'result-title-bounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}>
          <div style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 3,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ef4444)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            MISSION CLEAR
          </div>
        </div>

        {/* 생성 결과 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}>
            {t('completion.generationResult')}
          </div>

          {rows.map((row, i) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                opacity: 0,
                animation: `result-slide-in 0.4s ease-out ${0.3 + i * 0.12}s forwards`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{row.icon}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{row.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{row.count}</span>
                {row.credits > 0 && (
                  <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, minWidth: 70, textAlign: 'right' }}>
                    -{row.credits} {t('common.credits')}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* 구분선 */}
          <div style={{
            height: 1,
            background: 'var(--border-subtle)',
            margin: '10px 0',
          }} />

          {/* 총 크레딧 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 0',
            animation: 'result-total-pop 0.6s ease-out 1s both',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('completion.totalCredits')}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>
              -{totalCredits} {t('common.credits')}
            </span>
          </div>
        </div>

        {/* 획득 보상 */}
        <div style={{
          background: 'rgba(14,165,233,0.06)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}>
            {t('completion.rewards')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {xpGained > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#22c55e', fontWeight: 600 }}>
                <span>⚡</span>
                <span>+{xpGained} XP</span>
              </div>
            )}
            {(gachaTickets ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#a78bfa', fontWeight: 600 }}>
                <span>🎫</span>
                <span>+{gachaTickets} {t('completion.gachaTicket')}</span>
              </div>
            )}
            {questProgress && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#60a5fa', fontWeight: 600 }}>
                <span>📋</span>
                <span>{questProgress.completed}/{questProgress.total} {t('completion.questProgress')}</span>
              </div>
            )}
            {xpGained === 0 && !gachaTickets && !questProgress && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('completion.loginForRewards')}
              </div>
            )}
          </div>
        </div>

        {/* 스탯 행 + 등급 배지 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('completion.elapsed')}: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{timeStr}</span>
            </div>
            {combo >= 2 && (
              <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                🔥 {t('completion.combo', { count: combo })}
              </div>
            )}
          </div>

          {/* 등급 배지 (도장 효과) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: grade === 'SS' ? 24 : 28,
              fontWeight: 900,
              color: gradeColor,
              border: `3px solid ${gradeColor}`,
              boxShadow: `0 0 20px ${gi.glow}, 0 0 40px ${gi.glow}, inset 0 0 12px ${gi.glow}`,
              opacity: 0,
              animation: 'result-stamp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards',
              fontFamily: 'system-ui, sans-serif',
              letterSpacing: grade === 'SS' ? -1 : 0,
              background: `linear-gradient(135deg, ${gradeColor}11, ${gradeColor}08)`,
              transform: 'rotate(-3deg)',
            }}>
              {grade}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: gradeColor, opacity: 0, animation: 'result-slide-in 0.4s ease-out 2s forwards' }}>
              {gi.label}
            </span>
          </div>
        </div>

        {/* 썸네일 제작 버튼 */}
        {onOpenThumbnail && (
          <button
            onClick={() => { onClose(); onOpenThumbnail(); }}
            style={{
              width: '100%',
              padding: '11px 0',
              borderRadius: 12,
              border: '1px solid rgba(168,85,247,0.4)',
              background: 'rgba(168,85,247,0.1)',
              color: '#c084fc',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'transform 0.15s, background 0.15s',
              marginBottom: 8,
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = 'rgba(168,85,247,0.2)';
              (e.target as HTMLElement).style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'rgba(168,85,247,0.1)';
              (e.target as HTMLElement).style.transform = 'scale(1)';
            }}
          >
            🎨 {t('thumbnailButton')}
          </button>
        )}

        {/* 확인 버튼 */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
            boxShadow: '0 4px 14px rgba(14,165,233,0.3)',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.transform = 'scale(1.03)';
            (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(14,165,233,0.4)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.transform = 'scale(1)';
            (e.target as HTMLElement).style.boxShadow = '0 4px 14px rgba(14,165,233,0.3)';
          }}
        >
          {t('common.confirm')}
        </button>
      </div>
    </div>
  );
}
