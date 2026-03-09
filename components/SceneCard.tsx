import React, { useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GeneratedAsset } from '../types';
import LazyImage from './shared/LazyImage';
import AudioPlayer from './shared/AudioPlayer';

const getImageMime = (b64: string) => b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';

export interface SceneCardProps {
  row: GeneratedAsset;
  index: number;
  isPortrait: boolean;
  isAnimating: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  confirmDelete: boolean;
  onRegenerateImage?: (index: number) => void;
  onGenerateAnimation?: (index: number) => void;
  onEditToggle?: (index: number | null) => void;
  onUpdateAsset?: (index: number, updates: Partial<GeneratedAsset>) => void;
  onRegenerateAudio?: (index: number) => void;
  onDeleteScene?: (index: number) => void;
  onAddScene?: (afterIndex: number) => void;
  onDuplicateScene?: (index: number) => void;
  onUploadSceneImage?: (index: number, base64: string) => void;
  onSetCustomDuration?: (index: number, duration: number) => void;
  onSetZoomEffect?: (index: number, effect: string) => void;
  onSetTransition?: (index: number, transition: string) => void;
  onConfirmDeleteToggle?: (index: number | null) => void;
  onExpandToggle?: (index: number | null) => void;
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
  onDragEnd?: () => void;
}

const ZOOM_OPTIONS = [
  { value: 'zoomIn', label: '\u2197', title: '\uc904\uc778' },
  { value: 'zoomOut', label: '\u2199', title: '\uc904\uc544\uc6c3' },
  { value: 'panLeft', label: '\u2190', title: '\uc67c\ucabd\ud328\ub2dd' },
  { value: 'panRight', label: '\u2192', title: '\uc624\ub978\ucabd\ud328\ub2dd' },
  { value: 'none', label: '\u2022', title: '\uc815\uc801' },
] as const;

const TRANSITION_OPTIONS = [
  { value: 'crossfade', label: '\u27f7', title: '\ub514\uc878\ube0c' },
  { value: 'fadeBlack', label: '\u25a0', title: '\ud398\uc774\ub4dc' },
  { value: 'wipeLeft', label: '\u25c1', title: '\uc67c\ucabd\uc2ac\ub77c\uc774\ub4dc' },
  { value: 'wipeRight', label: '\u25b7', title: '\uc624\ub978\ucabd\uc2ac\ub77c\uc774\ub4dc' },
  { value: 'none', label: '\u2022', title: '\uc5c6\uc74c' },
] as const;

const SENTIMENT_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  POSITIVE: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#4ade80' },
  NEGATIVE: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', color: '#f87171' },
  NEUTRAL: { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', color: '#94a3b8' },
};

const COMPOSITION_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  STANDARD: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', color: '#34d399' },
  MACRO: { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)', color: '#60a5fa' },
  MICRO: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', color: '#a855f7' },
  NO_CHAR: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', color: '#fbbf24' },
};

const btnActiveStyle = {
  background: 'rgba(96,165,250,0.15)',
  borderColor: 'rgba(96,165,250,0.4)',
  color: '#60a5fa',
};

const btnBaseStyle = {
  width: 28,
  height: 24,
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  transition: 'all 0.15s',
  outline: 'none',
  padding: 0,
};

const SceneCard: React.FC<SceneCardProps> = memo(({
  row, index, isPortrait, isAnimating, isEditing, isExpanded, confirmDelete,
  onRegenerateImage, onGenerateAnimation, onEditToggle, onUpdateAsset,
  onRegenerateAudio, onDeleteScene, onAddScene, onDuplicateScene,
  onUploadSceneImage, onSetCustomDuration, onSetZoomEffect, onSetTransition,
  onConfirmDeleteToggle, onExpandToggle, onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const { t } = useTranslation();
  const narrationRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sceneNum = String(index + 1).padStart(2, '0');
  const duration = row.customDuration || row.audioDuration || row.videoDuration || 0;
  const isError = row.status === 'error';
  const isGenerating = row.status === 'generating';
  const hasVideo = !!row.videoData;
  const hasImage = !!row.imageData;
  const hasAudio = !!row.audioData;
  const composition = row.analysis?.composition_type;
  const sentiment = row.analysis?.sentiment;

  const imgW = isPortrait ? 64 : 280;
  const imgH = isPortrait ? 114 : 158;

  // Border / shadow style for card shell
  const cardBorder = isEditing
    ? 'rgba(96,165,250,0.4)'
    : isError
      ? 'rgba(239,68,68,0.3)'
      : 'var(--border-default)';
  const cardShadow = isEditing ? '0 0 20px rgba(96,165,250,0.08)' : undefined;

  const handleSave = () => {
    if (!onUpdateAsset || !onEditToggle) return;
    onUpdateAsset(index, {
      narration: narrationRef.current?.value ?? row.narration,
      visualPrompt: promptRef.current?.value ?? row.visualPrompt,
    });
    onEditToggle(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadSceneImage) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      onUploadSceneImage(index, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDeleteScene?.(index);
      onConfirmDeleteToggle?.(null);
    } else {
      onConfirmDeleteToggle?.(index);
      setTimeout(() => onConfirmDeleteToggle?.(null), 3000);
    }
  };

  // ─── Status dot color ───
  const statusColor = isError ? '#ef4444' : isGenerating ? '#60a5fa' : '#22c55e';
  const statusAnim = isGenerating ? 'pulse 1.5s infinite' : undefined;

  // ─── Render image area ───
  const renderImageArea = () => {
    if (isGenerating && !hasImage) {
      return (
        <div className="relative flex-shrink-0 flex items-center justify-center w-full h-40 md:w-auto md:h-auto" style={{ ...(typeof window !== 'undefined' && window.innerWidth >= 768 ? { width: imgW, height: imgH } : {}), background: 'var(--bg-elevated)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.05) 50%, transparent 100%)', animation: 'shimmer 2s infinite' }} />
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
            <span className="text-[10px] font-bold" style={{ color: '#60a5fa' }}>{t('imageGenerating', '\uc774\ubbf8\uc9c0 \uc0dd\uc131\uc911...')}</span>
          </div>
        </div>
      );
    }

    if (isError && !hasImage) {
      return (
        <div className="relative flex-shrink-0 flex items-center justify-center w-full h-40 md:w-auto md:h-auto" style={{ ...(typeof window !== 'undefined' && window.innerWidth >= 768 ? { width: imgW, height: imgH } : {}), background: 'rgba(239,68,68,0.05)', borderRight: '2px dashed rgba(239,68,68,0.3)' }}>
          <div className="text-center">
            <svg className="w-8 h-8 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => onRegenerateImage?.(index)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">{'\ud83d\udd04'} {t('regenerate', '\uc7ac\uc0dd\uc131')}</button>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>{'\ud83d\udce4'} {t('upload', '\uc5c5\ub85c\ub4dc')}</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex-shrink-0 group/img w-full h-40 md:w-auto md:h-auto" style={typeof window !== 'undefined' && window.innerWidth >= 768 ? { width: imgW, height: imgH } : undefined}>
        {hasVideo ? (
          <>
            <video src={row.videoData!} autoPlay loop muted playsInline className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-extrabold" style={{ background: 'rgba(6,182,212,0.2)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>VIDEO</div>
          </>
        ) : hasImage ? (
          <LazyImage src={`data:${getImageMime(row.imageData!)};base64,${row.imageData}`} alt={`Scene ${sceneNum}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
            <div className="flex items-center gap-2">
              <button onClick={() => onRegenerateImage?.(index)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>{'\ud83d\udd04'} {t('regenerate', '\uc7ac\uc0dd\uc131')}</button>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>{'\ud83d\udce4'} {t('upload', '\uc5c5\ub85c\ub4dc')}</button>
            </div>
          </div>
        )}

        {/* Hover overlay */}
        {(hasImage || hasVideo) && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-3 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200">
            <button onClick={() => onRegenerateImage?.(index)} className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all flex items-center gap-1.5">{'\ud83d\udd04'} {t('regenerate', '\uc7ac\uc0dd\uc131')}</button>
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all flex items-center gap-1.5">{'\ud83d\udce4'} {t('upload', '\uc5c5\ub85c\ub4dc')}</button>
            {!isEditing && (
              <button onClick={() => onGenerateAnimation?.(index)} className="px-3 py-2 rounded-lg text-xs font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition-all flex items-center gap-1.5">{'\ud83c\udfac'} {t('video', '\uc601\uc0c1')}</button>
            )}
          </div>
        )}

        {/* Duration badge */}
        {duration > 0 && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(0,0,0,0.7)', color: 'white' }}>
            {'\u23f1'} {duration.toFixed(1)}s
          </div>
        )}
      </div>
    );
  };

  // ─── Render TTS controls ───
  const renderAudioControls = () => {
    if (!hasAudio) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', opacity: 0.4 }}>
          <button disabled style={{ width: 26, height: 26, border: 'none', background: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>TTS {t('pending', '\ub300\uae30')}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <AudioPlayer base64={row.audioData!} />
        {row.audioDuration && (
          <span className="text-[10px] font-bold" style={{ color: '#34d399' }}>{row.audioDuration.toFixed(1)}s</span>
        )}
        <button onClick={() => onRegenerateAudio?.(index)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10" title="TTS \uc7ac\uc0dd\uc131" style={{ color: 'var(--text-muted)' }}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={() => onUpdateAsset?.(index, { audioMuted: !row.audioMuted })} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10" title={row.audioMuted ? '\uc74c\uc18c\uac70 \ud574\uc81c' : '\uc74c\uc18c\uac70'} style={{ color: row.audioMuted ? '#f87171' : 'var(--text-muted)' }}>
          {row.audioMuted ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
          )}
        </button>
      </div>
    );
  };

  // ─── Render zoom buttons ───
  const renderZoomButtons = () => (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>{'\uc90C'}</span>
      {ZOOM_OPTIONS.map(opt => (
        <button key={opt.value} title={opt.title} onClick={() => onSetZoomEffect?.(index, opt.value)}
          style={{ ...btnBaseStyle, ...(row.zoomEffect === opt.value || (!row.zoomEffect && opt.value === 'zoomIn') ? btnActiveStyle : {}) }}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  // ─── Render transition buttons ───
  const renderTransitionButtons = () => (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>{'\uc804\ud658'}</span>
      {TRANSITION_OPTIONS.map(opt => (
        <button key={opt.value} title={opt.title} onClick={() => onSetTransition?.(index, opt.value)}
          style={{ ...btnBaseStyle, ...(row.transition === opt.value || (!row.transition && opt.value === 'none') ? btnActiveStyle : {}) }}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  const showExpanded = isExpanded || isEditing;

  return (
    <div
      className="group rounded-2xl border overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--bg-surface) 40%, transparent)',
        borderColor: cardBorder,
        boxShadow: cardShadow,
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      draggable
      onDragStart={() => onDragStart?.(index)}
      onDragOver={e => onDragOver?.(e)}
      onDrop={() => onDrop?.(index)}
      onDragEnd={() => onDragEnd?.()}
    >
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-3">
          <div className="opacity-0 group-hover:opacity-60 text-xs transition-opacity duration-200" style={{ color: 'var(--text-muted)', cursor: 'grab' }}>{'\u2807'}</div>
          <span className="font-mono text-xs font-bold" style={{ color: isEditing ? '#60a5fa' : 'var(--text-muted)' }}>
            #{sceneNum}{isEditing ? ` ${t('editing', '\ud3b8\uc9d1\uc911')}` : ''}
          </span>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, animation: statusAnim }} />
          {composition && COMPOSITION_BADGE[composition] && (
            <span className="text-[8px] font-extrabold px-[5px] py-[2px] rounded uppercase tracking-wider" style={{ background: COMPOSITION_BADGE[composition].bg, color: COMPOSITION_BADGE[composition].color, border: `1px solid ${COMPOSITION_BADGE[composition].border}`, letterSpacing: '0.5px' }}>
              {composition}
            </span>
          )}
          {sentiment && SENTIMENT_BADGE[sentiment] && (
            <span className="text-[8px] font-extrabold px-[5px] py-[2px] rounded uppercase tracking-wider" style={{ background: SENTIMENT_BADGE[sentiment].bg, color: SENTIMENT_BADGE[sentiment].color, border: `1px solid ${SENTIMENT_BADGE[sentiment].border}`, letterSpacing: '0.5px' }}>
              {sentiment}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white">{'\u2713'} {t('save', '\uc800\uc7a5')}</button>
              <button onClick={() => onEditToggle?.(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{'\u2717'} {t('cancel', '\ucde8\uc18c')}</button>
            </>
          ) : (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">
              <button onClick={() => onEditToggle?.(index)} style={{ height: 28, padding: '0 8px', fontSize: 11, borderRadius: 8, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{'\u270f\ufe0f'}</button>
              <button onClick={() => onDuplicateScene?.(index)} style={{ height: 28, padding: '0 8px', fontSize: 11, borderRadius: 8, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{'\ud83d\udccb'}</button>
              <button onClick={() => onAddScene?.(index)} style={{ height: 28, padding: '0 8px', fontSize: 11, borderRadius: 8, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{'\u2795'}</button>
              <button onClick={handleDeleteClick} style={{ height: 28, padding: '0 8px', fontSize: 11, borderRadius: 8, fontWeight: 600, border: `1px solid ${confirmDelete ? 'rgba(239,68,68,0.4)' : 'var(--border-subtle)'}`, background: confirmDelete ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)', color: '#f87171', cursor: 'pointer' }}>
                {confirmDelete ? `${'\ud83d\uddd1\ufe0f'} ${t('confirmDelete', '\ud655\uc778')}` : '\ud83d\uddd1\ufe0f'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <div className="flex flex-col md:flex-row">
        {renderImageArea()}

        <div className="flex-1 min-w-0 flex flex-col p-4 gap-3">
          {/* Content area */}
          {isEditing ? (
            <>
              <textarea ref={narrationRef} rows={3} defaultValue={row.narration}
                className="w-full text-sm rounded-lg p-3 border resize-y"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', lineHeight: 1.6 }} />
              <textarea ref={promptRef} rows={3} defaultValue={row.visualPrompt} placeholder="Visual Prompt"
                className="w-full text-xs rounded-lg p-3 border resize-y font-mono"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)', outline: 'none', lineHeight: 1.6 }} />
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {row.narration}
              </p>
              {isError && row.errorMessage && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                  {'\u26a0'} {row.errorMessage}
                </div>
              )}
            </>
          )}

          {/* Footer controls */}
          <div className="flex items-center gap-2 md:gap-3 mt-auto flex-wrap">
            {renderAudioControls()}

            {isEditing && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>{t('duration', '\uae38\uc774')}</span>
                <input type="number" defaultValue={duration || 4} step={0.5} min={1} max={60}
                  onChange={e => onSetCustomDuration?.(index, parseFloat(e.target.value) || 4)}
                  className="w-14 h-7 text-center text-xs rounded-md border"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }} />
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t('seconds', '\ucd08')}</span>
              </div>
            )}

            {renderZoomButtons()}

            <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />

            {renderTransitionButtons()}
          </div>
        </div>
      </div>

      {/* ═══ Visual Prompt (collapsible) ═══ */}
      {!isEditing && (
        <>
          <div
            className="px-4 py-2 text-xs flex items-center gap-2 cursor-pointer hover:text-blue-400"
            style={{ borderTop: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            onClick={() => onExpandToggle?.(isExpanded ? null : index)}
          >
            <span>{showExpanded ? '\u25be' : '\u25b8'}</span>
            <span>{t('visualPrompt', '\ube44\uc8fc\uc5bc \ud504\ub86c\ud504\ud2b8')}</span>
            {!showExpanded && (
              <span style={{ fontSize: 10, opacity: 0.6 }}>{row.visualPrompt?.slice(0, 60)}...</span>
            )}
          </div>
          {showExpanded && (
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-default)', background: 'rgba(15,23,42,0.5)' }}>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {row.visualPrompt}
              </p>
            </div>
          )}
        </>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
});

SceneCard.displayName = 'SceneCard';

export default SceneCard;
