
import React, { useRef, useState, useEffect, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GeneratedAsset, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG, SceneDirectives } from '../types';
import { downloadSrt } from '../services/srtService';
import { exportAssetsToZip } from '../services/exportService';
import { getVideoOrientation, VIDEO_RESOLUTIONS, ResolutionTier, canAccessResolution, getVideoResolution, setVideoResolution } from '../config';
import PreviewPlayer from './PreviewPlayer';
import LazyImage from './shared/LazyImage';
import { decodeAudio } from './shared/audioUtils';
import AudioPlayer from './shared/AudioPlayer';
import DirectiveDebugPanel from './DirectiveDebugPanel';

// base64 이미지 MIME 타입 감지 (PNG는 iVBOR로 시작)
const getImageMime = (b64: string) => b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';

interface ResultTableProps {
  data: GeneratedAsset[];
  editingIndex?: number | null;
  onEditToggle?: (index: number | null) => void;
  onUpdateAsset?: (index: number, updates: Partial<GeneratedAsset>) => void;
  onRegenerateAudio?: (index: number) => void;
  onReorderScenes?: (fromIdx: number, toIdx: number) => void;
  onDeleteScene?: (index: number) => void;
  onAddScene?: (afterIndex?: number) => void;
  onUploadSceneImage?: (index: number, base64: string) => void;
  onSetCustomDuration?: (index: number, duration: number) => void;
  onSetZoomEffect?: (index: number, effect: string) => void;
  onSetTransition?: (index: number, transition: string) => void;
  onSetDefaultTransition?: (transition: string) => void;
  onAutoZoom?: (pattern: string) => void;
  onRegenerateImage?: (index: number) => void;
  onExportVideo?: (enableSubtitles: boolean, subtitleConfig?: Partial<SubtitleConfig>, sceneGap?: number, resolution?: ResolutionTier) => void;
  userPlan?: string;
  onGenerateAnimation?: (index: number) => void;
  onDuplicateScene?: (index: number) => void;
  onRegenerateFailedScenes?: () => void;
  isExporting?: boolean;
  animatingIndices?: Set<number>;
  bgmData?: string | null;
  bgmVolume?: number;
  onBgmChange?: (data: string | null) => void;
  onBgmVolumeChange?: (volume: number) => void;
  bgmDuckingEnabled?: boolean;
  bgmDuckingAmount?: number;
  onBgmDuckingToggle?: (enabled: boolean) => void;
  onBgmDuckingAmountChange?: (amount: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onOpenThumbnail?: () => void;
  onSaveProject?: () => void;
  // 일괄 작업
  selectedIndices?: Set<number>;
  onToggleSelect?: (index: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

// TableRow Props
interface TableRowProps {
  row: GeneratedAsset;
  index: number;
  isAnimating: boolean;
  isEditing: boolean;
  confirmDelete: boolean;
  isSelected: boolean;
  onToggleSelect?: (index: number) => void;
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
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
  onDragEnd?: () => void;
}

// ── 디렉티브 태그 아이콘/라벨 매핑 ──
const DIRECTIVE_TAG_CONFIG: Record<string, { icon: string; label: string; color: string; bgColor: string; borderColor: string }> = {
  BACKGROUND: { icon: '🎬', label: '배경', color: '#818cf8', bgColor: 'rgba(129,140,248,0.08)', borderColor: 'rgba(129,140,248,0.25)' },
  MOOD: { icon: '🎭', label: '분위기', color: '#a78bfa', bgColor: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.25)' },
  COMPOSITION: { icon: '📐', label: '구도', color: '#60a5fa', bgColor: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.25)' },
  CAMERA: { icon: '📷', label: '카메라', color: '#67e8f9', bgColor: 'rgba(103,232,249,0.08)', borderColor: 'rgba(103,232,249,0.25)' },
  COLOR: { icon: '🎨', label: '색상', color: '#c084fc', bgColor: 'rgba(192,132,252,0.08)', borderColor: 'rgba(192,132,252,0.25)' },
  TEXT: { icon: '📝', label: '텍스트', color: '#93c5fd', bgColor: 'rgba(147,197,253,0.08)', borderColor: 'rgba(147,197,253,0.25)' },
  STYLE: { icon: '🖌️', label: '스타일', color: '#f0abfc', bgColor: 'rgba(240,171,252,0.08)', borderColor: 'rgba(240,171,252,0.25)' },
  SPEAKER: { icon: '🎙️', label: '화자', color: '#86efac', bgColor: 'rgba(134,239,172,0.08)', borderColor: 'rgba(134,239,172,0.25)' },
  KEEP_PREV: { icon: '🔗', label: '이전유지', color: '#fbbf24', bgColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  SAME_PLACE: { icon: '📍', label: '같은장소', color: '#fb923c', bgColor: 'rgba(251,146,60,0.08)', borderColor: 'rgba(251,146,60,0.25)' },
  TIME_PASS: { icon: '⏰', label: '시간경과', color: '#fcd34d', bgColor: 'rgba(252,211,77,0.08)', borderColor: 'rgba(252,211,77,0.25)' },
};

const DIRECTIVE_KEYS = ['BACKGROUND', 'MOOD', 'COMPOSITION', 'CAMERA', 'COLOR', 'TEXT', 'STYLE', 'SPEAKER', 'KEEP_PREV', 'SAME_PLACE', 'TIME_PASS'] as const;

// ── 디렉티브 태그 표시 컴포넌트 ──
const DirectiveTags: React.FC<{
  directives?: SceneDirectives;
  onEditDirectives?: (directives: SceneDirectives) => void;
}> = ({ directives, onEditDirectives }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDirs, setEditDirs] = useState<SceneDirectives>({});
  const [newKey, setNewKey] = useState<string>('');

  if (!directives || Object.keys(directives).length === 0) {
    // 디렉티브가 없을 때 편집 버튼만 표시
    if (!onEditDirectives) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        <button
          onClick={() => { setEditDirs({}); setIsEditMode(true); }}
          className="text-[7px] font-bold px-1.5 py-0.5 rounded border transition-all hover:opacity-80"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >+ 디렉티브</button>
        {isEditMode && (
          <DirectiveEditor
            directives={editDirs}
            onChange={setEditDirs}
            onSave={() => { onEditDirectives(editDirs); setIsEditMode(false); }}
            onCancel={() => setIsEditMode(false)}
            newKey={newKey}
            onNewKeyChange={setNewKey}
          />
        )}
      </div>
    );
  }

  if (isEditMode && onEditDirectives) {
    return (
      <DirectiveEditor
        directives={editDirs}
        onChange={setEditDirs}
        onSave={() => { onEditDirectives(editDirs); setIsEditMode(false); }}
        onCancel={() => setIsEditMode(false)}
        newKey={newKey}
        onNewKeyChange={setNewKey}
      />
    );
  }

  const entries = Object.entries(directives).filter(
    ([, v]) => v !== undefined && v !== '' && v !== false
  );
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([key, val]) => {
        const cfg = DIRECTIVE_TAG_CONFIG[key];
        if (!cfg) return null;
        const displayVal = typeof val === 'boolean' ? '' : ` ${val}`;
        return (
          <span
            key={key}
            className="text-[7px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5 cursor-default"
            style={{ color: cfg.color, backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }}
            title={`${cfg.label}: ${val}`}
          >
            {cfg.icon}{displayVal}
          </span>
        );
      })}
      {onEditDirectives && (
        <button
          onClick={() => { setEditDirs({ ...directives }); setNewKey(''); setIsEditMode(true); }}
          className="text-[7px] font-bold px-1 py-0.5 rounded border transition-all hover:opacity-80"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          title="디렉티브 편집"
        >✎</button>
      )}
    </div>
  );
};

// ── 디렉티브 인라인 편집 UI ──
const DirectiveEditor: React.FC<{
  directives: SceneDirectives;
  onChange: (d: SceneDirectives) => void;
  onSave: () => void;
  onCancel: () => void;
  newKey: string;
  onNewKeyChange: (k: string) => void;
}> = ({ directives, onChange, onSave, onCancel, newKey, onNewKeyChange }) => {
  const entries = Object.entries(directives).filter(([, v]) => v !== undefined);
  const usedKeys = new Set(entries.map(([k]) => k));
  const availableKeys = DIRECTIVE_KEYS.filter(k => !usedKeys.has(k));

  const updateValue = (key: string, value: string | boolean) => {
    onChange({ ...directives, [key]: value });
  };

  const removeKey = (key: string) => {
    const next = { ...directives };
    delete (next as any)[key];
    onChange(next);
  };

  const addKey = () => {
    if (!newKey) return;
    const boolKeys = ['KEEP_PREV', 'SAME_PLACE', 'TIME_PASS'];
    onChange({ ...directives, [newKey]: boolKeys.includes(newKey) ? true : '' });
    onNewKeyChange('');
  };

  return (
    <div className="mt-1.5 rounded-lg border p-2 space-y-1.5" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', borderColor: 'var(--border-default)' }}>
      {entries.map(([key, val]) => {
        const cfg = DIRECTIVE_TAG_CONFIG[key];
        if (!cfg) return null;
        const isBool = typeof val === 'boolean';
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold w-14 flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
            {isBool ? (
              <button
                onClick={() => updateValue(key, !val)}
                className="text-[8px] px-1.5 py-0.5 rounded border"
                style={{
                  backgroundColor: val ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  borderColor: val ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                  color: val ? '#22c55e' : '#ef4444',
                }}
              >{val ? 'ON' : 'OFF'}</button>
            ) : (
              <input
                type="text"
                value={String(val)}
                onChange={(e) => updateValue(key, e.target.value)}
                className="flex-1 text-[8px] px-1.5 py-0.5 rounded border focus:outline-none focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button onClick={() => removeKey(key)} className="text-[8px] text-red-400 hover:text-red-300 px-0.5" title="삭제">✕</button>
          </div>
        );
      })}
      {/* 새 디렉티브 추가 */}
      {availableKeys.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <select
            value={newKey}
            onChange={(e) => onNewKeyChange(e.target.value)}
            className="text-[8px] px-1 py-0.5 rounded border"
            style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">+ 추가...</option>
            {availableKeys.map(k => (
              <option key={k} value={k}>{DIRECTIVE_TAG_CONFIG[k]?.icon} {DIRECTIVE_TAG_CONFIG[k]?.label || k}</option>
            ))}
          </select>
          {newKey && (
            <button onClick={addKey} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500">추가</button>
          )}
        </div>
      )}
      {/* 저장/취소 */}
      <div className="flex justify-end gap-1 pt-1">
        <button onClick={onCancel} className="text-[8px] font-bold px-2 py-0.5 rounded border hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>취소</button>
        <button onClick={onSave} className="text-[8px] font-bold px-2 py-0.5 rounded bg-brand-600 text-white hover:bg-brand-500">저장</button>
      </div>
    </div>
  );
};

const TableRow: React.FC<TableRowProps> = memo(({
  row, index, isAnimating, isEditing, confirmDelete, isSelected, onToggleSelect,
  onRegenerateImage, onGenerateAnimation,
  onEditToggle, onUpdateAsset, onRegenerateAudio,
  onDeleteScene, onAddScene, onDuplicateScene, onUploadSceneImage, onSetCustomDuration,
  onSetZoomEffect, onSetTransition, onConfirmDeleteToggle,
  onDragStart, onDragOver, onDrop, onDragEnd
}) => {
  const { t } = useTranslation();
  const narrationRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  const isPortrait = getVideoOrientation() === 'portrait';

  const handleSave = () => {
    onUpdateAsset?.(index, {
      narration: narrationRef.current?.value ?? row.narration,
      visualPrompt: promptRef.current?.value ?? row.visualPrompt,
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 항상 base64만 추출 (data URL prefix 제거)
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      onUploadSceneImage?.(index, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 현재 표시 재생시간 (커스텀 > 오디오 > 기본 3초)
  const effectiveDuration = row.customDuration ?? (row.audioDuration ? Math.round(row.audioDuration * 10) / 10 : 3);

  return (
    <tr className="group hover:bg-[color-mix(in_srgb,var(--bg-elevated)_20%,transparent)] transition-colors" onDragOver={onDragOver} onDrop={() => onDrop?.(index)}>

      {/* 드래그 핸들 + 씬 번호 + 액션 버튼들 */}
      <td
        className="py-5 px-3 align-top w-16 cursor-grab active:cursor-grabbing select-none"
        draggable onDragStart={() => onDragStart?.(index)} onDragEnd={onDragEnd}
      >
        <div className="flex flex-col items-center gap-2">
          {/* 체크박스 */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(index); }}
            className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all text-[10px] font-bold"
            style={{
              borderColor: isSelected ? '#3b82f6' : 'var(--border-default)',
              backgroundColor: isSelected ? '#3b82f6' : 'transparent',
              color: isSelected ? '#fff' : 'transparent',
            }}
          >
            {isSelected ? '✓' : ''}
          </button>

          {/* 드래그 핸들 */}
          <div className="group-hover:text-[var(--text-muted)] transition-colors" style={{ color: 'var(--border-subtle)' }} title={t('result.dragToReorder')}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>

          {/* 씬 번호 */}
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>#{row.sceneNumber.toString().padStart(2, '0')}</span>

          {/* 편집/저장/취소 */}
          {isEditing ? (
            <div className="flex flex-col gap-1 w-full">
              <button onClick={handleSave} className="px-1.5 py-1 bg-green-600 hover:bg-green-500 text-white text-[8px] font-bold rounded transition-colors w-full">✓ {t('common.save')}</button>
              <button onClick={() => onEditToggle?.(null)} className="px-1.5 py-1 hover:bg-[var(--bg-hover)] text-[8px] font-bold rounded transition-colors w-full" style={{ backgroundColor: 'var(--text-muted)', color: 'var(--text-primary)' }}>✗ {t('common.cancel')}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 w-full">
              {/* 편집 */}
              <button
                onClick={(e) => { e.stopPropagation(); onEditToggle?.(index); }}
                className="p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] rounded transition-colors w-full flex justify-center"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                title={t('result.editScene')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              {/* 씬 복제 */}
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicateScene?.(index); }}
                className="p-1 hover:bg-amber-900/50 hover:text-amber-400 rounded transition-colors w-full flex justify-center"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                title={t('result.duplicateScene')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              {/* 아래에 씬 추가 */}
              <button
                onClick={(e) => { e.stopPropagation(); onAddScene?.(index); }}
                className="p-1 hover:bg-brand-900/50 hover:text-brand-400 rounded transition-colors w-full flex justify-center"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                title={t('result.addSceneBelow')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {/* 삭제 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete) {
                    onDeleteScene?.(index);
                    onConfirmDeleteToggle?.(null);
                  } else {
                    onConfirmDeleteToggle?.(index);
                  }
                }}
                className={`p-1 rounded transition-colors w-full flex justify-center ${confirmDelete ? 'bg-red-600 hover:bg-red-500 text-white' : 'hover:bg-red-900/50 hover:text-red-400'}`}
                style={confirmDelete ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                title={confirmDelete ? t('result.confirmDelete') : t('result.deleteScene')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </td>

      {/* 나레이션 */}
      <td className="py-5 px-6 align-top">
        <div className="space-y-3">
          {isEditing ? (
            <textarea ref={narrationRef} defaultValue={row.narration}
              className="w-full border focus:border-brand-500 rounded-lg p-2 text-sm leading-relaxed resize-none focus:outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              rows={6} onClick={(e) => e.stopPropagation()} />
          ) : (
            <p className="text-sm leading-relaxed font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {row.narration || <span className="italic" style={{ color: 'var(--text-muted)' }}>{t('result.noNarration')}</span>}
            </p>
          )}
          {row.analysis?.composition_type && (
            <div className="flex flex-wrap gap-1">
              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border uppercase ${
                row.analysis.composition_type === 'MACRO' ? 'text-brand-400 bg-brand-400/5 border-brand-400/20' :
                row.analysis.composition_type === 'STANDARD' ? 'text-emerald-400 bg-emerald-400/5 border-emerald-400/20' :
                'text-amber-400 bg-amber-400/5 border-amber-400/20'
              }`}>{row.analysis.composition_type}</span>
              {row.analysis.sentiment && (
                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border uppercase ${
                  row.analysis.sentiment === 'POSITIVE' ? 'text-green-400 bg-green-400/5 border-green-400/20' :
                  row.analysis.sentiment === 'NEGATIVE' ? 'text-red-400 bg-red-400/5 border-red-400/20' :
                  'text-gray-400 bg-gray-400/5 border-gray-400/20'
                }`}>{row.analysis.sentiment}</span>
              )}
            </div>
          )}
          {/* 디렉티브 태그 표시 + 편집 */}
          <DirectiveTags
            directives={row.analysis?.directives}
            onEditDirectives={onUpdateAsset ? (newDirs) => {
              onUpdateAsset(index, {
                analysis: { ...row.analysis!, directives: newDirs },
              });
            } : undefined}
          />
        </div>
      </td>

      {/* 비주얼 프롬프트 */}
      <td className="py-5 px-6 align-top">
        {isEditing ? (
          <textarea ref={promptRef} defaultValue={row.visualPrompt}
            className="w-full border focus:border-brand-500 rounded-lg p-2 text-xs font-mono leading-tight resize-none focus:outline-none transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            rows={10} onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="rounded-lg p-3 border text-xs font-mono leading-tight whitespace-pre-wrap" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 30%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 50%, transparent)', color: 'var(--text-muted)' }}>
            {row.visualPrompt || <span className="italic">{t('result.noPrompt')}</span>}
          </div>
        )}
      </td>

      {/* 생성 결과물 + 재생시간 */}
      <td className="py-5 px-6 align-top">
        {/* 이미지/영상 + 사이드 버튼 */}
        <div className="flex items-stretch gap-1 mx-auto" style={{ width: isPortrait ? 'auto' : 'auto' }}>
        <div
          className="relative flex-shrink-0 rounded-xl overflow-hidden border shadow-inner group/img"
          style={isPortrait
            ? { width: '64px', height: '114px', backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-default)' }
            : { width: '192px', height: '108px', backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-default)' }
          }
        >
          {/* 숨겨진 이미지 업로드 input */}
          <input ref={imageUploadRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {row.status === 'generating' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent animate-spin rounded-full"></div>
              <span className="text-[7px] text-brand-500 font-black uppercase tracking-widest">{t('result.rendering')}</span>
            </div>
          ) : isAnimating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cyan-950/30">
              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full"></div>
              <span className="text-[7px] text-cyan-400 font-black uppercase tracking-widest">{t('result.convertingVideo')}</span>
            </div>
          ) : row.status === 'error' ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-950/30 border-2 border-dashed border-red-800/50 m-1 rounded-lg cursor-help"
              title={row.errorMessage || t('result.failed')}
            >
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[7px] text-red-400 font-black uppercase">{t('result.failed')}</span>
            </div>
          ) : row.videoData ? (
            <>
              <video src={row.videoData} className="w-full h-full object-cover" autoPlay loop muted playsInline />
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-cyan-500/80 text-[6px] font-black text-white uppercase">{t('common.video')}</div>
            </>
          ) : row.imageData ? (
            <LazyImage src={`data:${getImageMime(row.imageData!)};base64,${row.imageData}`} alt="Scene"
              className="w-full h-full object-cover scene-img-hover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 m-1">
              <button onClick={() => onRegenerateImage?.(index)}
                className="px-1.5 py-0.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-[7px] font-black transition-all"
                title={t('result.regenerate')}>{t('result.regenerate', '생성')}</button>
              <button onClick={() => imageUploadRef.current?.click()}
                className="px-1.5 py-0.5 rounded hover:bg-[var(--bg-hover)] text-[7px] font-black transition-all"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                title={t('result.clickToUpload')}>{t('result.upload', '업로드')}</button>
            </div>
          )}
        </div>

        {/* 사이드 버튼 바 (이미지 옆 세로) */}
        {(row.imageData || row.videoData || row.status === 'error') && (
          <div className={`flex flex-col justify-center gap-1 ${isAnimating || row.status === 'generating' ? 'opacity-30 pointer-events-none' : ''}`}>
            <button onClick={() => onRegenerateImage?.(index)}
              className="w-7 h-7 rounded-md flex items-center justify-center border transition-all hover:bg-white/10 hover:text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
              title={t('result.regenerateImage')}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={() => imageUploadRef.current?.click()}
              className="w-7 h-7 rounded-md flex items-center justify-center border transition-all hover:bg-white/10 hover:text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
              title={t('result.uploadImage')}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </button>
            {row.imageData && (
              <button onClick={() => onGenerateAnimation?.(index)}
                className={`w-7 h-7 rounded-md flex items-center justify-center border transition-all ${row.videoData ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25 hover:bg-cyan-500/20' : 'hover:bg-white/10 hover:text-white'}`}
                style={row.videoData ? undefined : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                title={row.videoData ? t('result.regenerateVideo') : t('result.convertVideo')}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            )}
          </div>
        )}
        </div>

        {/* 오류 메시지 (생성 실패 시) */}
        {row.status === 'error' && row.errorMessage && (
          <div className="mt-1.5 max-w-[192px] mx-auto" title={row.errorMessage}>
            <p className={`text-[7px] leading-tight text-center px-1 py-0.5 rounded border cursor-help ${
              row.errorMessage.toLowerCase().includes('safety') || row.errorMessage.toLowerCase().includes('blocked') || row.errorMessage.toLowerCase().includes('policy')
                ? 'text-orange-400 bg-orange-950/30 border-orange-800/40'
                : row.errorMessage.toLowerCase().includes('quota') || row.errorMessage.toLowerCase().includes('429') || row.errorMessage.toLowerCase().includes('rate')
                ? 'text-yellow-400 bg-yellow-950/30 border-yellow-800/40'
                : row.errorMessage.toLowerCase().includes('api key') || row.errorMessage.toLowerCase().includes('unauthorized')
                ? 'text-red-400 bg-red-950/30 border-red-800/40'
                : 'text-[var(--text-secondary)] bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)] border-[color-mix(in_srgb,var(--border-subtle)_40%,transparent)]'
            }`}>
              {row.errorMessage.toLowerCase().includes('safety') || row.errorMessage.toLowerCase().includes('blocked') || row.errorMessage.toLowerCase().includes('policy')
                ? `⚠ ${t('result.policyViolation')}`
                : row.errorMessage.toLowerCase().includes('quota') || row.errorMessage.toLowerCase().includes('429') || row.errorMessage.toLowerCase().includes('rate')
                ? `⏱ ${t('result.apiQuotaExceeded')}`
                : row.errorMessage.toLowerCase().includes('api key') || row.errorMessage.toLowerCase().includes('unauthorized')
                ? `🔑 ${t('result.apiKeyError')}`
                : row.errorMessage.slice(0, 50) + (row.errorMessage.length > 50 ? '…' : '')}
            </p>
          </div>
        )}

        {/* 재생 시간 조절 */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>⏱</span>
          <input
            type="number" min={1} max={60} step={0.5}
            value={effectiveDuration}
            onChange={(e) => onSetCustomDuration?.(index, Math.max(1, Math.min(60, Number(e.target.value))))}
            className="w-12 border hover:border-[var(--text-muted)] focus:border-brand-500 rounded px-1 py-0.5 text-[9px] text-center focus:outline-none transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            title={t('result.duration')}
          />
          <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{t('result.duration')}</span>
          {row.customDuration && (
            <button
              onClick={() => onSetCustomDuration?.(index, 0)}
              className="text-[7px] hover:text-[var(--text-secondary)] transition-colors"
              style={{ color: 'var(--border-subtle)' }}
              title={t('result.resetDefault')}
            >↩</button>
          )}
        </div>

        {/* 줌/팬 효과 선택 */}
        <div className="mt-1.5 flex items-center justify-center gap-0.5">
          {([
            { id: 'zoomIn', label: '↗', titleKey: 'result.zoomIn' },
            { id: 'zoomOut', label: '↙', titleKey: 'result.zoomOut' },
            { id: 'panLeft', label: '←', titleKey: 'result.panLeft' },
            { id: 'panRight', label: '→', titleKey: 'result.panRight' },
            { id: 'none', label: '•', titleKey: 'result.noEffect' },
          ] as const).map(({ id, label, titleKey }) => (
            <button
              key={id}
              onClick={() => onSetZoomEffect?.(index, id)}
              className={`w-5 h-5 rounded text-[8px] font-bold transition-all ${
                (row.zoomEffect || 'zoomIn') === id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'hover:text-[var(--text-secondary)] border'
              }`}
              style={(row.zoomEffect || 'zoomIn') === id ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}
              title={t(titleKey)}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 전환 효과 선택 */}
        <div className="mt-1 flex items-center justify-center gap-0.5">
          {([
            { id: 'none', label: '•', titleKey: 'result.noTransition' },
            { id: 'crossfade', label: '⟷', titleKey: 'result.crossfade' },
            { id: 'fadeBlack', label: '■', titleKey: 'result.fadeBlack' },
            { id: 'wipeLeft', label: '◁', titleKey: 'result.wipeLeft' },
            { id: 'wipeRight', label: '▷', titleKey: 'result.wipeRight' },
          ] as const).map(({ id, label, titleKey }) => (
            <button
              key={id}
              onClick={() => onSetTransition?.(index, id)}
              className={`w-5 h-5 rounded text-[7px] font-bold transition-all ${
                (row.transition || 'none') === id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:text-[var(--text-secondary)] border'
              }`}
              style={(row.transition || 'none') === id ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}
              title={t(titleKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </td>

      {/* 음성 */}
      <td className="py-5 px-6 align-top text-center">
        {row.audioData ? (
          <div className="flex flex-col items-center gap-1.5">
            <AudioPlayer base64={row.audioData} />
            {!isEditing && (
              <>
                <button
                  onClick={() => onRegenerateAudio?.(index)}
                  className="p-1 hover:bg-blue-900/50 hover:text-blue-400 rounded transition-colors"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  title={t('result.voiceRegenerate')}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => onUpdateAsset?.(index, { audioMuted: !row.audioMuted })}
                  className={`p-1 rounded transition-colors ${row.audioMuted ? 'bg-red-600/30 text-red-400 hover:bg-red-600/50' : 'hover:bg-red-900/50 hover:text-red-400'}`}
                  style={row.audioMuted ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  title={row.audioMuted ? t('result.voiceMuted') : t('result.voiceMute')}
                >
                  {row.audioMuted ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={() => onRegenerateAudio?.(index)}
              className="p-2 rounded-full border hover:bg-[var(--bg-hover)] transition-colors"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              title={t('result.voiceRegenerate', '음성 생성')}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-1h8M12 4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3z" /></svg>
            </button>
            <span className="text-[6px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>VO</span>
          </div>
        )}
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

const ResultTable = React.memo<ResultTableProps>(({
  data,
  editingIndex,
  onEditToggle,
  onUpdateAsset,
  onRegenerateAudio,
  onReorderScenes,
  onDeleteScene,
  onAddScene,
  onDuplicateScene,
  onRegenerateFailedScenes,
  onUploadSceneImage,
  onSetCustomDuration,
  onSetZoomEffect,
  onSetTransition,
  onSetDefaultTransition,
  onAutoZoom,
  onRegenerateImage,
  onExportVideo,
  userPlan = 'free',
  onGenerateAnimation,
  isExporting,
  animatingIndices,
  bgmData,
  bgmVolume = 0.25,
  onBgmChange,
  onBgmVolumeChange,
  bgmDuckingEnabled,
  bgmDuckingAmount,
  onBgmDuckingToggle,
  onBgmDuckingAmountChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenThumbnail,
  onSaveProject,
}) => {
  const { t } = useTranslation();
  const dragIndexRef = useRef<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // 자막 설정 상태
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [subtitlePos, setSubtitlePos] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [subtitleFontSize, setSubtitleFontSize] = useState(DEFAULT_SUBTITLE_CONFIG.fontSize);
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(75);
  const [subtitleTextColor, setSubtitleTextColor] = useState('#FFFFFF');
  const [sceneGap, setSceneGapState] = useState(() => {
    const saved = localStorage.getItem('tubegen_scene_gap');
    return saved ? parseFloat(saved) : 0.3;
  });
  const setSceneGap = useCallback((v: number) => {
    setSceneGapState(v);
    localStorage.setItem('tubegen_scene_gap', String(v));
  }, []);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionTier>(getVideoResolution());
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [autoZoomPattern, setAutoZoomPattern] = useState('');
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showMobileSaveMenu, setShowMobileSaveMenu] = useState(false);
  const [expandedCardPrompt, setExpandedCardPrompt] = useState<number | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // 스크롤 시 저장 메뉴 닫기
  useEffect(() => {
    if (!showSaveMenu) return;
    const close = () => setShowSaveMenu(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [showSaveMenu]);

  const handleResolutionChange = (res: ResolutionTier) => {
    if (!canAccessResolution(userPlan, res)) return;
    setSelectedResolution(res);
    setVideoResolution(res);
  };

  const currentSubtitleConfig: Partial<SubtitleConfig> = {
    position: subtitlePos,
    fontSize: subtitleFontSize,
    backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity / 100})`,
    textColor: subtitleTextColor,
  };

  const failedScenesCount = data.filter(d => d.status === 'error').length;

  const handleDragStart = useCallback((idx: number) => { dragIndexRef.current = idx; }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((toIdx: number) => {
    if (dragIndexRef.current !== null && dragIndexRef.current !== toIdx) {
      onReorderScenes?.(dragIndexRef.current, toIdx);
    }
    dragIndexRef.current = null;
  }, [onReorderScenes]);
  const handleDragEnd = useCallback(() => { dragIndexRef.current = null; }, []);

  const handleConfirmDeleteToggle = useCallback((idx: number | null) => {
    setConfirmDeleteIndex(idx);
    if (idx !== null) {
      // 3초 후 자동 취소
      setTimeout(() => setConfirmDeleteIndex(prev => prev === idx ? null : prev), 3000);
    }
  }, []);

  const handleSaveProject = useCallback(async () => {
    if (!onSaveProject || savingProject) return;
    setSavingProject(true);
    setSaveSuccess(false);
    try {
      await onSaveProject();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch {} finally {
      setSavingProject(false);
    }
  }, [onSaveProject, savingProject]);

  if (data.length === 0) return null;

  return (
    <>
    {/* ═══ 저장 메뉴 포탈 (최상위 레벨) ═══ */}
    {showSaveMenu && (
      <>
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowSaveMenu(false)} />
        <div className="fixed z-[9999] w-60 rounded-xl border shadow-2xl py-1.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            top: saveButtonRef.current ? saveButtonRef.current.getBoundingClientRect().bottom + 6 : 0,
            right: saveButtonRef.current ? window.innerWidth - saveButtonRef.current.getBoundingClientRect().right : 0,
          }}>
          <button onClick={async () => { await exportAssetsToZip(data, `스토리보드_${new Date().toLocaleDateString('ko-KR')}`); setShowSaveMenu(false); }}
            className="w-full px-4 py-3 text-left text-sm font-bold flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors text-brand-400">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            {t('result.saveAll', '전체 저장 (엑셀+이미지+SRT)')}
          </button>
          <button onClick={async () => { await downloadSrt(data, `subtitles_${Date.now()}.srt`); setShowSaveMenu(false); }}
            className="w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors"
            style={{ color: 'var(--text-primary)' }}>
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            SRT
          </button>
          <div className="my-1 border-t" style={{ borderColor: 'var(--border-default)' }} />
          <button onClick={() => { onExportVideo?.(false, currentSubtitleConfig, sceneGap, selectedResolution); setShowSaveMenu(false); }}
            disabled={isExporting}
            className="w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
            style={{ color: 'var(--text-primary)' }}>
            {isExporting
              ? <div className="w-4 h-4 border-2 border-t-transparent animate-spin rounded-full flex-shrink-0" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
              : <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            {t('result.mp4NoSub')}
          </button>
          <button onClick={() => { onExportVideo?.(true, currentSubtitleConfig, sceneGap, selectedResolution); setShowSaveMenu(false); }}
            disabled={isExporting}
            className="w-full px-4 py-2.5 text-left text-xs font-bold flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 text-brand-400">
            {isExporting
              ? <div className="w-4 h-4 border-2 border-t-transparent animate-spin rounded-full flex-shrink-0" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
              : <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            {t('result.mp4WithSub')}
          </button>
        </div>
      </>
    )}
    <div className="w-full max-w-[98%] mx-auto pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ═══ 모바일 미니 툴바 (md 미만) ═══ */}
      <div className="md:hidden mb-4 backdrop-blur-md rounded-2xl border px-3 py-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)', borderColor: 'var(--border-default)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={onUndo} disabled={!canUndo}
              className={`h-10 w-10 rounded-lg flex items-center justify-center ${canUndo ? 'active:bg-[var(--bg-hover)]' : 'opacity-30'}`}
              style={{ color: 'var(--text-secondary)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
            </button>
            <button onClick={onRedo} disabled={!canRedo}
              className={`h-10 w-10 rounded-lg flex items-center justify-center ${canRedo ? 'active:bg-[var(--bg-hover)]' : 'opacity-30'}`}
              style={{ color: 'var(--text-secondary)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
            </button>
            {failedScenesCount > 0 && (
              <button onClick={onRegenerateFailedScenes}
                className="h-10 px-2.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-semibold flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {failedScenesCount}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenThumbnail && (
              <button onClick={onOpenThumbnail} className="h-10 w-10 rounded-lg flex items-center justify-center border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </button>
            )}
            <button onClick={() => setShowPreview(!showPreview)}
              className={`h-10 w-10 rounded-lg flex items-center justify-center border ${showPreview ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            {onSaveProject && (
              <button onClick={handleSaveProject} disabled={savingProject}
                className={`h-10 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
                  saveSuccess ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : savingProject ? 'opacity-60 cursor-wait border-brand-500/40'
                  : ''
                }`}
                style={saveSuccess || savingProject ? undefined : { backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                {savingProject ? (
                  <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent animate-spin rounded-full" />
                ) : saveSuccess ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                )}
                {savingProject ? '저장중' : saveSuccess ? '완료' : '저장'}
              </button>
            )}
            <button onClick={() => setShowMobileSettings(true)}
              className="h-10 w-10 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button onClick={() => setShowMobileSaveMenu(true)}
              className="h-10 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-brand-600 text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 모바일 설정 바텀시트 ═══ */}
      {showMobileSettings && (
        <>
          <div className="md:hidden fixed inset-0 z-[9990] bg-black/50" onClick={() => setShowMobileSettings(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[9991] rounded-t-2xl border-t max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>설정</span>
              <button onClick={() => setShowMobileSettings(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-5">
              {/* BGM 볼륨/덕킹 */}
              {bgmData && (
                <div>
                  <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>BGM 볼륨</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} step={5} value={Math.round(bgmVolume * 100)} onChange={(e) => onBgmVolumeChange?.(Number(e.target.value) / 100)} className="flex-1 accent-purple-500" />
                    <span className="text-xs text-purple-400 w-8">{Math.round(bgmVolume * 100)}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={bgmDuckingEnabled ?? false} onChange={(e) => onBgmDuckingToggle?.(e.target.checked)} className="accent-purple-500 w-3 h-3" />
                      <span className="text-xs text-purple-400">덕킹</span>
                    </label>
                    {bgmDuckingEnabled && (
                      <>
                        <input type="range" min={10} max={50} step={5} value={Math.round((bgmDuckingAmount ?? 0.3) * 100)} onChange={(e) => onBgmDuckingAmountChange?.(Number(e.target.value) / 100)} className="flex-1 accent-purple-500" />
                        <span className="text-xs text-purple-400 w-8">{Math.round((bgmDuckingAmount ?? 0.3) * 100)}%</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* 해상도 */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>{t('result.resolutionDesc', '해상도')}</label>
                <select value={selectedResolution} onChange={(e) => { const v = e.target.value as ResolutionTier; if (canAccessResolution(userPlan, v)) handleResolutionChange(v); }}
                  className="w-full h-11 px-3 rounded-lg text-sm font-bold border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                  {(Object.keys(VIDEO_RESOLUTIONS) as ResolutionTier[]).map((key) => {
                    const res = VIDEO_RESOLUTIONS[key]; const ok = canAccessResolution(userPlan, key);
                    return <option key={key} value={key} disabled={!ok}>{key.toUpperCase()} {!ok ? `(${res.planLabel})` : ''}</option>;
                  })}
                </select>
              </div>
              {/* 컷 신 전체 반영 */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>컷 신 전체 반영</label>
                <select onChange={(e) => { onAutoZoom?.(e.target.value || 'alternating'); setAutoZoomPattern(e.target.value); }} value={autoZoomPattern}
                  className="w-full h-11 px-3 rounded-lg text-sm border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <option value="">{t('result.autoZoom')}</option>
                  <option value="alternating">{t('result.autoZoomAlternating')}</option>
                  <option value="dynamic">{t('result.autoZoomDynamic')}</option>
                  <option value="sentiment">{t('result.autoZoomSentiment')}</option>
                  <option value="static">{t('result.autoZoomStatic')}</option>
                </select>
              </div>
              {/* 자막 설정 */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleSettings')}</label>
                <div className="flex gap-1.5 mb-2">
                  {(['top', 'center', 'bottom'] as const).map(pos => (
                    <button key={pos} onClick={() => setSubtitlePos(pos)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold ${subtitlePos === pos ? 'bg-brand-600 text-white' : ''}`}
                      style={subtitlePos === pos ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      {pos === 'top' ? t('result.subtitleTop') : pos === 'center' ? t('result.subtitleCenter') : t('result.subtitleBottom')}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleSize')}</span>
                  <input type="range" min={20} max={72} step={2} value={subtitleFontSize} onChange={(e) => setSubtitleFontSize(Number(e.target.value))} className="flex-1 accent-brand-500" />
                  <span className="text-xs w-6 text-right" style={{ color: 'var(--text-secondary)' }}>{subtitleFontSize}</span>
                </div>
              </div>
              {/* 씬 전환 */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>{t('result.defaultTransition')}</label>
                <select onChange={(e) => onSetDefaultTransition?.(e.target.value)} defaultValue="none"
                  className="w-full h-11 px-3 rounded-lg text-sm border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <option value="none">{t('result.noTransition')}</option>
                  <option value="crossfade">{t('result.crossfade')}</option>
                  <option value="fadeBlack">{t('result.fadeBlack')}</option>
                  <option value="wipeLeft">{t('result.wipeLeft')}</option>
                  <option value="wipeRight">{t('result.wipeRight')}</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ 모바일 저장 바텀시트 ═══ */}
      {showMobileSaveMenu && (
        <>
          <div className="md:hidden fixed inset-0 z-[9990] bg-black/50" onClick={() => setShowMobileSaveMenu(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[9991] rounded-t-2xl border-t" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('common.save')}</span>
              <button onClick={() => setShowMobileSaveMenu(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="py-2">
              <button onClick={async () => { await exportAssetsToZip(data, `스토리보드_${new Date().toLocaleDateString('ko-KR')}`); setShowMobileSaveMenu(false); }}
                className="w-full px-5 py-4 text-left text-sm font-bold flex items-center gap-3 active:bg-[var(--bg-hover)] text-brand-400">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                {t('result.saveAll', '전체 저장 (엑셀+이미지+SRT)')}
              </button>
              <button onClick={() => { exportAssetsToZip(data, `스토리보드_${new Date().toLocaleDateString('ko-KR')}`); setShowMobileSaveMenu(false); }}
                className="w-full px-5 py-3.5 text-left text-sm font-semibold flex items-center gap-3 active:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {t('result.excelImages')}
              </button>
              <button onClick={async () => { await downloadSrt(data, `subtitles_${Date.now()}.srt`); setShowMobileSaveMenu(false); }}
                className="w-full px-5 py-3.5 text-left text-sm font-semibold flex items-center gap-3 active:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                SRT
              </button>
              <div className="my-1 border-t mx-4" style={{ borderColor: 'var(--border-default)' }} />
              <button onClick={() => { onExportVideo?.(false, currentSubtitleConfig, sceneGap, selectedResolution); setShowMobileSaveMenu(false); }}
                disabled={isExporting}
                className="w-full px-5 py-3.5 text-left text-sm font-semibold flex items-center gap-3 active:bg-[var(--bg-hover)] disabled:opacity-40" style={{ color: 'var(--text-primary)' }}>
                {isExporting
                  ? <div className="w-5 h-5 border-2 border-t-transparent animate-spin rounded-full flex-shrink-0" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
                  : <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                {t('result.mp4NoSub')}
              </button>
              <button onClick={() => { onExportVideo?.(true, currentSubtitleConfig, sceneGap, selectedResolution); setShowMobileSaveMenu(false); }}
                disabled={isExporting}
                className="w-full px-5 py-3.5 text-left text-sm font-bold flex items-center gap-3 active:bg-[var(--bg-hover)] disabled:opacity-40 text-brand-400">
                {isExporting
                  ? <div className="w-5 h-5 border-2 border-t-transparent animate-spin rounded-full flex-shrink-0" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
                  : <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                {t('result.mp4WithSub')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ 데스크톱 헤더 툴바 (md 이상) ═══ */}
      <div className="hidden md:block mb-6 backdrop-blur-md rounded-2xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)', borderColor: 'var(--border-default)' }}>

        {/* 메인 툴바 (한 줄, 우측 정렬, 통일 높이 h-8) */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 flex-wrap">
          {/* Undo/Redo */}
          <button onClick={onUndo} disabled={!canUndo}
            className={`h-8 w-8 rounded-lg transition-all flex items-center justify-center ${canUndo ? 'hover:bg-[var(--bg-hover)]' : 'opacity-30 cursor-not-allowed'}`}
            style={{ color: 'var(--text-secondary)' }}
            title={t('result.undoShortcut')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
          </button>
          <button onClick={onRedo} disabled={!canRedo}
            className={`h-8 w-8 rounded-lg transition-all flex items-center justify-center ${canRedo ? 'hover:bg-[var(--bg-hover)]' : 'opacity-30 cursor-not-allowed'}`}
            style={{ color: 'var(--text-secondary)' }}
            title={t('result.redoShortcut')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
          </button>

          {/* 실패 씬 재생성 */}
          {failedScenesCount > 0 && (
            <button onClick={onRegenerateFailedScenes}
              className="h-8 px-2.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-all flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {failedScenesCount}
            </button>
          )}

          <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />

          {/* 썸네일 생성 — 미리보기 왼쪽 */}
          {onOpenThumbnail && (
            <button onClick={onOpenThumbnail}
              title={t('result.thumbnailDesc', 'YouTube, Instagram 등 플랫폼별 썸네일 생성')}
              className="h-8 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border hover:bg-[var(--bg-hover)] border-[var(--border-subtle)]"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              {t('thumbnailButton', '썸네일')}
            </button>
          )}

          {/* 미리보기 — 항상 눈에 띄는 emerald 색상 */}
          <button onClick={() => setShowPreview(!showPreview)}
            className={`h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              showPreview ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={t('result.previewDesc')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {t('result.preview')}
          </button>

          <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />

          {/* 이미지 효과 */}
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <select
              onChange={(e) => { onAutoZoom?.(e.target.value || 'alternating'); setAutoZoomPattern(e.target.value); }}
              value={autoZoomPattern}
              title={t('result.autoZoomDesc', '전체 씬에 줌/팬 효과 일괄 적용')}
              className="h-8 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <option value="" style={{ backgroundColor: '#1a1a2e' }}>{t('result.autoZoom')}</option>
              <option value="alternating" style={{ backgroundColor: '#1a1a2e' }}>{t('result.autoZoomAlternating')}</option>
              <option value="dynamic" style={{ backgroundColor: '#1a1a2e' }}>{t('result.autoZoomDynamic')}</option>
              <option value="sentiment" style={{ backgroundColor: '#1a1a2e' }}>{t('result.autoZoomSentiment')}</option>
              <option value="static" style={{ backgroundColor: '#1a1a2e' }}>{t('result.autoZoomStatic')}</option>
            </select>
          </div>

          {/* BGM 볼륨/덕킹 (드롭다운 제거, 볼륨/덕킹만) */}
          {bgmData && (
            <>
              <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 flex-shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(bgmVolume * 100)}
                  onChange={(e) => onBgmVolumeChange?.(Number(e.target.value) / 100)}
                  className="w-16 accent-purple-500"
                  title={`BGM ${Math.round(bgmVolume * 100)}%`} />
                <span className="text-[10px] text-purple-400 font-medium">{Math.round(bgmVolume * 100)}%</span>
                <label className="flex items-center gap-1 cursor-pointer" title={t('result.bgmDucking')}>
                  <input type="checkbox" checked={bgmDuckingEnabled ?? false}
                    onChange={(e) => onBgmDuckingToggle?.(e.target.checked)}
                    className="accent-purple-500 w-3 h-3" />
                  <span className="text-[10px] text-purple-400 whitespace-nowrap">{t('result.bgmDucking')}</span>
                </label>
                {bgmDuckingEnabled && (
                  <>
                    <input type="range" min={10} max={50} step={5}
                      value={Math.round((bgmDuckingAmount ?? 0.3) * 100)}
                      onChange={(e) => onBgmDuckingAmountChange?.(Number(e.target.value) / 100)}
                      className="w-12 accent-purple-500" />
                    <span className="text-[10px] text-purple-400">{Math.round((bgmDuckingAmount ?? 0.3) * 100)}%</span>
                  </>
                )}
              </div>
            </>
          )}

          <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />

          {/* 자막 설정 */}
          <button onClick={() => setShowSubtitleSettings(!showSubtitleSettings)}
            title={t('result.subtitleSettingsDesc', '자막 위치, 크기, 색상 등 설정')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
              showSubtitleSettings ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'hover:bg-[var(--bg-hover)] border-[var(--border-subtle)]'
            }`}
            style={showSubtitleSettings ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
            {t('result.subtitleSettings')}
          </button>

          <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />

          {/* 해상도 — 아이콘 추가 */}
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <select
              title={t('result.resolutionDesc', '영상 해상도 선택')}
              value={selectedResolution}
              onChange={(e) => {
                const val = e.target.value as ResolutionTier;
                if (canAccessResolution(userPlan, val)) handleResolutionChange(val);
              }}
              className="h-8 px-2 rounded-lg text-xs font-bold border cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              {(Object.keys(VIDEO_RESOLUTIONS) as ResolutionTier[]).map((key) => {
                const res = VIDEO_RESOLUTIONS[key];
                const accessible = canAccessResolution(userPlan, key);
                return (
                  <option key={key} value={key} disabled={!accessible} style={{ backgroundColor: '#1a1a2e', color: accessible ? '#e2e8f0' : '#475569' }}>
                    {key.toUpperCase()} {!accessible ? `(${res.planLabel})` : ''}
                  </option>
                );
              })}
            </select>
            {selectedResolution === '4k' && (
              <span title={t('result.resolution4kWarning')}>
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            )}
          </div>

          <div className="w-px h-5" style={{ backgroundColor: 'var(--border-default)' }} />

          {/* 프로젝트 저장 */}
          {onSaveProject && (
            <button onClick={handleSaveProject} disabled={savingProject}
              className={`h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md ${
                saveSuccess ? 'bg-green-600 text-white shadow-green-900/20'
                : savingProject ? 'bg-amber-600 text-white opacity-80 cursor-wait shadow-amber-900/20'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/20'
              }`}>
              {savingProject ? (
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent animate-spin rounded-full" />
              ) : saveSuccess ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              )}
              {savingProject ? '저장 중...' : saveSuccess ? '저장 완료' : '프로젝트 저장'}
            </button>
          )}

          {/* 저장 드롭다운 */}
          <div>
            <button
              ref={saveButtonRef}
              onClick={() => setShowSaveMenu(!showSaveMenu)}
              title={t('result.saveDesc', '엑셀, SRT, MP4 내보내기')}
              className="h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-brand-600 text-white hover:bg-brand-500 shadow-md shadow-brand-900/20">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {t('common.save')}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
        {/* 자막 설정 패널 (접힘식) */}
        {showSubtitleSettings && (
          <div className="px-5 pb-4 pt-1 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)' }}>
            <div className="flex flex-wrap items-center gap-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitlePosition')}</span>
                <div className="flex gap-1">
                  {(['top', 'center', 'bottom'] as const).map(pos => (
                    <button key={pos} onClick={() => setSubtitlePos(pos)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${subtitlePos === pos ? 'bg-brand-600 text-white' : 'hover:bg-[var(--bg-hover)] border'}`}
                      style={subtitlePos === pos ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
                      {pos === 'top' ? t('result.subtitleTop') : pos === 'center' ? t('result.subtitleCenter') : t('result.subtitleBottom')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleSize')}</span>
                <input type="range" min={20} max={72} step={2} value={subtitleFontSize} onChange={(e) => setSubtitleFontSize(Number(e.target.value))} className="w-24 accent-brand-500" />
                <span className="text-[11px] w-6 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{subtitleFontSize}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleBg')}</span>
                <input type="range" min={0} max={100} step={5} value={subtitleBgOpacity} onChange={(e) => setSubtitleBgOpacity(Number(e.target.value))} className="w-24 accent-brand-500" />
                <span className="text-[11px] w-9 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{subtitleBgOpacity}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleColor')}</span>
                <div className="flex gap-1.5">
                  {[{ color: '#FFFFFF', labelKey: 'result.white' }, { color: '#FFFF00', labelKey: 'result.yellow' }, { color: '#00FFFF', labelKey: 'result.cyan' }, { color: '#FFB347', labelKey: 'result.orange' }].map(({ color, labelKey }) => (
                    <button key={color} onClick={() => setSubtitleTextColor(color)} title={t(labelKey)}
                      className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${subtitleTextColor === color ? 'border-brand-400 scale-110' : 'border-[var(--text-muted)]'}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <div className="px-3 py-1 rounded text-xs font-bold"
                style={{ backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity / 100})`, color: subtitleTextColor, fontSize: `${Math.max(11, Math.round(subtitleFontSize / 3))}px`, border: '1px solid rgba(255,255,255,0.1)' }}>
                {t('result.subtitlePreview')}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 30%, transparent)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('result.sceneGap')}</span>
                <input type="range" min={0} max={1.5} step={0.1} value={sceneGap} onChange={(e) => setSceneGap(Number(e.target.value))} className="w-28 accent-brand-500" />
                <span className="text-[11px] w-10 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{sceneGap.toFixed(1)}초</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('result.defaultTransition')}</span>
                <select onChange={(e) => onSetDefaultTransition?.(e.target.value)} defaultValue="none"
                  className="px-2 py-1 rounded-lg border text-xs font-semibold cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <option value="none" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>{t('result.noTransition')}</option>
                  <option value="crossfade" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>{t('result.crossfade')}</option>
                  <option value="fadeBlack" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>{t('result.fadeBlack')}</option>
                  <option value="wipeLeft" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>{t('result.wipeLeft')}</option>
                  <option value="wipeRight" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>{t('result.wipeRight')}</option>
                </select>
              </div>
              {sceneGap === 0 && <span className="text-[11px] text-amber-500 font-medium">{t('result.sceneGapWarning')}</span>}
            </div>
          </div>
        )}
      </div>

      {/* 미리보기 플레이어 */}
      {showPreview && (
        <PreviewPlayer
          assets={data}
          subtitleConfig={currentSubtitleConfig}
          sceneGap={sceneGap}
          bgmData={bgmData}
          bgmVolume={bgmVolume}
          bgmDuckingEnabled={bgmDuckingEnabled}
          bgmDuckingAmount={bgmDuckingAmount}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ═══ 모바일 카드 리스트 (md 미만) ═══ */}
      <div className="md:hidden space-y-3 px-1">
        {data.map((row, index) => {
          const isAnimating = animatingIndices?.has(index) || false;
          const isEditing = editingIndex === index;
          const confirmDelete = confirmDeleteIndex === index;
          const effectiveDuration = row.customDuration ?? (row.audioDuration ? Math.round(row.audioDuration * 10) / 10 : 3);
          const isPromptExpanded = expandedCardPrompt === index;

          return (
            <div key={`mobile-${row.sceneNumber}`} data-mobile-card={index} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 40%, transparent)', borderColor: 'var(--border-default)' }}>
              {/* 카드 헤더: 씬번호 + 액션 */}
              <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)' }}>
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-muted)' }}>#{row.sceneNumber.toString().padStart(2, '0')}</span>
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <button onClick={() => {
                        const card = document.querySelector(`[data-mobile-card="${index}"]`);
                        const narEl = card?.querySelector<HTMLTextAreaElement>('[data-mobile-narration]');
                        const promptEl = card?.querySelector<HTMLTextAreaElement>('[data-mobile-prompt]');
                        onUpdateAsset?.(index, {
                          narration: narEl?.value ?? row.narration,
                          visualPrompt: promptEl?.value ?? row.visualPrompt,
                        });
                      }} className="h-9 px-2.5 bg-green-600 text-white text-xs font-bold rounded-lg">✓</button>
                      <button onClick={() => onEditToggle?.(null)} className="h-9 px-2.5 rounded-lg text-xs font-bold" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>✗</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onEditToggle?.(index)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }} title={t('result.editScene')}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => onDuplicateScene?.(index)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      <button onClick={() => onAddScene?.(index)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                      <button onClick={() => { if (confirmDelete) { onDeleteScene?.(index); handleConfirmDeleteToggle(null); } else { handleConfirmDeleteToggle(index); } }}
                        className={`h-9 w-9 rounded-lg flex items-center justify-center ${confirmDelete ? 'bg-red-600 text-white' : ''}`}
                        style={confirmDelete ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      {/* 위/아래 이동 */}
                      {index > 0 && (
                        <button onClick={() => onReorderScenes?.(index, index - 1)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                      )}
                      {index < data.length - 1 && (
                        <button onClick={() => onReorderScenes?.(index, index + 1)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 카드 바디: 이미지 + 나레이션 */}
              <div className="flex gap-3 p-3">
                {/* 이미지 */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border relative" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-default)' }}>
                  {row.status === 'generating' || isAnimating ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent animate-spin rounded-full" />
                    </div>
                  ) : row.status === 'error' ? (
                    <div className="w-full h-full flex items-center justify-center bg-red-950/30">
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                  ) : row.videoData ? (
                    <video src={row.videoData} className="w-full h-full object-cover" muted playsInline />
                  ) : row.imageData ? (
                    <img src={`data:${getImageMime(row.imageData!)};base64,${row.imageData}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                  {row.videoData && <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded bg-cyan-500/80 text-[5px] font-black text-white uppercase">V</div>}
                </div>
                {/* 나레이션 */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea data-mobile-narration defaultValue={row.narration} rows={3} className="w-full text-sm rounded-lg p-2 border resize-y" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }} placeholder={t('result.narration')} />
                      <textarea data-mobile-prompt defaultValue={row.visualPrompt} rows={3} className="w-full text-xs rounded-lg p-2 border resize-y font-mono" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)', outline: 'none' }} placeholder="Visual Prompt" />
                    </div>
                  ) : (
                  <p className="text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--text-primary)' }}>
                    {row.narration || <span className="italic text-xs" style={{ color: 'var(--text-muted)' }}>{t('result.noNarration')}</span>}
                  </p>
                  )}
                  {row.analysis?.composition_type && (
                    <div className="flex gap-1 mt-1">
                      <span className={`text-[7px] font-black px-1 py-0.5 rounded border uppercase ${row.analysis.composition_type === 'MACRO' ? 'text-brand-400 bg-brand-400/5 border-brand-400/20' : row.analysis.composition_type === 'STANDARD' ? 'text-emerald-400 bg-emerald-400/5 border-emerald-400/20' : 'text-amber-400 bg-amber-400/5 border-amber-400/20'}`}>{row.analysis.composition_type}</span>
                      {row.analysis.sentiment && <span className={`text-[7px] font-black px-1 py-0.5 rounded border uppercase ${row.analysis.sentiment === 'POSITIVE' ? 'text-green-400 bg-green-400/5 border-green-400/20' : row.analysis.sentiment === 'NEGATIVE' ? 'text-red-400 bg-red-400/5 border-red-400/20' : 'text-gray-400 bg-gray-400/5 border-gray-400/20'}`}>{row.analysis.sentiment}</span>}
                    </div>
                  )}
                  {/* 모바일 디렉티브 태그 + 편집 */}
                  <DirectiveTags
                    directives={row.analysis?.directives}
                    onEditDirectives={onUpdateAsset ? (newDirs) => {
                      onUpdateAsset(index, {
                        analysis: { ...row.analysis!, directives: newDirs },
                      });
                    } : undefined}
                  />
                </div>
              </div>

              {/* 이미지 액션: 재생성 / 업로드 / 영상변환 */}
              {(row.imageData || row.status === 'error') && !isAnimating && row.status !== 'generating' && (
                <div className="flex items-center gap-1.5 px-3 pb-2">
                  <button onClick={() => onRegenerateImage?.(index)}
                    className="h-8 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 border"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {t('result.regenerate', '재생성')}
                  </button>
                  {row.imageData && (
                    <button onClick={() => onGenerateAnimation?.(index)}
                      className="h-8 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {row.videoData ? t('result.regenerateVideo', '영상재생성') : t('result.convertVideo', '영상변환')}
                    </button>
                  )}
                </div>
              )}

              {/* 프롬프트 (접기/펼치기) */}
              {row.visualPrompt && (
                <div className="px-3 pb-2">
                  <button onClick={() => setExpandedCardPrompt(isPromptExpanded ? null : index)}
                    className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {isPromptExpanded ? '▾ prompt' : '▸ prompt'}
                  </button>
                  {isPromptExpanded && (
                    <div className="mt-1 rounded-lg p-2 border text-[10px] font-mono leading-tight whitespace-pre-wrap" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 30%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 50%, transparent)', color: 'var(--text-muted)' }}>
                      {row.visualPrompt}
                    </div>
                  )}
                </div>
              )}

              {/* 카드 푸터: 재생시간 + 효과 + 오디오 */}
              <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>⏱</span>
                  <input type="number" min={1} max={60} step={0.5} value={effectiveDuration}
                    onChange={(e) => onSetCustomDuration?.(index, Math.max(1, Math.min(60, Number(e.target.value))))}
                    className="w-12 border rounded px-1 py-0.5 text-xs text-center" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>s</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {(['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'none'] as const).map(id => (
                    <button key={id} onClick={() => onSetZoomEffect?.(index, id)}
                      className={`w-7 h-7 rounded text-[9px] font-bold ${(row.zoomEffect || 'zoomIn') === id ? 'bg-brand-600 text-white' : ''}`}
                      style={(row.zoomEffect || 'zoomIn') === id ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {id === 'zoomIn' ? '↗' : id === 'zoomOut' ? '↙' : id === 'panLeft' ? '←' : id === 'panRight' ? '→' : '•'}
                    </button>
                  ))}
                </div>
                {row.audioData ? (
                  <div className="flex items-center gap-1">
                    <AudioPlayer base64={row.audioData} />
                    <button onClick={() => onRegenerateAudio?.(index)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                      title={t('result.voiceRegenerate')}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                    <button onClick={() => onUpdateAsset?.(index, { audioMuted: !row.audioMuted })}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center ${row.audioMuted ? 'bg-red-600/30 text-red-400' : ''}`}
                      style={row.audioMuted ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {row.audioMuted
                        ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                    </button>
                  </div>
                ) : (
                  <div className="w-8 h-8 flex items-center justify-center opacity-30">
                    <div className="w-3 h-3 border-2 animate-spin rounded-full" style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--text-muted)' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* 모바일 씬 추가 버튼 */}
        <button onClick={() => onAddScene?.()}
          className="w-full py-3 flex items-center justify-center gap-2 rounded-xl border" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          <span className="text-xs font-bold">{t('result.addEmptyScene')}</span>
        </button>
      </div>

      {/* ═══ 데스크톱 테이블 (md 이상) ═══ */}
      <div className="hidden md:block overflow-hidden rounded-3xl border backdrop-blur-sm" style={{ borderColor: 'var(--border-default)', backgroundColor: 'color-mix(in srgb, var(--bg-surface) 20%, transparent)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px] table-fixed">
            <thead className="border-b" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)', borderColor: 'var(--border-default)' }}>
              <tr>
                <th className="py-4 px-3 text-xs font-black uppercase tracking-widest w-16 text-center" style={{ color: 'var(--text-muted)' }}>{t('result.order')}</th>
                <th className="py-4 px-6 text-xs font-black uppercase tracking-widest w-[30%]" style={{ color: 'var(--text-muted)' }}>{t('result.narration')}</th>
                <th className="py-4 px-6 text-xs font-black uppercase tracking-widest w-[30%]" style={{ color: 'var(--text-muted)' }}>{t('result.visualPrompt')}</th>
                <th className="py-4 px-6 text-xs font-black uppercase tracking-widest w-56 text-center" style={{ color: 'var(--text-muted)' }}>{t('result.generatedAssets')}</th>
                <th className="py-4 px-6 text-xs font-black uppercase tracking-widest w-20 text-center" style={{ color: 'var(--text-muted)' }}>{t('result.voice')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ '--tw-divide-color': 'color-mix(in srgb, var(--border-default) 40%, transparent)' } as React.CSSProperties}>
              {data.map((row, index) => (
                <TableRow
                  key={`scene-${row.sceneNumber}`}
                  row={row}
                  index={index}
                  isAnimating={animatingIndices?.has(index) || false}
                  isEditing={editingIndex === index}
                  confirmDelete={confirmDeleteIndex === index}
                  isSelected={selectedIndices?.has(index) || false}
                  onToggleSelect={onToggleSelect}
                  onRegenerateImage={onRegenerateImage}
                  onGenerateAnimation={onGenerateAnimation}
                  onEditToggle={onEditToggle}
                  onUpdateAsset={onUpdateAsset}
                  onRegenerateAudio={onRegenerateAudio}
                  onDeleteScene={onDeleteScene}
                  onAddScene={onAddScene}
                  onDuplicateScene={onDuplicateScene}
                  onUploadSceneImage={onUploadSceneImage}
                  onSetCustomDuration={onSetCustomDuration}
                  onSetZoomEffect={onSetZoomEffect}
                  onSetTransition={onSetTransition}
                  onConfirmDeleteToggle={handleConfirmDeleteToggle}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* 맨 아래 씬 추가 버튼 */}
        <div className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)' }}>
          <button
            onClick={() => onAddScene?.()}
            className="w-full py-3 flex items-center justify-center gap-2 hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--bg-elevated)_30%,transparent)] transition-all text-[10px] font-bold"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('result.addEmptyScene')}
          </button>
        </div>
      </div>

      {/* V2.0 디렉티브 검증 패널 */}
      <DirectiveDebugPanel assets={data} />
    </div>
    </>
  );
});
ResultTable.displayName = 'ResultTable';

export default ResultTable;
