import React, { useState, useMemo, useCallback } from 'react';
import type { ScriptScene, StoryArcType, PlatformVariant, EmotionCurve } from '../../types';
import {
  STORY_ARCS,
  selectStoryArc,
  generateEmotionCurve,
} from '../../services/emotionCurveEngine';
import EmotionCurveEditor from '../EmotionCurveEditor';
import SceneEmotionTable from './SceneEmotionTable';
import AudioTagsPreview from './AudioTagsPreview';
import MetadataPreview from './MetadataPreview';
import PlatformComparison from './PlatformComparison';

// ── Tab definitions ──
const TABS = [
  { id: 1, label: '입력', icon: '1' },
  { id: 2, label: '스토리 아크', icon: '2' },
  { id: 3, label: '감정곡선', icon: '3' },
  { id: 4, label: '씬 매핑', icon: '4' },
  { id: 5, label: '오디오 태그', icon: '5' },
  { id: 6, label: '메타데이터', icon: '6' },
  { id: 7, label: '플랫폼 비교', icon: '7' },
] as const;

const ARC_KEYS = Object.keys(STORY_ARCS) as StoryArcType[];

const PLATFORM_OPTIONS: { id: PlatformVariant; label: string }[] = [
  { id: 'youtube_shorts', label: 'YT Shorts' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube_long', label: 'YouTube Long' },
];

const EMOTION_COLORS: Record<string, string> = {
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

const ContentEngineTest: React.FC = () => {
  // ── State ──
  const [topic, setTopic] = useState('');
  const [rawSceneText, setRawSceneText] = useState('');
  const [scenes, setScenes] = useState<ScriptScene[]>([]);
  const [selectedArc, setSelectedArc] = useState<StoryArcType>('problem_solution');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformVariant>('youtube_shorts');
  const [emotionCurve, setEmotionCurve] = useState<EmotionCurve | null>(null);
  const [imperfectionLevel, setImperfectionLevel] = useState(0.3);
  const [activeTab, setActiveTab] = useState(1);

  const hasScenes = scenes.length > 0;
  const totalDuration = scenes.length * 8;

  // ── Recommended arc ──
  const recommendedArc = useMemo(() => {
    if (!topic.trim()) return 'problem_solution' as StoryArcType;
    return selectStoryArc(topic);
  }, [topic]);

  // ── Parse scenes ──
  const handleParse = useCallback(() => {
    const lines = rawSceneText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const parsed: ScriptScene[] = lines.map((line, idx) => ({
      sceneNumber: idx + 1,
      narration: line,
      visualPrompt: `Scene ${idx + 1} visual`,
    }));

    setScenes(parsed);

    // Auto-detect arc
    const detected = selectStoryArc(topic || lines[0]);
    setSelectedArc(detected);

    // Auto-advance to tab 2
    setActiveTab(2);
  }, [rawSceneText, topic]);

  // ── Generate curve ──
  const handleGenerateCurve = useCallback(() => {
    const curve = generateEmotionCurve(selectedArc, selectedPlatform, totalDuration);
    setEmotionCurve(curve);
    setActiveTab(3);
  }, [selectedArc, selectedPlatform, totalDuration]);

  // ── Curve change handler ──
  const handleCurveChange = useCallback((curve: EmotionCurve) => {
    setEmotionCurve(curve);
  }, []);

  // ── Styles ──
  const containerStyle: React.CSSProperties = {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 20px',
    fontFamily: 'inherit',
  };

  const headerStyle: React.CSSProperties = {
    marginBottom: 24,
  };

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    padding: '6px',
    borderRadius: 12,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    marginBottom: 24,
    overflowX: 'auto',
  };

  const panelStyle: React.CSSProperties = {
    minHeight: 300,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: '10px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    background: '#06b6d4',
    color: '#000',
    cursor: 'pointer',
  };

  const disabledBtnStyle: React.CSSProperties = {
    ...primaryBtnStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
  };

  // ── Render tab content ──
  const renderTabContent = () => {
    switch (activeTab) {
      // ── Tab 1: Input ──
      case 1:
        return (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. AI 투자 방법, 다이어트 팁, 주식 시장 전망..."
                style={inputStyle}
              />
              {topic.trim() && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  Recommended arc:{' '}
                  <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                    {STORY_ARCS[recommendedArc].nameKo}
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Scene Narrations (one per line)
              </label>
              <textarea
                value={rawSceneText}
                onChange={(e) => setRawSceneText(e.target.value)}
                placeholder={
                  '요즘 AI 투자가 화제입니다.\n' +
                  '하지만 대부분의 사람들은 어디서부터 시작해야 할지 모릅니다.\n' +
                  '전문가들이 추천하는 3가지 방법을 알려드립니다.\n' +
                  '첫 번째, ETF를 활용한 분산 투자입니다.\n' +
                  '두 번째, AI 관련 핵심 기업에 직접 투자합니다.\n' +
                  '세 번째, 로보어드바이저를 활용합니다.\n' +
                  '지금 바로 시작해보세요!'
                }
                rows={8}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                {rawSceneText.split('\n').filter((l) => l.trim()).length} lines detected
              </div>
            </div>

            <button
              onClick={handleParse}
              disabled={!rawSceneText.trim()}
              style={rawSceneText.trim() ? primaryBtnStyle : disabledBtnStyle}
            >
              Parse Scenes
            </button>

            {/* Parsed scenes preview */}
            {scenes.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                  Parsed Scenes ({scenes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {scenes.map((s) => (
                    <div
                      key={s.sceneNumber}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        gap: 10,
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#06b6d4', minWidth: 20 }}>
                        {s.sceneNumber}
                      </span>
                      <span>{s.narration}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // ── Tab 2: Story Arc ──
      case 2:
        return (
          <div>
            {/* Arc cards grid */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              Select Story Arc
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230, 1fr))',
                gap: 10,
                marginBottom: 20,
              }}
            >
              {ARC_KEYS.map((arc) => {
                const def = STORY_ARCS[arc];
                const isSelected = selectedArc === arc;
                const isRecommended = recommendedArc === arc;
                return (
                  <div
                    key={arc}
                    onClick={() => setSelectedArc(arc)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(6,182,212,0.1)' : 'var(--bg-elevated)',
                      border: isSelected
                        ? '2px solid #06b6d4'
                        : isRecommended
                          ? '2px solid rgba(6,182,212,0.3)'
                          : '1px solid var(--border-subtle)',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    {isRecommended && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -8,
                          right: 10,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 9,
                          fontWeight: 700,
                          background: '#06b6d4',
                          color: '#000',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Recommended
                      </span>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? '#06b6d4' : 'var(--text-primary)', marginBottom: 4 }}>
                      {def.nameKo}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      {def.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {def.structure}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {def.suitableFor}
                    </div>
                    {/* Default points preview */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {def.defaultPoints.map((pt, i) => (
                        <span
                          key={i}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 6,
                            fontSize: 9,
                            fontWeight: 500,
                            color: EMOTION_COLORS[pt.emotion] || '#6b7280',
                            background: `${EMOTION_COLORS[pt.emotion] || '#6b7280'}15`,
                          }}
                        >
                          {pt.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Platform selection */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
              Select Platform
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: selectedPlatform === p.id ? '#06b6d4' : 'var(--bg-elevated)',
                    color: selectedPlatform === p.id ? '#000' : 'var(--text-secondary)',
                    border: selectedPlatform === p.id ? 'none' : '1px solid var(--border-subtle)',
                    transition: 'all 0.2s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Confirm button */}
            <button onClick={handleGenerateCurve} style={primaryBtnStyle}>
              Generate Emotion Curve
            </button>
          </div>
        );

      // ── Tab 3: Emotion Curve ──
      case 3:
        if (!emotionCurve) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No emotion curve generated yet. Go to Tab 2 and click "Generate Emotion Curve".
            </div>
          );
        }
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              Emotion Curve Editor
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
                Drag points to adjust intensity. Double-click to add. Right-click to remove.
              </span>
            </div>
            <EmotionCurveEditor
              curve={emotionCurve}
              onChange={handleCurveChange}
              totalDuration={totalDuration}
            />
            {/* Curve points summary */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {emotionCurve.curve_points.map((pt, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${EMOTION_COLORS[pt.emotion] || '#6b7280'}40`,
                    fontSize: 11,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, color: EMOTION_COLORS[pt.emotion] || '#6b7280' }}>
                    {pt.label}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {pt.time_seconds.toFixed(1)}s | {Math.round(pt.intensity * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      // ── Tab 4: Scene Mapping ──
      case 4:
        if (!emotionCurve) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Generate an emotion curve first (Tab 2 + 3).
            </div>
          );
        }
        return <SceneEmotionTable scenes={scenes} emotionCurve={emotionCurve} />;

      // ── Tab 5: Audio Tags ──
      case 5:
        if (!emotionCurve) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Generate an emotion curve first (Tab 2 + 3).
            </div>
          );
        }
        return (
          <AudioTagsPreview
            scenes={scenes}
            emotionCurve={emotionCurve}
            imperfectionLevel={imperfectionLevel}
            onImperfectionChange={setImperfectionLevel}
          />
        );

      // ── Tab 6: Metadata ──
      case 6:
        return (
          <MetadataPreview
            topic={topic || 'Untitled Topic'}
            scenes={scenes}
            emotionCurve={emotionCurve}
          />
        );

      // ── Tab 7: Platform Comparison ──
      case 7:
        return <PlatformComparison scenes={scenes} selectedArc={selectedArc} />;

      default:
        return null;
    }
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Content Engine Test
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Phase 2 engine validation — emotion curves, audio tags, metadata, platform adaptation
        </p>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {TABS.map((tab) => {
          const enabled = tab.id === 1 || hasScenes;
          return (
            <button
              key={tab.id}
              onClick={() => enabled && setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: enabled ? 'pointer' : 'not-allowed',
                background: activeTab === tab.id ? '#06b6d4' : 'transparent',
                color: activeTab === tab.id
                  ? '#000'
                  : enabled
                    ? 'var(--text-secondary)'
                    : 'var(--text-muted)',
                opacity: enabled ? 1 : 0.4,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  background: activeTab === tab.id ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)',
                  color: activeTab === tab.id ? '#000' : 'var(--text-muted)',
                }}
              >
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Status bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          padding: '8px 14px',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          fontSize: 11,
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          Scenes: <strong style={{ color: hasScenes ? '#22c55e' : 'var(--text-muted)' }}>{scenes.length}</strong>
        </span>
        <span>
          Arc: <strong style={{ color: '#06b6d4' }}>{STORY_ARCS[selectedArc].nameKo}</strong>
        </span>
        <span>
          Platform: <strong style={{ color: 'var(--text-primary)' }}>
            {PLATFORM_OPTIONS.find((p) => p.id === selectedPlatform)?.label}
          </strong>
        </span>
        <span>
          Duration: <strong style={{ color: 'var(--text-primary)' }}>{totalDuration}s</strong>
        </span>
        <span>
          Curve: <strong style={{ color: emotionCurve ? '#22c55e' : '#ef4444' }}>
            {emotionCurve ? 'Ready' : 'Not generated'}
          </strong>
        </span>
        <span>
          Imperfection: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(imperfectionLevel * 100)}%</strong>
        </span>
      </div>

      {/* Tab content */}
      <div style={panelStyle}>{renderTabContent()}</div>
    </div>
  );
};

export default ContentEngineTest;
