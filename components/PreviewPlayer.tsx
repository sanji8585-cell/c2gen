
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { GeneratedAsset, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG } from '../types';
import { getVideoOrientation, VIDEO_DIMENSIONS } from '../config';
import {
  PreparedScene,
  ZoomEffect,
  TransitionType,
  decodeAudio,
  createSubtitleChunks,
  renderSubtitle,
  drawSceneFrame,
  renderTransition,
} from '../services/renderUtils';

interface PreviewPlayerProps {
  assets: GeneratedAsset[];
  subtitleConfig?: Partial<SubtitleConfig>;
  sceneGap: number;
  bgmData?: string | null;
  bgmVolume?: number;
  bgmDuckingEnabled?: boolean;
  bgmDuckingAmount?: number;
  onClose: () => void;
}

const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  assets,
  subtitleConfig,
  sceneGap,
  bgmData,
  bgmVolume = 0.25,
  bgmDuckingEnabled = false,
  bgmDuckingAmount = 0.3,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);

  // refs
  const scenesRef = useRef<PreparedScene[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const playStartTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmBufferRef = useRef<AudioBuffer | null>(null);
  const isPlayingRef = useRef(false);
  const videoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopRef = useRef<() => void>(() => {});
  const totalDurationRef = useRef(0);
  const lastTimeUpdateRef = useRef(0); // 시간 UI 업데이트 쓰로틀용

  // 캔버스 크기 (orientation 기반, 안정적 참조)
  const orientation = useMemo(() => getVideoOrientation(), []);
  const dims = VIDEO_DIMENSIONS[orientation];

  // 자막 설정 메모이제이션 (매 렌더 새 객체 방지)
  const config = useMemo<SubtitleConfig>(() => {
    const c: SubtitleConfig = { ...DEFAULT_SUBTITLE_CONFIG, ...subtitleConfig };
    if (orientation === 'portrait') {
      if (!subtitleConfig?.fontSize) c.fontSize = Math.round(DEFAULT_SUBTITLE_CONFIG.fontSize * 1.2);
      if (!subtitleConfig?.bottomMargin) c.bottomMargin = Math.round(DEFAULT_SUBTITLE_CONFIG.bottomMargin * 1.5);
    }
    return c;
  }, [subtitleConfig, orientation]);

  // 정적 프레임 렌더 (스크럽, 정지 상태)
  const renderStaticFrame = useCallback((time: number, scenes?: PreparedScene[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prepared = scenes || scenesRef.current;
    if (prepared.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 현재 시간에 해당하는 씬 찾기
    let activeScene: PreparedScene | null = null;
    let sceneIdx = 0;

    for (let i = 0; i < prepared.length; i++) {
      if (time >= prepared[i].startTime && time <= prepared[i].endTime) {
        activeScene = prepared[i];
        sceneIdx = i;
        break;
      }
    }

    // 갭 구간 전환 처리
    if (!activeScene) {
      for (let i = 0; i < prepared.length - 1; i++) {
        const gapStart = prepared[i].endTime;
        const gapEnd = prepared[i + 1].startTime;
        if (time > gapStart && time < gapEnd) {
          const gapDuration = gapEnd - gapStart;
          const gapProgress = (time - gapStart) / gapDuration;
          renderTransition(ctx, canvas.width, canvas.height, prepared[i], prepared[i + 1], gapProgress);
          return { sceneIdx: i };
        }
      }
      // 영상 끝 부분이면 마지막 씬 프레임
      if (prepared.length > 0 && time >= prepared[prepared.length - 1].endTime) {
        activeScene = prepared[prepared.length - 1];
        sceneIdx = prepared.length - 1;
      } else if (time < prepared[0].startTime) {
        activeScene = prepared[0];
        sceneIdx = 0;
      }
    }

    if (activeScene) {
      const sceneProgress = activeScene.duration > 0
        ? (time - activeScene.startTime) / activeScene.duration
        : 0;
      drawSceneFrame(ctx, canvas.width, canvas.height, activeScene, Math.min(1, Math.max(0, sceneProgress)));
      const sceneElapsed = time - activeScene.startTime;
      renderSubtitle(ctx, canvas, activeScene.subtitleChunks, sceneElapsed, config);
    }

    return { sceneIdx };
  }, [config]);

  // 재생 중 모든 오디오/비디오/타이머 정리
  const cleanupPlayback = useCallback(() => {
    isPlayingRef.current = false;
    cancelAnimationFrame(rafRef.current);

    // 오디오 소스 정지
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    activeSourcesRef.current = [];

    // BGM 정지
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch {}
      bgmSourceRef.current = null;
    }

    // 비디오 타이머 정리
    videoTimersRef.current.forEach(t => clearTimeout(t));
    videoTimersRef.current = [];

    // 비디오 정지
    scenesRef.current.forEach(scene => {
      if (scene.video) scene.video.pause();
    });
  }, []);

  // 일시정지
  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx) {
      playOffsetRef.current = ctx.currentTime - playStartTimeRef.current;
    }
    cleanupPlayback();
    setIsPlaying(false);
  }, [cleanupPlayback]);

  // 정지 (처음으로)
  const stop = useCallback(() => {
    cleanupPlayback();
    setIsPlaying(false);
    playOffsetRef.current = 0;
    setCurrentTime(0);
    setCurrentSceneIndex(0);
    renderStaticFrame(0);
  }, [cleanupPlayback, renderStaticFrame]);

  // stopRef 항상 최신 stop 참조 유지
  useEffect(() => { stopRef.current = stop; }, [stop]);

  // 재생
  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx || scenesRef.current.length === 0) return;

    if (ctx.state === 'suspended') ctx.resume();

    isPlayingRef.current = true;
    setIsPlaying(true);
    const offset = playOffsetRef.current;
    playStartTimeRef.current = ctx.currentTime - offset;

    // 나레이션 오디오 스케줄
    const sources: AudioBufferSourceNode[] = [];
    scenesRef.current.forEach(scene => {
      if (scene.audioBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = scene.audioBuffer;
        source.connect(ctx.destination);

        const sceneAudioStart = scene.startTime - offset;
        if (sceneAudioStart >= 0) {
          source.start(ctx.currentTime + sceneAudioStart);
        } else {
          const audioOffset = Math.min(-sceneAudioStart, scene.audioBuffer.duration);
          if (audioOffset < scene.audioBuffer.duration) {
            source.start(ctx.currentTime, audioOffset);
          }
        }
        sources.push(source);
      }
    });
    activeSourcesRef.current = sources;

    // BGM 스케줄
    if (bgmBufferRef.current) {
      const bgmGain = ctx.createGain();
      bgmGain.gain.value = bgmVolume;
      bgmGain.connect(ctx.destination);

      const bgmSource = ctx.createBufferSource();
      bgmSource.buffer = bgmBufferRef.current;
      bgmSource.loop = true;
      bgmSource.connect(bgmGain);

      if (offset > 0) {
        const bgmOffset = offset % bgmBufferRef.current.duration;
        bgmSource.start(ctx.currentTime, bgmOffset);
      } else {
        bgmSource.start(ctx.currentTime);
      }
      bgmSourceRef.current = bgmSource;

      // 덕킹 스케줄
      if (bgmDuckingEnabled) {
        const baseVol = bgmVolume;
        const duckVol = bgmVolume * bgmDuckingAmount;
        const RAMP = 0.3;

        scenesRef.current.forEach(scene => {
          if (scene.audioBuffer) {
            const duckStart = scene.startTime - offset;
            const duckEnd = scene.endTime - offset;
            if (duckStart >= 0) {
              bgmGain.gain.setValueAtTime(baseVol, ctx.currentTime + duckStart);
              bgmGain.gain.linearRampToValueAtTime(duckVol, ctx.currentTime + duckStart + RAMP);
            }
            if (duckEnd >= 0) {
              bgmGain.gain.setValueAtTime(duckVol, ctx.currentTime + duckEnd);
              bgmGain.gain.linearRampToValueAtTime(baseVol, ctx.currentTime + duckEnd + RAMP);
            }
          }
        });
      }
    }

    // 비디오 재생 (타이머 추적)
    const timers: ReturnType<typeof setTimeout>[] = [];
    scenesRef.current.forEach(scene => {
      if (scene.isAnimated && scene.video) {
        const videoStart = scene.startTime - offset;
        if (videoStart <= 0) {
          scene.video.currentTime = Math.min(-videoStart, scene.video.duration);
          scene.video.play().catch(() => {});
        } else {
          const timer = setTimeout(() => {
            if (scene.video && isPlayingRef.current) {
              scene.video.currentTime = 0;
              scene.video.play().catch(() => {});
            }
          }, videoStart * 1000);
          timers.push(timer);
        }
      }
    });
    videoTimersRef.current = timers;

    // 렌더 루프 (stopRef로 최신 stop 참조, 시간 업데이트 쓰로틀)
    const renderLoop = () => {
      if (!isPlayingRef.current) return;
      const elapsed = ctx.currentTime - playStartTimeRef.current;
      if (elapsed >= totalDurationRef.current) {
        stopRef.current();
        return;
      }

      // 캔버스 렌더링
      const result = renderStaticFrame(elapsed);
      if (result) {
        setCurrentSceneIndex(result.sceneIdx);
      }

      // 시간 UI 업데이트 쓰로틀 (~10Hz)
      const now = performance.now();
      if (now - lastTimeUpdateRef.current > 100) {
        setCurrentTime(elapsed);
        lastTimeUpdateRef.current = now;
      }

      rafRef.current = requestAnimationFrame(renderLoop);
    };
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [bgmVolume, bgmDuckingEnabled, bgmDuckingAmount, renderStaticFrame]);

  // 스크럽
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (isPlayingRef.current) {
      cleanupPlayback();
      setIsPlaying(false);
    }
    playOffsetRef.current = t;
    setCurrentTime(t);
    const result = renderStaticFrame(t);
    if (result) setCurrentSceneIndex(result.sceneIdx);
  }, [cleanupPlayback, renderStaticFrame]);

  // 에셋 로드 & 타임라인 구성
  useEffect(() => {
    let cancelled = false;

    // 이전 재생 상태 정리
    cleanupPlayback();
    setIsPlaying(false);
    playOffsetRef.current = 0;

    const loadAssets = async () => {
      setIsLoading(true);
      setLoadError(null);

      // 이전 AudioContext 정리
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      try {
        const ctx = new AudioContext();
        if (cancelled) { ctx.close(); return; }
        audioCtxRef.current = ctx;

        const validAssets = assets.filter(a => a.imageData);
        if (validAssets.length === 0) {
          setLoadError('이미지가 있는 씬이 없습니다.');
          setIsLoading(false);
          return;
        }

        const prepared: PreparedScene[] = [];
        let timeline = 0;

        for (let i = 0; i < validAssets.length; i++) {
          if (cancelled) return;
          const asset = validAssets[i];

          // 이미지 로드 (URL, data URI, raw base64 모두 지원)
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`씬 ${i + 1} 이미지 로드 실패`));
            const src = asset.imageUrl || asset.imageData!;
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
              img.src = src;
            } else {
              img.src = `data:image/png;base64,${src}`;
            }
          });

          // 비디오 로드 (있으면)
          let video: HTMLVideoElement | null = null;
          let isAnimated = false;
          if (asset.videoData) {
            try {
              video = document.createElement('video');
              video.crossOrigin = 'anonymous';
              video.muted = true;
              video.playsInline = true;
              video.preload = 'auto';
              await new Promise<void>((resolve, reject) => {
                video!.onloadeddata = () => resolve();
                video!.onerror = () => reject();
                video!.src = asset.videoData!;
              });
              isAnimated = true;
            } catch {
              video = null;
            }
          }

          // 오디오 디코딩 (URL, data URI, raw base64 모두 지원)
          let audioBuffer: AudioBuffer | null = null;
          const audioSrc = asset.audioUrl || asset.audioData;
          if (audioSrc) {
            try {
              if (audioSrc.startsWith('http://') || audioSrc.startsWith('https://')) {
                const resp = await fetch(audioSrc);
                const arrBuf = await resp.arrayBuffer();
                audioBuffer = await ctx.decodeAudioData(arrBuf);
              } else if (audioSrc.startsWith('data:')) {
                const b64 = audioSrc.split(',')[1];
                audioBuffer = await decodeAudio(b64, ctx);
              } else {
                audioBuffer = await decodeAudio(audioSrc, ctx);
              }
            } catch {
              // 오디오 없이 진행
            }
          }

          // 자막 청크
          const subtitleChunks = createSubtitleChunks(asset.subtitleData ?? null, config);

          // 씬 길이
          const duration = asset.customDuration
            || (audioBuffer ? audioBuffer.duration : null)
            || asset.audioDuration
            || 3;

          const startTime = timeline;
          const endTime = timeline + duration;

          prepared.push({
            img, video, isAnimated, audioBuffer, subtitleChunks,
            zoomEffect: (asset.zoomEffect || 'zoomIn') as ZoomEffect,
            transition: (asset.transition || 'none') as TransitionType,
            startTime, endTime, duration,
          });

          timeline = endTime + sceneGap;
        }

        if (cancelled) return;

        // BGM 로드
        if (bgmData) {
          try {
            bgmBufferRef.current = await decodeAudio(bgmData, ctx);
          } catch {
            bgmBufferRef.current = null;
          }
        } else {
          bgmBufferRef.current = null;
        }

        scenesRef.current = prepared;
        const total = prepared.length > 0 ? prepared[prepared.length - 1].endTime : 0;
        totalDurationRef.current = total;
        setTotalDuration(total);
        setCurrentTime(0);
        setCurrentSceneIndex(0);
        setIsLoading(false);

        // 첫 프레임 렌더
        renderStaticFrame(0, prepared);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setLoadError(msg || '에셋 로딩 실패');
          setIsLoading(false);
        }
      }
    };

    loadAssets();
    return () => {
      cancelled = true;
      // 이전 AudioContext 정리 (effect cleanup)
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, sceneGap]);

  // 언마운트 시 최종 정리
  useEffect(() => {
    return () => {
      cleanupPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [cleanupPlayback]);

  // totalDuration ref 동기화
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  // 시간 포맷
  const formatTime = (t: number): string => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 반응형 캔버스 크기 (세로형일 때 높이도 제한)
  const maxDisplayWidth = 800;
  const maxDisplayHeight = 600;
  const scale = Math.min(maxDisplayWidth / dims.width, maxDisplayHeight / dims.height, 1);
  const displayW = Math.round(dims.width * scale);
  const displayH = Math.round(dims.height * scale);

  return (
    <div className="mb-6 backdrop-blur-md rounded-3xl border border-cyan-800/50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)' }}>
      {/* 캔버스 영역 */}
      <div className="flex justify-center bg-black p-4 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ width: displayW, height: displayH }}>
            <div className="text-center">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-3"></div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>에셋 로딩 중...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center" style={{ width: displayW, height: displayH }}>
            <p className="text-red-400 text-xs">{loadError}</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            style={{ width: displayW, height: displayH }}
            className="rounded-xl"
          />
        )}
      </div>

      {/* 컨트롤 바 */}
      <div className="px-5 py-3 flex items-center gap-3 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-default) 50%, transparent)' }}>
        {/* 재생/일시정지 */}
        <button
          onClick={() => isPlaying ? pause() : play()}
          disabled={isLoading || !!loadError}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        {/* 정지 */}
        <button
          onClick={stop}
          disabled={isLoading || !!loadError}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-elevated)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          title="정지"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
        </button>

        {/* 시간 표시 */}
        <span className="text-[11px] font-mono w-20 text-center whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>

        {/* 타임라인 슬라이더 */}
        <input
          type="range"
          min={0}
          max={totalDuration || 1}
          step={0.05}
          value={currentTime}
          onChange={handleScrub}
          disabled={isLoading || !!loadError}
          className="flex-1 accent-cyan-500 h-1.5 cursor-pointer disabled:opacity-40"
        />

        {/* 씬 인디케이터 */}
        <span className="text-[10px] font-bold text-cyan-400 whitespace-nowrap">
          {scenesRef.current.length > 0 ? `${currentSceneIndex + 1}/${scenesRef.current.length}` : '-/-'}
        </span>

        {/* 닫기 */}
        <button
          onClick={() => { stop(); onClose(); }}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-900/50 hover:text-red-400 transition-all"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          title="미리보기 닫기"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default PreviewPlayer;
