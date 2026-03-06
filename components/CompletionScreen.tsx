import React from 'react';

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
}

export default function CompletionScreen({
  cost,
  sceneCount,
  xpGained,
  combo,
  elapsedSeconds,
  questProgress,
  gachaTickets,
  onClose,
}: CompletionScreenProps) {
  const imgCredits = cost.imageCount * 16;
  const ttsCredits = Math.ceil(cost.ttsCharacters / 1000) * 15;
  const videoCredits = cost.videoCount * 73;
  const scriptCredits = 5;
  const totalCredits = scriptCredits + imgCredits + ttsCredits + videoCredits;

  const creditsPerScene = sceneCount > 0 ? totalCredits / sceneCount : 999;
  const grade = creditsPerScene <= 8 ? 'S' : creditsPerScene <= 12 ? 'A' : creditsPerScene <= 18 ? 'B' : 'C';
  const gradeColors: Record<string, string> = {
    S: '#fbbf24',
    A: '#22c55e',
    B: '#60a5fa',
    C: '#94a3b8',
  };
  const gradeColor = gradeColors[grade];

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

  const rows = [
    { icon: '🎬', label: '씬', count: `${sceneCount}개`, credits: 0 },
    { icon: '🖼️', label: '이미지', count: `${cost.imageCount}장`, credits: imgCredits },
    { icon: '🎙️', label: 'TTS', count: `${cost.ttsCharacters}자`, credits: ttsCredits },
    { icon: '🎥', label: '영상', count: `${cost.videoCount}개`, credits: videoCredits },
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
            생성 결과
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
                  <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                    -{row.credits} cr
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
              총 크레딧
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>
              -{totalCredits} cr
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
            획득 보상
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
                <span>+{gachaTickets} 뽑기 티켓</span>
              </div>
            )}
            {questProgress && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#60a5fa', fontWeight: 600 }}>
                <span>📋</span>
                <span>{questProgress.completed}/{questProgress.total} 퀘스트 진행</span>
              </div>
            )}
            {xpGained === 0 && !gachaTickets && !questProgress && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                로그인하면 보상을 받을 수 있어요!
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
              소요 시간: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{timeStr}</span>
            </div>
            {combo >= 2 && (
              <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                🔥 {combo}연속 생성!
              </div>
            )}
          </div>

          {/* 등급 배지 */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 900,
            color: gradeColor,
            border: `3px solid ${gradeColor}`,
            boxShadow: `0 0 16px ${gradeColor}44, 0 0 32px ${gradeColor}22`,
            opacity: 0,
            animation: 'result-stamp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards',
            fontFamily: 'system-ui, sans-serif',
          }}>
            {grade}
          </div>
        </div>

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
          확인
        </button>
      </div>
    </div>
  );
}
