import React, { useState, useMemo } from 'react';
import type { ScriptScene, EmotionCurve, SceneEmotionMeta } from '../../types';
import { applyEmotionToScenes } from '../../services/emotionCurveEngine';
import { processNarrationForTTS, getEmotionTtsPace } from '../../services/audioTagsService';

interface Props {
  scenes: ScriptScene[];
  emotionCurve: EmotionCurve;
  imperfectionLevel: number;
  onImperfectionChange: (level: number) => void;
}

function highlightTags(text: string): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part, i) =>
    /^\[.+\]$/.test(part) ? (
      <span key={i} style={{ color: '#06b6d4', fontWeight: 600 }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const AudioTagsPreview: React.FC<Props> = ({
  scenes,
  emotionCurve,
  imperfectionLevel,
  onImperfectionChange,
}) => {
  const [regenerateKey, setRegenerateKey] = useState(0);

  const enrichedScenes = useMemo(
    () => applyEmotionToScenes(emotionCurve, scenes),
    [emotionCurve, scenes],
  );

  const processedItems = useMemo(() => {
    // regenerateKey dependency forces re-roll of random imperfections
    void regenerateKey;
    return enrichedScenes.map((scene) => {
      const meta: SceneEmotionMeta | undefined = (scene as any).emotionMeta;
      const processed = processNarrationForTTS(scene.narration, meta, imperfectionLevel);
      const pace = getEmotionTtsPace(meta);
      return { original: scene.narration, processed, pace, emotion: meta?.emotion || 'calm', sceneNumber: scene.sceneNumber };
    });
  }, [enrichedScenes, imperfectionLevel, regenerateKey]);

  const cardStyle: React.CSSProperties = {
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
    overflow: 'hidden',
    marginBottom: 12,
    background: 'var(--bg-surface)',
  };

  const halfStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.6,
    flex: 1,
    minWidth: 0,
  };

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
          padding: '14px 18px',
          borderRadius: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          Imperfection Level
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={imperfectionLevel}
          onChange={(e) => onImperfectionChange(parseFloat(e.target.value))}
          style={{ flex: 1, minWidth: 120, accentColor: '#06b6d4' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
          {Math.round(imperfectionLevel * 100)}%
        </span>
        <button
          onClick={() => setRegenerateKey((k) => k + 1)}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid #06b6d4',
            background: 'rgba(6,182,212,0.1)',
            color: '#06b6d4',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          다시 생성
        </button>
      </div>

      {/* Scene cards */}
      {processedItems.map((item) => (
        <div key={`${item.sceneNumber}-${regenerateKey}`} style={cardStyle}>
          <div
            style={{
              padding: '8px 14px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              Scene {item.sceneNumber}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              TTS Pace: {item.pace.toFixed(2)}x
            </span>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            <div style={{ ...halfStyle, background: 'rgba(255,255,255,0.02)', borderRight: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Original
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>{item.original}</div>
            </div>
            <div style={halfStyle}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#06b6d4', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Processed
              </div>
              <div style={{ color: 'var(--text-primary)' }}>{highlightTags(item.processed)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AudioTagsPreview;
