
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { GeneratedAsset, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG } from '../types';
import { getVideoOrientation, ResolutionTier, getVideoResolution, setVideoResolution } from '../config';
import SceneToolbar from './SceneToolbar';
import SceneCard from './SceneCard';
import PreviewPlayer from './PreviewPlayer';

interface ResultCardsProps {
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
}

const ResultCards: React.FC<ResultCardsProps> = ({
  data,
  editingIndex,
  onEditToggle,
  onUpdateAsset,
  onRegenerateAudio,
  onReorderScenes,
  onDeleteScene,
  onAddScene,
  onUploadSceneImage,
  onSetCustomDuration,
  onSetZoomEffect,
  onSetTransition,
  onSetDefaultTransition,
  onAutoZoom,
  onRegenerateImage,
  onExportVideo,
  userPlan,
  onGenerateAnimation,
  onDuplicateScene,
  onRegenerateFailedScenes,
  isExporting,
  animatingIndices,
  bgmData,
  bgmVolume,
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
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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
  const [selectedResolution, setSelectedResolution] = useState<ResolutionTier>(getVideoResolution());
  const [autoZoomPattern, setAutoZoomPattern] = useState('');
  const dragIndexRef = useRef<number | null>(null);

  // When editingIndex changes to non-null, force expandedIndex to same value
  useEffect(() => {
    if (editingIndex != null) {
      setExpandedIndex(editingIndex);
    }
  }, [editingIndex]);

  // confirmDeleteIndex with 3-second auto-cancel timeout
  useEffect(() => {
    if (confirmDeleteIndex == null) return;
    const timer = setTimeout(() => setConfirmDeleteIndex(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteIndex]);

  const handleConfirmDeleteToggle = useCallback((index: number | null) => {
    setConfirmDeleteIndex(index);
  }, []);

  const handleExpandToggle = useCallback((index: number | null) => {
    setExpandedIndex(prev => prev === index ? null : index);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((index: number) => {
    const from = dragIndexRef.current;
    if (from != null && from !== index) {
      onReorderScenes?.(from, index);
    }
    dragIndexRef.current = null;
  }, [onReorderScenes]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  const isPortrait = getVideoOrientation() === 'portrait';
  const failedScenesCount = data.filter(d => d.status === 'error').length;

  const currentSubtitleConfig: Partial<SubtitleConfig> = {
    position: subtitlePos,
    fontSize: subtitleFontSize,
    bgOpacity: subtitleBgOpacity / 100,
    textColor: subtitleTextColor,
  };

  if (data.length === 0) return null;

  return (
    <div className="w-full max-w-[98%] mx-auto pb-32">
      <SceneToolbar
        data={data}
        failedScenesCount={failedScenesCount}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview(!showPreview)}
        subtitlePos={subtitlePos}
        onSubtitlePosChange={setSubtitlePos}
        subtitleFontSize={subtitleFontSize}
        onSubtitleFontSizeChange={setSubtitleFontSize}
        subtitleBgOpacity={subtitleBgOpacity}
        onSubtitleBgOpacityChange={setSubtitleBgOpacity}
        subtitleTextColor={subtitleTextColor}
        onSubtitleTextColorChange={setSubtitleTextColor}
        sceneGap={sceneGap}
        onSceneGapChange={setSceneGap}
        selectedResolution={selectedResolution}
        onResolutionChange={(v) => {
          setSelectedResolution(v);
          setVideoResolution(v);
        }}
        autoZoomPattern={autoZoomPattern}
        onAutoZoomPatternChange={setAutoZoomPattern}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onRegenerateFailedScenes={onRegenerateFailedScenes}
        onOpenThumbnail={onOpenThumbnail}
        onSaveProject={onSaveProject}
        onAutoZoom={onAutoZoom}
        onSetDefaultTransition={onSetDefaultTransition}
        onExportVideo={onExportVideo}
        isExporting={isExporting}
        userPlan={userPlan}
        bgmData={bgmData}
        bgmVolume={bgmVolume}
        bgmDuckingEnabled={bgmDuckingEnabled}
        bgmDuckingAmount={bgmDuckingAmount}
        onBgmVolumeChange={onBgmVolumeChange}
        onBgmDuckingToggle={onBgmDuckingToggle}
        onBgmDuckingAmountChange={onBgmDuckingAmountChange}
      />

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

      <div className="space-y-3">
        {data.map((row, index) => (
          <SceneCard
            key={`scene-${row.sceneNumber}`}
            row={row}
            index={index}
            isPortrait={isPortrait}
            isAnimating={animatingIndices?.has(index) || false}
            isEditing={editingIndex === index}
            isExpanded={expandedIndex === index}
            confirmDelete={confirmDeleteIndex === index}
            onRegenerateImage={onRegenerateImage}
            onGenerateAnimation={onGenerateAnimation}
            onEditToggle={onEditToggle}
            onUpdateAsset={onUpdateAsset}
            onRegenerateAudio={onRegenerateAudio}
            onDeleteScene={onDeleteScene}
            onAddScene={(afterIdx: number) => onAddScene?.(afterIdx)}
            onDuplicateScene={onDuplicateScene}
            onUploadSceneImage={onUploadSceneImage}
            onSetCustomDuration={onSetCustomDuration}
            onSetZoomEffect={onSetZoomEffect}
            onSetTransition={onSetTransition}
            onConfirmDeleteToggle={handleConfirmDeleteToggle}
            onExpandToggle={handleExpandToggle}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {data.length > 0 && (
        <button
          onClick={() => onAddScene?.(data.length - 1)}
          className="w-full mt-3 py-3 rounded-2xl border-2 border-dashed text-sm font-bold transition-all hover:border-blue-500/40 hover:text-blue-400"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)', background: 'transparent' }}
        >
          + 씬 추가
        </button>
      )}
    </div>
  );
};

ResultCards.displayName = 'ResultCards';

export default React.memo(ResultCards);
