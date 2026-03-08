import React, { useState, useCallback, useRef, useMemo } from 'react';
import type { EmotionCurve, EmotionCurvePoint, StoryArcType, PlatformVariant } from '../types';
import { STORY_ARCS, generateEmotionCurve } from '../services/emotionCurveEngine';

// ── Constants ──
const EMOTION_COLORS: Record<string, string> = {
  curiosity:  '#06b6d4',
  tension:    '#ef4444',
  surprise:   '#f59e0b',
  empathy:    '#8b5cf6',
  warmth:     '#f97316',
  lingering:  '#6b7280',
  excitement: '#22c55e',
  calm:       '#3b82f6',
  fear:       '#7c3aed',
};

const PLATFORMS: { key: PlatformVariant; label: string }[] = [
  { key: 'youtube_shorts', label: 'YT Shorts' },
  { key: 'tiktok',         label: 'TikTok' },
  { key: 'youtube_long',   label: 'YouTube Long' },
];

interface EmotionCurveEditorProps {
  curve: EmotionCurve;
  onChange: (curve: EmotionCurve) => void;
  totalDuration: number;
  readOnly?: boolean;
}

// ── SVG layout ──
const PAD = { top: 20, right: 20, bottom: 30, left: 10 };
const VIEW_W = 600;
const VIEW_H = 200;
const GRAPH_W = VIEW_W - PAD.left - PAD.right;
const GRAPH_H = VIEW_H - PAD.top - PAD.bottom;

function toSvg(time: number, intensity: number, dur: number) {
  return {
    x: PAD.left + (time / dur) * GRAPH_W,
    y: PAD.top + (1 - intensity) * GRAPH_H,
  };
}

function fromSvgY(svgY: number): number {
  return Math.max(0, Math.min(1, 1 - (svgY - PAD.top) / GRAPH_H));
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

const EmotionCurveEditor: React.FC<EmotionCurveEditorProps> = ({ curve, onChange, totalDuration, readOnly }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const dur = totalDuration || curve.total_duration || 60;
  const points = curve.curve_points;

  // ── Derived SVG points ──
  const svgPoints = useMemo(
    () => points.map(p => toSvg(p.time, p.intensity, dur)),
    [points, dur],
  );

  const pathD = useMemo(() => smoothPath(svgPoints), [svgPoints]);
  const fillD = useMemo(() => {
    if (!pathD) return '';
    const last = svgPoints[svgPoints.length - 1];
    const first = svgPoints[0];
    return `${pathD} L ${last.x} ${PAD.top + GRAPH_H} L ${first.x} ${PAD.top + GRAPH_H} Z`;
  }, [pathD, svgPoints]);

  // ── Arc / platform change ──
  const setArc = useCallback((arc: StoryArcType) => {
    const newCurve = generateEmotionCurve(arc, curve.platform_variant, dur);
    onChange({ ...curve, story_arc: arc, curve_points: newCurve.curve_points });
  }, [curve, dur, onChange]);

  const setPlatform = useCallback((pv: PlatformVariant) => {
    const newCurve = generateEmotionCurve(curve.story_arc, pv, dur);
    onChange({ ...curve, platform_variant: pv, curve_points: newCurve.curve_points });
  }, [curve, dur, onChange]);

  // ── Drag handlers ──
  const getSvgY = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleY = VIEW_H / rect.height;
    return (e.clientY - rect.top) * scaleY;
  }, []);

  const onPointerDown = useCallback((idx: number) => (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDraggingIdx(idx);
  }, [readOnly]);

  const onPointerMove = useCallback((e: React.MouseEvent) => {
    if (draggingIdx === null) return;
    const svgY = getSvgY(e);
    const intensity = fromSvgY(svgY);
    const updated = [...points];
    updated[draggingIdx] = { ...updated[draggingIdx], intensity: Math.round(intensity * 100) / 100 };
    onChange({ ...curve, curve_points: updated });
  }, [draggingIdx, getSvgY, points, curve, onChange]);

  const onPointerUp = useCallback(() => setDraggingIdx(null), []);

  // ── Double-click to add point ──
  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (readOnly || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const scaleY = VIEW_H / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;
    const time = Math.max(0, Math.min(dur, ((svgX - PAD.left) / GRAPH_W) * dur));
    const intensity = fromSvgY(svgY);
    const newPoint: EmotionCurvePoint = {
      time: Math.round(time * 10) / 10,
      emotion: 'calm',
      intensity: Math.round(intensity * 100) / 100,
      label: 'New',
      visual_cue: 'slow_pan',
      bgm_shift: 'neutral',
      tts_pace: 'normal',
      subtitle_style: 'default',
    };
    const updated = [...points, newPoint].sort((a, b) => a.time - b.time);
    onChange({ ...curve, curve_points: updated });
  }, [readOnly, dur, points, curve, onChange]);

  // ── Right-click to delete ──
  const onContextMenu = useCallback((idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (readOnly || points.length <= 2 || idx === 0 || idx === points.length - 1) return;
    const updated = points.filter((_, i) => i !== idx);
    onChange({ ...curve, curve_points: updated });
  }, [readOnly, points, curve, onChange]);

  // ── Tick marks ──
  const tickInterval = dur <= 30 ? 5 : dur <= 120 ? 10 : 30;
  const ticks: number[] = [];
  for (let t = 0; t <= dur; t += tickInterval) ticks.push(t);

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', overflow: 'hidden' }}>
      {/* ── Arc Selector ── */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto', borderBottom: '1px solid var(--border-subtle)' }}>
        {(Object.keys(STORY_ARCS) as StoryArcType[]).map(arc => (
          <button
            key={arc}
            onClick={() => !readOnly && setArc(arc)}
            style={{
              flexShrink: 0, padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: readOnly ? 'default' : 'pointer',
              background: curve.story_arc === arc ? 'rgba(6,182,212,0.15)' : 'var(--bg-elevated)',
              border: curve.story_arc === arc ? '1.5px solid #06b6d4' : '1px solid var(--border-subtle)',
              color: curve.story_arc === arc ? '#06b6d4' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontWeight: 600 }}>{STORY_ARCS[arc].nameKo}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{STORY_ARCS[arc].suitableFor}</div>
          </button>
        ))}
      </div>

      {/* ── Platform Toggle ── */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        {PLATFORMS.map(p => (
          <button
            key={p.key}
            onClick={() => !readOnly && setPlatform(p.key)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: readOnly ? 'default' : 'pointer',
              background: curve.platform_variant === p.key ? '#06b6d4' : 'var(--bg-elevated)',
              color: curve.platform_variant === p.key ? '#000' : 'var(--text-muted)',
              border: 'none', transition: 'all 0.2s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── SVG Graph ── */}
      <div style={{ padding: '8px 12px 12px' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          style={{ width: '100%', height: 200, cursor: draggingIdx !== null ? 'grabbing' : 'crosshair', userSelect: 'none' }}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(v => {
            const y = PAD.top + (1 - v) * GRAPH_H;
            return <line key={v} x1={PAD.left} x2={PAD.left + GRAPH_W} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="4 4" />;
          })}

          {/* X-axis ticks */}
          {ticks.map(t => {
            const x = PAD.left + (t / dur) * GRAPH_W;
            return (
              <g key={t}>
                <line x1={x} x2={x} y1={PAD.top + GRAPH_H} y2={PAD.top + GRAPH_H + 5} stroke="var(--text-muted)" strokeWidth={0.5} />
                <text x={x} y={PAD.top + GRAPH_H + 16} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{t}s</text>
              </g>
            );
          })}

          {/* Baseline */}
          <line x1={PAD.left} x2={PAD.left + GRAPH_W} y1={PAD.top + GRAPH_H} y2={PAD.top + GRAPH_H} stroke="var(--border-default)" strokeWidth={1} />

          {/* Gradient fill */}
          {fillD && <path d={fillD} fill="url(#curveFill)" />}

          {/* Curve line */}
          {pathD && (
            <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth={2.5} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.5))' }} />
          )}

          {/* Points */}
          {svgPoints.map((sp, i) => {
            const pt = points[i];
            const color = EMOTION_COLORS[pt.emotion] || '#06b6d4';
            const isActive = hoveredIdx === i || draggingIdx === i;
            return (
              <g key={i}>
                {/* Glow ring */}
                {isActive && (
                  <circle cx={sp.x} cy={sp.y} r={14} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} filter="url(#glow)">
                    <animate attributeName="r" values="12;16;12" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Outer ring */}
                <circle
                  cx={sp.x} cy={sp.y} r={isActive ? 7 : 5}
                  fill={color} stroke="#fff" strokeWidth={1.5} opacity={isActive ? 1 : 0.85}
                  style={{ cursor: readOnly ? 'default' : 'grab', transition: 'r 0.15s' }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => { if (draggingIdx === null) setHoveredIdx(null); }}
                  onMouseDown={onPointerDown(i)}
                  onContextMenu={onContextMenu(i)}
                />
                {/* Tooltip */}
                {isActive && (
                  <g>
                    <rect x={sp.x - 40} y={sp.y - 38} width={80} height={26} rx={6} fill="var(--bg-elevated)" stroke={color} strokeWidth={1} opacity={0.95} />
                    <text x={sp.x} y={sp.y - 22} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
                      {pt.label} ({Math.round(pt.intensity * 100)}%)
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default EmotionCurveEditor;
