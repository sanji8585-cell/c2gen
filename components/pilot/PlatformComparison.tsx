import React, { useMemo, useState } from 'react';
import type { ScriptScene, StoryArcType, PlatformVariant } from '../../types';
import { adaptForPlatform, type PlatformAdaptedContent } from '../../services/platformAdapterService';
import EmotionCurveEditor from '../EmotionCurveEditor';

interface Props {
  scenes: ScriptScene[];
  selectedArc: StoryArcType;
}

const PLATFORM_ACCENT: Record<PlatformVariant, string> = {
  youtube_shorts: '#ef4444',
  tiktok: '#ec4899',
  youtube_long: '#3b82f6',
};

const PlatformComparison: React.FC<Props> = ({ scenes, selectedArc }) => {
  const adaptedPlatforms = useMemo(() => {
    const platforms: PlatformVariant[] = ['youtube_shorts', 'tiktok', 'youtube_long'];
    return platforms.map((p) => adaptForPlatform(scenes, p, selectedArc));
  }, [scenes, selectedArc]);

  // Dummy onChange for readOnly editors — never called
  const noop = useMemo(() => () => {}, []);

  const columnStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 260,
    borderRadius: 12,
    border: '1px solid var(--border-subtle)',
    overflow: 'hidden',
    background: 'var(--bg-surface)',
  };

  const statRow = (label: string, value: string | number): React.ReactNode => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {adaptedPlatforms.map((adapted) => {
        const accent = PLATFORM_ACCENT[adapted.platform];
        const keptIndices = new Set(adapted.scenes.map((s) => s.sceneNumber));
        const droppedCount = scenes.length - adapted.scenes.length;

        return (
          <div key={adapted.platform} style={columnStyle}>
            {/* Header */}
            <div
              style={{
                padding: '12px 16px',
                background: `${accent}10`,
                borderBottom: `2px solid ${accent}50`,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>
                {adapted.config.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {adapted.config.subtitleStyle === 'fullscreen_big' ? 'Fullscreen Big' : 'Center Bottom'} subtitles
              </div>
            </div>

            <div style={{ padding: 14 }}>
              {/* Stats */}
              <div style={{ marginBottom: 14 }}>
                {statRow('Duration Range', `${adapted.config.durationRange[0]}s - ${adapted.config.durationRange[1]}s`)}
                {statRow('Scene Count', `${adapted.scenes.length} / ${scenes.length}`)}
                {statRow('Total Duration', `${adapted.totalDuration}s`)}
                {statRow('Hook Duration', `${adapted.config.hookDuration}s`)}
                {statRow('CTA Duration', `${adapted.config.ctaDuration}s`)}
                {statRow('BGM Strategy', adapted.config.bgmStrategy === 'emotion_curve' ? 'Emotion Curve' : 'Trending Sound')}
                {statRow('Thumbnail', adapted.config.thumbnailNeeded ? 'Required' : 'Not needed')}
              </div>

              {/* Emotion Curve (mini) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Emotion Curve
                </div>
                <div style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
                  <EmotionCurveEditor
                    curve={adapted.emotionCurve}
                    onChange={noop}
                    totalDuration={adapted.totalDuration}
                    readOnly
                  />
                </div>
              </div>

              {/* Hook scene preview */}
              {adapted.hookScene && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Hook Scene
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: `${accent}08`,
                      border: `1px solid ${accent}25`,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {adapted.hookScene.narration.length > 80
                      ? adapted.hookScene.narration.slice(0, 80) + '...'
                      : adapted.hookScene.narration}
                  </div>
                </div>
              )}

              {/* Scene keep/drop indicator */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Scenes ({droppedCount > 0 ? `${droppedCount} dropped` : 'All kept'})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {scenes.map((s) => {
                    const kept = keptIndices.has(s.sceneNumber);
                    return (
                      <span
                        key={s.sceneNumber}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: kept ? `${accent}20` : 'rgba(255,255,255,0.04)',
                          color: kept ? accent : 'var(--text-muted)',
                          border: kept ? `1px solid ${accent}40` : '1px solid var(--border-subtle)',
                          opacity: kept ? 1 : 0.4,
                          textDecoration: kept ? 'none' : 'line-through',
                        }}
                      >
                        {s.sceneNumber}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlatformComparison;
