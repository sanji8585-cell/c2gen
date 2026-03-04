
import React, { useRef, useState, useEffect, memo, useCallback } from 'react';
import { GeneratedAsset, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG } from '../types';
import { downloadProjectZip } from '../utils/csvHelper';
import { downloadSrt } from '../services/srtService';
import { exportAssetsToZip } from '../services/exportService';
import { getVideoOrientation } from '../config';
import PreviewPlayer from './PreviewPlayer';

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
  onExportVideo?: (enableSubtitles: boolean, subtitleConfig?: Partial<SubtitleConfig>, sceneGap?: number) => void;
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
}

// 오디오 디코딩 함수
async function decodeAudio(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  try {
    return await ctx.decodeAudioData(bytes.buffer.slice(0));
  } catch (e) {
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }
}

// Lazy Image 컴포넌트
const LazyImage: React.FC<{ src: string; alt: string; className?: string }> = memo(({ src, alt, className }) => {
  const imgRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '100px' }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="w-full h-full">
      {isVisible ? (
        <img src={src} alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          onLoad={() => setIsLoaded(true)} loading="lazy" />
      ) : (
        <div className="w-full h-full bg-slate-800 animate-pulse" />
      )}
    </div>
  );
});
LazyImage.displayName = 'LazyImage';

// 오디오 플레이어
const AudioPlayer: React.FC<{ base64: string }> = memo(({ base64 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch (e) {} sourceRef.current = null; }
    setIsPlaying(false);
  };

  const playAudio = async () => {
    if (isPlaying) { stopAudio(); return; }
    try {
      setIsPlaying(true);
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBuffer = await decodeAudio(base64, ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      sourceRef.current = source;
    } catch (error) { console.error(error); setIsPlaying(false); }
  };

  return (
    <button onClick={playAudio} className={`p-2.5 rounded-full border transition-all ${isPlaying ? 'bg-brand-600 border-brand-500 text-white animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
      {isPlaying
        ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
    </button>
  );
});
AudioPlayer.displayName = 'AudioPlayer';

// TableRow Props
interface TableRowProps {
  row: GeneratedAsset;
  index: number;
  isAnimating: boolean;
  isEditing: boolean;
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
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
  onDragEnd?: () => void;
}

const TableRow: React.FC<TableRowProps> = memo(({
  row, index, isAnimating, isEditing, confirmDelete,
  onRegenerateImage, onGenerateAnimation,
  onEditToggle, onUpdateAsset, onRegenerateAudio,
  onDeleteScene, onAddScene, onDuplicateScene, onUploadSceneImage, onSetCustomDuration,
  onSetZoomEffect, onSetTransition, onConfirmDeleteToggle,
  onDragStart, onDragOver, onDrop, onDragEnd
}) => {
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
    <tr className="group hover:bg-slate-800/20 transition-colors" onDragOver={onDragOver} onDrop={() => onDrop?.(index)}>

      {/* 드래그 핸들 + 씬 번호 + 액션 버튼들 */}
      <td
        className="py-5 px-3 align-top w-16 cursor-grab active:cursor-grabbing select-none"
        draggable onDragStart={() => onDragStart?.(index)} onDragEnd={onDragEnd}
      >
        <div className="flex flex-col items-center gap-2">
          {/* 드래그 핸들 */}
          <div className="text-slate-700 group-hover:text-slate-500 transition-colors" title="드래그하여 순서 변경">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>

          {/* 씬 번호 */}
          <span className="font-mono text-slate-600 text-[10px]">#{row.sceneNumber.toString().padStart(2, '0')}</span>

          {/* 편집/저장/취소 */}
          {isEditing ? (
            <div className="flex flex-col gap-1 w-full">
              <button onClick={handleSave} className="px-1.5 py-1 bg-green-600 hover:bg-green-500 text-white text-[8px] font-bold rounded transition-colors w-full">✓ 저장</button>
              <button onClick={() => onEditToggle?.(null)} className="px-1.5 py-1 bg-slate-600 hover:bg-slate-500 text-white text-[8px] font-bold rounded transition-colors w-full">✗ 취소</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 w-full">
              {/* 편집 */}
              <button
                onClick={(e) => { e.stopPropagation(); onEditToggle?.(index); }}
                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-600 hover:text-slate-300 rounded transition-colors w-full flex justify-center"
                title="씬 편집"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
                className={`p-1 rounded transition-colors w-full flex justify-center ${confirmDelete ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-slate-800 hover:bg-red-900/50 text-slate-600 hover:text-red-400'}`}
                title={confirmDelete ? '다시 클릭하면 삭제' : '씬 삭제'}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              {/* 아래에 씬 추가 */}
              <button
                onClick={(e) => { e.stopPropagation(); onAddScene?.(index); }}
                className="p-1 bg-slate-800 hover:bg-brand-900/50 text-slate-600 hover:text-brand-400 rounded transition-colors w-full flex justify-center"
                title="이 씬 아래에 빈 씬 추가"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {/* 씬 복제 */}
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicateScene?.(index); }}
                className="p-1 bg-slate-800 hover:bg-amber-900/50 text-slate-600 hover:text-amber-400 rounded transition-colors w-full flex justify-center"
                title="이 씬 복제"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
              className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 text-slate-100 rounded-lg p-2 text-[11px] leading-relaxed resize-none focus:outline-none transition-colors"
              rows={6} onClick={(e) => e.stopPropagation()} />
          ) : (
            <p className="text-slate-200 text-[11px] leading-relaxed font-medium tracking-tight">
              {row.narration || <span className="text-slate-600 italic">나레이션 없음</span>}
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
                  'text-slate-400 bg-slate-400/5 border-slate-400/20'
                }`}>{row.analysis.sentiment}</span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* 비주얼 프롬프트 */}
      <td className="py-5 px-6 align-top">
        {isEditing ? (
          <textarea ref={promptRef} defaultValue={row.visualPrompt}
            className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 text-slate-100 rounded-lg p-2 text-[9px] font-mono leading-tight resize-none focus:outline-none transition-colors"
            rows={10} onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="bg-slate-950/30 rounded-lg p-3 border border-slate-800/50 text-[9px] text-slate-600 font-mono leading-tight whitespace-pre-wrap">
            {row.visualPrompt || <span className="italic">프롬프트 없음</span>}
          </div>
        )}
      </td>

      {/* 생성 결과물 + 재생시간 */}
      <td className="py-5 px-6 align-top">
        {/* 이미지/영상 */}
        <div
          className="relative mx-auto rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group/img"
          style={isPortrait
            ? { width: '64px', height: '114px' }   // 9:16 compact portrait
            : { width: '192px', height: '108px' }   // 16:9 landscape
          }
        >
          {/* 숨겨진 이미지 업로드 input */}
          <input ref={imageUploadRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {row.status === 'generating' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent animate-spin rounded-full"></div>
              <span className="text-[7px] text-brand-500 font-black uppercase tracking-widest">렌더링 중</span>
            </div>
          ) : isAnimating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cyan-950/30">
              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full"></div>
              <span className="text-[7px] text-cyan-400 font-black uppercase tracking-widest">영상 변환 중</span>
            </div>
          ) : row.status === 'error' ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-950/30 border-2 border-dashed border-red-800/50 m-1 rounded-lg cursor-help"
              title={row.errorMessage || '생성 실패'}
            >
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[7px] text-red-400 font-black uppercase">실패</span>
              <div className="flex flex-col gap-1 px-1">
                <button onClick={() => onRegenerateImage?.(index)} className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[8px] font-black transition-all">재생성</button>
                <button onClick={() => imageUploadRef.current?.click()} className="px-1.5 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white text-[8px] font-black transition-all">업로드</button>
              </div>
            </div>
          ) : row.videoData ? (
            <>
              <video src={row.videoData} className="w-full h-full object-cover" autoPlay loop muted playsInline />
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-cyan-500/80 text-[6px] font-black text-white uppercase">영상</div>
              <div className={`absolute inset-0 bg-slate-950/80 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center ${isPortrait ? 'flex-col gap-1' : 'gap-1.5'}`}>
                <button onClick={() => onRegenerateImage?.(index)} className={`rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="이미지 재생성">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => imageUploadRef.current?.click()} className={`rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="이미지 직접 업로드">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </button>
                <button onClick={() => onGenerateAnimation?.(index)} className={`rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/30 text-cyan-400 transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="영상 재생성">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
            </>
          ) : row.imageData ? (
            <>
              <LazyImage src={`data:image/jpeg;base64,${row.imageData}`} alt="Scene"
                className="w-full h-full object-cover transition-transform group-hover/img:scale-105" />
              <div className={`absolute inset-0 bg-slate-950/80 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center ${isPortrait ? 'flex-col gap-1' : 'gap-1.5'}`}>
                <button onClick={() => onRegenerateImage?.(index)} className={`rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="이미지 재생성">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => imageUploadRef.current?.click()} className={`rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="이미지 직접 업로드">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </button>
                <button onClick={() => onGenerateAnimation?.(index)} className={`rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/30 text-cyan-400 transition-all ${isPortrait ? 'p-1' : 'p-2'}`} title="영상 변환">
                  <svg className={isPortrait ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
            </>
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 m-2 rounded-lg cursor-pointer hover:border-slate-500 transition-colors"
              onClick={() => imageUploadRef.current?.click()}
              title="클릭하여 이미지 업로드"
            >
              <svg className="w-6 h-6 text-slate-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-[7px] text-slate-700 font-black uppercase">클릭하여 업로드</span>
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
                : 'text-slate-400 bg-slate-800/50 border-slate-700/40'
            }`}>
              {row.errorMessage.toLowerCase().includes('safety') || row.errorMessage.toLowerCase().includes('blocked') || row.errorMessage.toLowerCase().includes('policy')
                ? '⚠ 콘텐츠 정책 위반 (호버로 상세 확인)'
                : row.errorMessage.toLowerCase().includes('quota') || row.errorMessage.toLowerCase().includes('429') || row.errorMessage.toLowerCase().includes('rate')
                ? '⏱ API 한도 초과'
                : row.errorMessage.toLowerCase().includes('api key') || row.errorMessage.toLowerCase().includes('unauthorized')
                ? '🔑 API 키 오류'
                : row.errorMessage.slice(0, 50) + (row.errorMessage.length > 50 ? '…' : '')}
            </p>
          </div>
        )}

        {/* 재생 시간 조절 */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="text-[8px] text-slate-600">⏱</span>
          <input
            type="number" min={1} max={60} step={0.5}
            value={effectiveDuration}
            onChange={(e) => onSetCustomDuration?.(index, Math.max(1, Math.min(60, Number(e.target.value))))}
            className="w-12 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-brand-500 text-slate-300 rounded px-1 py-0.5 text-[9px] text-center focus:outline-none transition-colors"
            title="씬 재생 시간 (초)"
          />
          <span className="text-[8px] text-slate-600">초</span>
          {row.customDuration && (
            <button
              onClick={() => onSetCustomDuration?.(index, 0)}
              className="text-[7px] text-slate-700 hover:text-slate-400 transition-colors"
              title="기본값으로 초기화"
            >↩</button>
          )}
        </div>

        {/* 줌/팬 효과 선택 */}
        <div className="mt-1.5 flex items-center justify-center gap-0.5">
          {([
            { id: 'zoomIn', label: '↗', title: '줌 인' },
            { id: 'zoomOut', label: '↙', title: '줌 아웃' },
            { id: 'panLeft', label: '←', title: '좌 패닝' },
            { id: 'panRight', label: '→', title: '우 패닝' },
            { id: 'none', label: '•', title: '효과 없음' },
          ] as const).map(({ id, label, title }) => (
            <button
              key={id}
              onClick={() => onSetZoomEffect?.(index, id)}
              className={`w-5 h-5 rounded text-[8px] font-bold transition-all ${
                (row.zoomEffect || 'zoomIn') === id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-600 hover:text-slate-300 border border-slate-700'
              }`}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 전환 효과 선택 */}
        <div className="mt-1 flex items-center justify-center gap-0.5">
          {([
            { id: 'none', label: '•', title: '전환 없음' },
            { id: 'crossfade', label: '⟷', title: '크로스페이드' },
            { id: 'fadeBlack', label: '■', title: '페이드 블랙' },
            { id: 'wipeLeft', label: '◁', title: '좌 와이프' },
            { id: 'wipeRight', label: '▷', title: '우 와이프' },
          ] as const).map(({ id, label, title }) => (
            <button
              key={id}
              onClick={() => onSetTransition?.(index, id)}
              className={`w-5 h-5 rounded text-[7px] font-bold transition-all ${
                (row.transition || 'none') === id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-600 hover:text-slate-300 border border-slate-700'
              }`}
              title={title}
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
              <button
                onClick={() => onRegenerateAudio?.(index)}
                className="p-1 bg-slate-800 hover:bg-blue-900/50 text-slate-600 hover:text-blue-400 rounded transition-colors"
                title="음성 재생성"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 opacity-30">
            <div className="w-2.5 h-2.5 border-2 border-slate-700 border-t-slate-500 animate-spin rounded-full"></div>
            <span className="text-[6px] text-slate-600 font-black uppercase">VO</span>
          </div>
        )}
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

const ResultTable: React.FC<ResultTableProps> = ({
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
}) => {
  const dragIndexRef = useRef<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // 자막 설정 상태
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [subtitlePos, setSubtitlePos] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [subtitleFontSize, setSubtitleFontSize] = useState(DEFAULT_SUBTITLE_CONFIG.fontSize);
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(75);
  const [subtitleTextColor, setSubtitleTextColor] = useState('#FFFFFF');
  const [sceneGap, setSceneGap] = useState(0.3); // 씬 전환 간격 (초)
  const [showPreview, setShowPreview] = useState(false);

  const currentSubtitleConfig: Partial<SubtitleConfig> = {
    position: subtitlePos,
    fontSize: subtitleFontSize,
    backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity / 100})`,
    textColor: subtitleTextColor,
  };

  const failedScenesCount = data.filter(d => d.status === 'error').length;

  const handleBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onBgmChange?.(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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

  if (data.length === 0) return null;

  return (
    <div className="w-full max-w-[98%] mx-auto pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 헤더 툴바 */}
      <div className="mb-6 bg-slate-900/90 backdrop-blur-md p-5 rounded-3xl border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-1 h-10 bg-brand-500 rounded-full"></div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">졸라맨 V10.0 마스터 스토리보드</h2>
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Ultra-Detail Identity Sync Active</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Undo/Redo */}
            <button onClick={onUndo} disabled={!canUndo}
              className={`px-3 py-2.5 rounded-xl border font-bold text-[10px] transition-all flex items-center gap-1.5 ${canUndo ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed'}`}
              title="실행 취소 (Ctrl+Z)">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
              취소
            </button>
            <button onClick={onRedo} disabled={!canRedo}
              className={`px-3 py-2.5 rounded-xl border font-bold text-[10px] transition-all flex items-center gap-1.5 ${canRedo ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed'}`}
              title="다시 실행 (Ctrl+Y)">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
              재실행
            </button>
            {/* 자동 줌 패턴 */}
            <select
              onChange={(e) => { if (e.target.value) { onAutoZoom?.(e.target.value); e.target.value = ''; } }}
              defaultValue=""
              className="px-3 py-2.5 rounded-xl bg-amber-900/30 border border-amber-700/50 text-amber-300 font-bold text-[10px] hover:bg-amber-800/30 transition-all cursor-pointer"
              title="전체 씬에 줌 효과 일괄 적용"
            >
              <option value="" disabled>자동 줌</option>
              <option value="alternating">교차 (In/Out)</option>
              <option value="dynamic">다이나믹 (4종)</option>
              <option value="sentiment">감정 기반 (AI)</option>
              <option value="static">정적 (없음)</option>
            </select>
            <button onClick={() => downloadProjectZip(data)} className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-[10px] hover:bg-slate-700 transition-all flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              전체 저장
            </button>
            <button onClick={() => exportAssetsToZip(data, `스토리보드_${new Date().toLocaleDateString('ko-KR')}`)} className="px-4 py-2.5 rounded-xl bg-emerald-800 border border-emerald-700 text-emerald-300 font-bold text-[10px] hover:bg-emerald-700 transition-all flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              엑셀+이미지
            </button>
            <button onClick={async () => await downloadSrt(data, `subtitles_${Date.now()}.srt`)} className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-[10px] hover:bg-slate-700 transition-all flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              SRT
            </button>
            {/* BGM */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors whitespace-nowrap" title="BGM 파일 업로드 (MP3, WAV)">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                {bgmData ? 'BGM ✓' : 'BGM'}
                <input type="file" accept="audio/*" className="hidden" onChange={handleBgmUpload} />
              </label>
              {bgmData && (
                <>
                  <input type="range" min={0} max={100} step={5}
                    value={Math.round(bgmVolume * 100)}
                    onChange={(e) => onBgmVolumeChange?.(Number(e.target.value) / 100)}
                    className="w-16 accent-purple-500"
                    title={`BGM 볼륨: ${Math.round(bgmVolume * 100)}%`} />
                  <span className="text-[9px] text-purple-400 w-6 text-right">{Math.round(bgmVolume * 100)}%</span>
                  <button onClick={() => onBgmChange?.(null)} className="text-slate-600 hover:text-red-400 transition-colors ml-0.5" title="BGM 제거">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <span className="text-slate-700 mx-0.5">|</span>
                  <label className="flex items-center gap-1 cursor-pointer" title="나레이션 구간에서 BGM 볼륨 자동 감소">
                    <input type="checkbox" checked={bgmDuckingEnabled ?? false}
                      onChange={(e) => onBgmDuckingToggle?.(e.target.checked)}
                      className="accent-purple-500 w-3 h-3" />
                    <span className="text-[8px] text-purple-400 whitespace-nowrap">덕킹</span>
                  </label>
                  {bgmDuckingEnabled && (
                    <>
                      <input type="range" min={10} max={50} step={5}
                        value={Math.round((bgmDuckingAmount ?? 0.3) * 100)}
                        onChange={(e) => onBgmDuckingAmountChange?.(Number(e.target.value) / 100)}
                        className="w-12 accent-purple-500"
                        title={`덕킹 볼륨: ${Math.round((bgmDuckingAmount ?? 0.3) * 100)}%`} />
                      <span className="text-[8px] text-purple-400 w-6">{Math.round((bgmDuckingAmount ?? 0.3) * 100)}%</span>
                    </>
                  )}
                </>
              )}
            </div>
            {/* 실패 씬 재생성 */}
            {failedScenesCount > 0 && (
              <button
                onClick={onRegenerateFailedScenes}
                className="px-4 py-2.5 rounded-xl bg-red-900/50 border border-red-700 text-red-300 font-bold text-[10px] hover:bg-red-800/50 transition-all flex items-center gap-2"
                title="실패한 씬 전체 재생성"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                실패 {failedScenesCount}개 재생성
              </button>
            )}
            {/* 미리보기 토글 */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-4 py-2.5 rounded-xl border font-bold text-[10px] transition-all flex items-center gap-2 ${
                showPreview
                  ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-cyan-400 hover:bg-slate-700'
              }`}
              title="브라우저에서 바로 미리보기 (MP4 렌더링 없이)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              미리보기
            </button>
            {/* 자막 설정 토글 */}
            <button
              onClick={() => setShowSubtitleSettings(!showSubtitleSettings)}
              className={`px-4 py-2.5 rounded-xl border font-bold text-[10px] transition-all flex items-center gap-2 ${
                showSubtitleSettings
                  ? 'bg-brand-900/50 border-brand-700 text-brand-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              자막 설정
            </button>
            <button onClick={() => onExportVideo?.(false, currentSubtitleConfig, sceneGap)} disabled={isExporting} className={`px-5 py-2.5 rounded-xl transition-all font-black text-[10px] flex items-center justify-center gap-2 ${isExporting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600'}`}>
              {isExporting ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent animate-spin rounded-full"></div> : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
              MP4 (자막 X)
            </button>
            <button onClick={() => onExportVideo?.(true, currentSubtitleConfig, sceneGap)} disabled={isExporting} className={`px-5 py-2.5 rounded-xl transition-all font-black text-[10px] flex items-center justify-center gap-2 ${isExporting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-900/20'}`}>
              {isExporting ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent animate-spin rounded-full"></div> : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
              MP4 (자막 O)
            </button>
          </div>
        </div>

        {/* 자막 설정 패널 */}
        {showSubtitleSettings && (
          <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-wrap items-center gap-5">
            {/* 위치 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">위치</span>
              <div className="flex gap-1">
                {(['top', 'center', 'bottom'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setSubtitlePos(pos)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all ${
                      subtitlePos === pos
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {pos === 'top' ? '상단' : pos === 'center' ? '중앙' : '하단'}
                  </button>
                ))}
              </div>
            </div>
            {/* 폰트 크기 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">크기</span>
              <input
                type="range" min={20} max={72} step={2}
                value={subtitleFontSize}
                onChange={(e) => setSubtitleFontSize(Number(e.target.value))}
                className="w-24 accent-brand-500"
              />
              <span className="text-[9px] text-slate-400 w-5 text-right">{subtitleFontSize}</span>
            </div>
            {/* 배경 투명도 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">배경</span>
              <input
                type="range" min={0} max={100} step={5}
                value={subtitleBgOpacity}
                onChange={(e) => setSubtitleBgOpacity(Number(e.target.value))}
                className="w-24 accent-brand-500"
              />
              <span className="text-[9px] text-slate-400 w-8 text-right">{subtitleBgOpacity}%</span>
            </div>
            {/* 텍스트 색상 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">색상</span>
              <div className="flex gap-1.5">
                {[
                  { color: '#FFFFFF', label: '흰색' },
                  { color: '#FFFF00', label: '노란색' },
                  { color: '#00FFFF', label: '청록색' },
                  { color: '#FFB347', label: '주황색' },
                ].map(({ color, label }) => (
                  <button
                    key={color}
                    onClick={() => setSubtitleTextColor(color)}
                    title={label}
                    className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                      subtitleTextColor === color ? 'border-brand-400 scale-110' : 'border-slate-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            {/* 미리보기 */}
            <div
              className="px-3 py-1 rounded text-[10px] font-bold"
              style={{
                backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity / 100})`,
                color: subtitleTextColor,
                fontSize: `${Math.max(10, Math.round(subtitleFontSize / 3))}px`,
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              자막 미리보기
            </div>
            {/* 씬 전환 간격 + 기본 전환 효과 */}
            <div className="flex flex-wrap items-center gap-4 w-full border-t border-slate-800/50 pt-3 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">씬 간격</span>
                <input
                  type="range" min={0} max={1.5} step={0.1}
                  value={sceneGap}
                  onChange={(e) => setSceneGap(Number(e.target.value))}
                  className="w-28 accent-brand-500"
                />
                <span className="text-[9px] text-slate-400 w-10 text-right">{sceneGap.toFixed(1)}초</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">기본 전환</span>
                <select
                  onChange={(e) => onSetDefaultTransition?.(e.target.value)}
                  defaultValue="none"
                  className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[9px] font-bold cursor-pointer"
                >
                  <option value="none">없음</option>
                  <option value="crossfade">크로스페이드</option>
                  <option value="fadeBlack">페이드 블랙</option>
                  <option value="wipeLeft">좌 와이프</option>
                  <option value="wipeRight">우 와이프</option>
                </select>
              </div>
              {sceneGap === 0 && (
                <span className="text-[8px] text-amber-500">전환 효과 사용 시 씬 간격 0.3초 이상 권장</span>
              )}
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

      {/* 테이블 */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/20 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px] table-fixed">
            <thead className="bg-slate-900/80 border-b border-slate-800">
              <tr>
                <th className="py-4 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">순서</th>
                <th className="py-4 px-6 text-[9px] font-black text-slate-500 uppercase tracking-widest w-[30%]">나레이션 / CEO 프로토콜</th>
                <th className="py-4 px-6 text-[9px] font-black text-slate-500 uppercase tracking-widest w-[30%]">V9.2 통합 영문 프롬프트</th>
                <th className="py-4 px-6 text-[9px] font-black text-slate-500 uppercase tracking-widest w-56 text-center">생성 결과물</th>
                <th className="py-4 px-6 text-[9px] font-black text-slate-500 uppercase tracking-widest w-20 text-center">음성</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {data.map((row, index) => (
                <TableRow
                  key={`scene-${row.sceneNumber}`}
                  row={row}
                  index={index}
                  isAnimating={animatingIndices?.has(index) || false}
                  isEditing={editingIndex === index}
                  confirmDelete={confirmDeleteIndex === index}
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
        <div className="border-t border-slate-800/40">
          <button
            onClick={() => onAddScene?.()}
            className="w-full py-3 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:bg-slate-800/30 transition-all text-[10px] font-bold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            빈 씬 추가
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultTable;
