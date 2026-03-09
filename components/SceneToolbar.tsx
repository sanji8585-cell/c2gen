import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GeneratedAsset, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG } from '../types';
import { VIDEO_RESOLUTIONS, ResolutionTier, canAccessResolution, getVideoResolution, setVideoResolution } from '../config';
import { downloadSrt } from '../services/srtService';
import { exportAssetsToZip } from '../services/exportService';

export interface SceneToolbarProps {
  data: GeneratedAsset[];
  failedScenesCount: number;
  // Preview
  showPreview: boolean;
  onTogglePreview: () => void;
  // Subtitle state
  subtitlePos: 'top' | 'center' | 'bottom';
  onSubtitlePosChange: (v: 'top' | 'center' | 'bottom') => void;
  subtitleFontSize: number;
  onSubtitleFontSizeChange: (v: number) => void;
  subtitleBgOpacity: number;
  onSubtitleBgOpacityChange: (v: number) => void;
  subtitleTextColor: string;
  onSubtitleTextColorChange: (v: string) => void;
  sceneGap: number;
  onSceneGapChange: (v: number) => void;
  selectedResolution: ResolutionTier;
  onResolutionChange: (v: ResolutionTier) => void;
  autoZoomPattern: string;
  onAutoZoomPatternChange: (v: string) => void;
  // Passthrough
  canUndo?: boolean; canRedo?: boolean;
  onUndo?: () => void; onRedo?: () => void;
  onRegenerateFailedScenes?: () => void;
  onOpenThumbnail?: () => void;
  onSaveProject?: () => void;
  onAutoZoom?: (pattern: string) => void;
  onSetDefaultTransition?: (transition: string) => void;
  onExportVideo?: (enableSubtitles: boolean, subtitleConfig?: Partial<SubtitleConfig>, sceneGap?: number, resolution?: ResolutionTier) => void;
  isExporting?: boolean;
  userPlan?: string;
  // BGM
  bgmData?: string | null;
  bgmVolume?: number;
  bgmDuckingEnabled?: boolean;
  bgmDuckingAmount?: number;
  onBgmVolumeChange?: (v: number) => void;
  onBgmDuckingToggle?: (v: boolean) => void;
  onBgmDuckingAmountChange?: (v: number) => void;
}

const SceneToolbar: React.FC<SceneToolbarProps> = ({
  data,
  failedScenesCount,
  showPreview,
  onTogglePreview,
  subtitlePos,
  onSubtitlePosChange,
  subtitleFontSize,
  onSubtitleFontSizeChange,
  subtitleBgOpacity,
  onSubtitleBgOpacityChange,
  subtitleTextColor,
  onSubtitleTextColorChange,
  sceneGap,
  onSceneGapChange,
  selectedResolution,
  onResolutionChange,
  autoZoomPattern,
  onAutoZoomPatternChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRegenerateFailedScenes,
  onOpenThumbnail,
  onSaveProject,
  onAutoZoom,
  onSetDefaultTransition,
  onExportVideo,
  isExporting,
  userPlan = 'free',
  bgmData,
  bgmVolume = 0.25,
  bgmDuckingEnabled,
  bgmDuckingAmount,
  onBgmVolumeChange,
  onBgmDuckingToggle,
  onBgmDuckingAmountChange,
}) => {
  const { t } = useTranslation();

  // Internal state
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showMobileSaveMenu, setShowMobileSaveMenu] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
    setVideoResolution(res);
    onResolutionChange(res);
  };

  const currentSubtitleConfig: Partial<SubtitleConfig> = {
    position: subtitlePos,
    fontSize: subtitleFontSize,
    backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity / 100})`,
    textColor: subtitleTextColor,
  };

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
            <button onClick={onTogglePreview}
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
                <select onChange={(e) => { onAutoZoom?.(e.target.value || 'alternating'); onAutoZoomPatternChange(e.target.value); }} value={autoZoomPattern}
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
                    <button key={pos} onClick={() => onSubtitlePosChange(pos)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold ${subtitlePos === pos ? 'bg-brand-600 text-white' : ''}`}
                      style={subtitlePos === pos ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      {pos === 'top' ? t('result.subtitleTop') : pos === 'center' ? t('result.subtitleCenter') : t('result.subtitleBottom')}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleSize')}</span>
                  <input type="range" min={20} max={72} step={2} value={subtitleFontSize} onChange={(e) => onSubtitleFontSizeChange(Number(e.target.value))} className="flex-1 accent-brand-500" />
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
          <button onClick={onTogglePreview}
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
              onChange={(e) => { onAutoZoom?.(e.target.value || 'alternating'); onAutoZoomPatternChange(e.target.value); }}
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
                    <button key={pos} onClick={() => onSubtitlePosChange(pos)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${subtitlePos === pos ? 'bg-brand-600 text-white' : 'hover:bg-[var(--bg-hover)] border'}`}
                      style={subtitlePos === pos ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
                      {pos === 'top' ? t('result.subtitleTop') : pos === 'center' ? t('result.subtitleCenter') : t('result.subtitleBottom')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleSize')}</span>
                <input type="range" min={20} max={72} step={2} value={subtitleFontSize} onChange={(e) => onSubtitleFontSizeChange(Number(e.target.value))} className="w-24 accent-brand-500" />
                <span className="text-[11px] w-6 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{subtitleFontSize}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleBg')}</span>
                <input type="range" min={0} max={100} step={5} value={subtitleBgOpacity} onChange={(e) => onSubtitleBgOpacityChange(Number(e.target.value))} className="w-24 accent-brand-500" />
                <span className="text-[11px] w-9 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{subtitleBgOpacity}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('result.subtitleColor')}</span>
                <div className="flex gap-1.5">
                  {[{ color: '#FFFFFF', labelKey: 'result.white' }, { color: '#FFFF00', labelKey: 'result.yellow' }, { color: '#00FFFF', labelKey: 'result.cyan' }, { color: '#FFB347', labelKey: 'result.orange' }].map(({ color, labelKey }) => (
                    <button key={color} onClick={() => onSubtitleTextColorChange(color)} title={t(labelKey)}
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
                <input type="range" min={0} max={1.5} step={0.1} value={sceneGap} onChange={(e) => onSceneGapChange(Number(e.target.value))} className="w-28 accent-brand-500" />
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
    </>
  );
};

export default SceneToolbar;
