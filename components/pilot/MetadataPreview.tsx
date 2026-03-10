import React, { useMemo, useCallback } from 'react';
import type { ScriptScene, EmotionCurve } from '../../types';
import { generateMetadata } from '../../services/metadataEngine';

interface Props {
  topic: string;
  scenes: ScriptScene[];
  emotionCurve: EmotionCurve | null;
}

const PATTERN_LABELS: Record<string, string> = {
  question: '질문형',
  number: '숫자형',
  reversal: '반전형',
  direct: '직설형',
  emotional: '감성형',
};

const MetadataPreview: React.FC<Props> = ({ topic, scenes, emotionCurve }) => {
  const metadata = useMemo(
    () => generateMetadata(topic, scenes, emotionCurve),
    [topic, scenes, emotionCurve],
  );

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const copyBtnStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 600,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  };

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 500,
    color,
    background: `${color}15`,
    border: `1px solid ${color}30`,
    marginRight: 6,
    marginBottom: 6,
  });

  const cardBase: React.CSSProperties = {
    borderRadius: 12,
    border: '1px solid var(--border-subtle)',
    overflow: 'hidden',
    background: 'var(--bg-surface)',
    flex: 1,
    minWidth: 280,
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {/* YouTube Card */}
      <div style={cardBase}>
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '2px solid rgba(239,68,68,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>&#9654;</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>YouTube</span>
        </div>

        <div style={{ padding: 16 }}>
          {/* Titles */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Title Variants
            </div>
            {metadata.youtube.titles.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 6,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {t.text}
                  </span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      color: '#ef4444',
                      fontWeight: 500,
                      opacity: 0.7,
                    }}
                  >
                    [{PATTERN_LABELS[t.pattern] || t.pattern}]
                  </span>
                </div>
                <button style={copyBtnStyle} onClick={() => copyToClipboard(t.text)}>
                  Copy
                </button>
              </div>
            ))}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Description
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                maxHeight: 100,
                overflow: 'hidden',
              }}
            >
              {metadata.youtube.description}
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tags
              </span>
              <button
                style={copyBtnStyle}
                onClick={() => copyToClipboard(metadata.youtube.tags.join(', '))}
              >
                Copy All
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {metadata.youtube.tags.map((tag, i) => (
                <span key={i} style={chipStyle('#ef4444')}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Thumbnail text */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Thumbnail Text
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text-primary)',
                textAlign: 'center',
              }}
            >
              {metadata.youtube.thumbnail_text}
            </div>
          </div>
        </div>
      </div>

      {/* TikTok Card */}
      <div style={cardBase}>
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(236,72,153,0.08)',
            borderBottom: '2px solid rgba(236,72,153,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800 }}>T</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#ec4899' }}>TikTok</span>
        </div>

        <div style={{ padding: 16 }}>
          {/* Caption */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Caption
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                fontSize: 13,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
              }}
            >
              {metadata.tiktok.caption}
            </div>
          </div>

          {/* Hashtags */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Hashtags
              </span>
              <button
                style={copyBtnStyle}
                onClick={() => copyToClipboard(metadata.tiktok.hashtags.join(' '))}
              >
                Copy All
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {metadata.tiktok.hashtags.map((tag, i) => (
                <span key={i} style={chipStyle('#ec4899')}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Comment Bait */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Comment Bait
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(236,72,153,0.06)',
                border: '1px solid rgba(236,72,153,0.2)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
                textAlign: 'center',
              }}
            >
              {metadata.tiktok.comment_bait}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetadataPreview;
