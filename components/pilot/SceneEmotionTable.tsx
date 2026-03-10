import React, { useMemo } from 'react';
import type { ScriptScene, EmotionCurve, EmotionType, SceneEmotionMeta } from '../../types';
import { applyEmotionToScenes } from '../../services/emotionCurveEngine';

const EMOTION_COLORS: Record<EmotionType, string> = {
  curiosity: '#06b6d4',
  tension: '#ef4444',
  surprise: '#f59e0b',
  empathy: '#8b5cf6',
  warmth: '#f97316',
  lingering: '#6b7280',
  excitement: '#22c55e',
  calm: '#3b82f6',
  fear: '#7c3aed',
};

const PACE_COLORS: Record<string, string> = {
  fast: '#22c55e',
  normal: '#3b82f6',
  slow: '#f97316',
};

interface Props {
  scenes: ScriptScene[];
  emotionCurve: EmotionCurve;
}

const SceneEmotionTable: React.FC<Props> = ({ scenes, emotionCurve }) => {
  const enrichedScenes = useMemo(
    () => applyEmotionToScenes(emotionCurve, scenes),
    [emotionCurve, scenes],
  );

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 13,
    verticalAlign: 'middle',
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    background: 'var(--bg-elevated)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-surface)' }}>
        <thead>
          <tr>
            <th style={headerStyle}>#</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Narration</th>
            <th style={headerStyle}>Emotion</th>
            <th style={headerStyle}>Intensity</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Visual Cue</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>BGM Shift</th>
            <th style={headerStyle}>TTS Pace</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Subtitle</th>
          </tr>
        </thead>
        <tbody>
          {enrichedScenes.map((scene, idx) => {
            const meta: SceneEmotionMeta | undefined = (scene as any).emotionMeta;
            const emotion = meta?.emotion || 'calm';
            const intensity = meta?.intensity || 0;
            const color = EMOTION_COLORS[emotion] || '#6b7280';
            const pace = meta?.tts_pace || 'normal';
            const paceColor = PACE_COLORS[pace] || '#3b82f6';

            return (
              <tr key={idx} style={{ transition: 'background 0.15s' }}>
                <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {scene.sceneNumber}
                </td>
                <td style={{ ...cellStyle, maxWidth: 260, color: 'var(--text-primary)' }}>
                  {scene.narration.length > 60
                    ? scene.narration.slice(0, 60) + '...'
                    : scene.narration}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fff',
                      background: color,
                    }}
                  >
                    {emotion}
                  </span>
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', minWidth: 100 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    <div
                      style={{
                        width: 60,
                        height: 6,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.round(intensity * 100)}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: color,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {Math.round(intensity * 100)}%
                    </span>
                  </div>
                </td>
                <td style={{ ...cellStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                  {meta?.visual_cue || '-'}
                </td>
                <td style={{ ...cellStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                  {meta?.bgm_shift || '-'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 500,
                      color: paceColor,
                      background: `${paceColor}18`,
                      border: `1px solid ${paceColor}40`,
                    }}
                  >
                    {pace}
                  </span>
                </td>
                <td style={{ ...cellStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                  {meta?.subtitle_style || '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SceneEmotionTable;
