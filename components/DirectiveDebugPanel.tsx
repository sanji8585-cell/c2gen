import React, { useState } from 'react';
import { GeneratedAsset, SceneDirectives } from '../types';
import { getFinalVisualPrompt } from '../services/prompts';

const DIRECTIVE_ICONS: Record<string, string> = {
  COMPOSITION: '📐', MOOD: '🎨', BACKGROUND: '🏞️', STYLE: '🖌️',
  TEXT: '📝', CAMERA: '📷', COLOR: '🎨', SPEAKER: '🎙️',
  KEEP_PREV: '🔗', SAME_PLACE: '📍', TIME_PASS: '⏰',
};

interface DirectiveDebugPanelProps {
  assets: GeneratedAsset[];
  artStylePrompt?: string;
  suppressKorean?: boolean;
}

const DirectiveDebugPanel: React.FC<DirectiveDebugPanelProps> = ({ assets, artStylePrompt, suppressKorean: suppressKoreanProp }) => {
  const [isOpen, setIsOpen] = useState(false);
  // suppressKorean: props 우선, 없으면 localStorage에서 읽기
  const suppressKorean = suppressKoreanProp ?? (localStorage.getItem('tubegen_suppress_korean') === 'true');
  const [expandedScene, setExpandedScene] = useState<number | null>(null);

  const scenesWithDirectives = assets.filter(a => a.analysis?.directives && Object.keys(a.analysis.directives).length > 0);
  if (scenesWithDirectives.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      {/* Toggle button */}
      <button onClick={() => setIsOpen(!isOpen)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        borderRadius: 8, border: '1px solid var(--border-default)',
        background: isOpen ? 'rgba(96,165,250,0.08)' : 'var(--bg-elevated)',
        color: isOpen ? '#60a5fa' : 'var(--text-secondary)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
      }}>
        🔍 디렉티브 검증 패널 {isOpen ? '▲' : '▼'}
        <span style={{ background: '#60a5fa', color: '#fff', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
          {scenesWithDirectives.length}
        </span>
      </button>

      {isOpen && (
        <div style={{ marginTop: 8, borderRadius: 10, border: '1px solid var(--border-default)', overflow: 'hidden' }}>
          {assets.map((asset, idx) => {
            const directives = asset.analysis?.directives;
            if (!directives || Object.keys(directives).length === 0) return null;
            const isExpanded = expandedScene === idx;

            return (
              <div key={idx} style={{ borderBottom: '1px solid var(--border-default)' }}>
                {/* Scene header */}
                <div onClick={() => setExpandedScene(isExpanded ? null : idx)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  background: 'var(--bg-elevated)', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 50 }}>
                    씬 {asset.sceneNumber}
                  </span>
                  <span style={{ fontSize: 11, color: '#34d399', fontWeight: 500 }}>✅ 파싱 완료</span>
                  <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Object.entries(directives).map(([key, val]) => (
                      <span key={key} style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                        background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
                      }}>
                        {DIRECTIVE_ICONS[key] || '⚙️'} {key}{typeof val === 'string' ? `: ${val}` : ''}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', fontSize: 12 }}>
                    {/* Narration */}
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>정제된 나레이션:</span>
                      <div style={{ marginTop: 4, padding: 8, borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                        {asset.narration}
                      </div>
                    </div>

                    {/* Directives detail */}
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>파싱된 디렉티브:</span>
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(directives).map(([key, val]) => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: 'var(--bg-elevated)' }}>
                            <span style={{ fontSize: 14 }}>{DIRECTIVE_ICONS[key] || '⚙️'}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 80 }}>{key}</span>
                            <span style={{ color: '#60a5fa' }}>{typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Prompt comparison */}
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>디렉티브 적용 프롬프트:</span>
                      <div style={{ marginTop: 4, padding: 8, borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto' }}>
                        {getFinalVisualPrompt(asset, false, artStylePrompt, suppressKorean, directives)}
                      </div>
                    </div>

                    {/* Speaker info */}
                    {asset.speakerName && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: asset.speakerColor || '#888' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>화자: {asset.speakerName}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DirectiveDebugPanel;
