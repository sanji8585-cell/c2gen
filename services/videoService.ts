
import { GeneratedAsset, SubtitleData, SubtitleConfig, DEFAULT_SUBTITLE_CONFIG } from '../types';
import { getVideoOrientation, VIDEO_RESOLUTIONS, ResolutionTier } from '../config';

/**
 * 고정밀 오디오 디코딩: ElevenLabs(MP3)와 Gemini(PCM) 통합 처리
 */
async function decodeAudio(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  try {
    // MP3/WAV (ElevenLabs)
    return await ctx.decodeAudioData(bytes.buffer.slice(0));
  } catch (e) {
    // Raw PCM (Gemini)
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

// 자막 청크 (단어 그룹)
interface SubtitleChunk {
  text: string;       // 표시할 텍스트
  startTime: number;  // 시작 시간
  endTime: number;    // 끝 시간
}

type ZoomEffect = 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'none';

type TransitionType = 'crossfade' | 'fadeBlack' | 'wipeLeft' | 'wipeRight' | 'none';

interface PreparedScene {
  img: HTMLImageElement;
  video: HTMLVideoElement | null;  // 애니메이션 영상 (있으면 이미지 대신 사용)
  isAnimated: boolean;             // 애니메이션 씬 여부
  audioBuffer: AudioBuffer | null;
  subtitleChunks: SubtitleChunk[];  // 미리 계산된 자막 청크들
  zoomEffect: ZoomEffect;          // 줌/팬 효과
  transition: TransitionType;      // 이 씬→다음 씬 전환 효과
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * 자막 데이터를 청크로 변환
 * - AI 의미 단위 청크가 있으면 우선 사용 (22자 이하, 의미 단위)
 * - 없으면 기존 단어 수 기반으로 폴백
 */
function createSubtitleChunks(
  subtitleData: SubtitleData | null,
  config: SubtitleConfig
): SubtitleChunk[] {
  if (!subtitleData || subtitleData.words.length === 0) {
    return [];
  }

  // AI 의미 단위 청크가 있으면 우선 사용
  if (subtitleData.meaningChunks && subtitleData.meaningChunks.length > 0) {
    return subtitleData.meaningChunks.map(chunk => ({
      text: chunk.text,
      startTime: chunk.startTime,
      endTime: chunk.endTime
    }));
  }

  // 폴백: 기존 단어 수 기반 분리
  const chunks: SubtitleChunk[] = [];
  const words = subtitleData.words;
  const wordsPerChunk = config.wordsPerLine * config.maxLines;

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunkWords = words.slice(i, Math.min(i + wordsPerChunk, words.length));

    if (chunkWords.length === 0) continue;

    const lines: string[] = [];
    for (let j = 0; j < chunkWords.length; j += config.wordsPerLine) {
      const lineWords = chunkWords.slice(j, j + config.wordsPerLine);
      lines.push(lineWords.map(w => w.word).join(' '));
    }

    chunks.push({
      text: lines.join('\n'),
      startTime: chunkWords[0].start,
      endTime: chunkWords[chunkWords.length - 1].end
    });
  }

  // 청크 간 간격 제거
  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].endTime = chunks[i + 1].startTime;
  }

  return chunks;
}

/**
 * 현재 시간에 해당하는 자막 청크 찾기
 * - 씬 내에서 자막 바가 깜빡이지 않도록 마지막 청크를 씬 끝까지 유지
 */
function getCurrentChunk(
  chunks: SubtitleChunk[],
  sceneElapsed: number
): SubtitleChunk | null {
  if (chunks.length === 0) return null;

  // 현재 시간에 해당하는 청크 찾기
  for (const chunk of chunks) {
    if (sceneElapsed >= chunk.startTime && sceneElapsed <= chunk.endTime) {
      return chunk;
    }
  }

  // 청크 사이에 있을 때 (이전 청크 유지)
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (sceneElapsed > chunks[i].endTime) {
      // 다음 청크가 있고 아직 시작 전이면 이전 청크 유지
      if (i + 1 < chunks.length && sceneElapsed < chunks[i + 1].startTime) {
        return chunks[i];
      }
      // 마지막 청크 이후: 씬 끝까지 마지막 자막 유지 (깜빡임 방지)
      if (i === chunks.length - 1) {
        return chunks[i];
      }
      break;
    }
  }

  // 시작 전이면 첫 번째 청크 (시작 0.1초 전부터 표시해서 깜빡임 방지)
  if (sceneElapsed < chunks[0].startTime && sceneElapsed >= 0) {
    if (chunks[0].startTime - sceneElapsed < 0.1) {
      return chunks[0]; // 시작 직전이면 미리 표시
    }
    return null;
  }

  return null;
}

/**
 * 자막 렌더링 함수
 */
function renderSubtitle(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chunks: SubtitleChunk[],
  sceneElapsed: number,
  config: SubtitleConfig
) {
  const currentChunk = getCurrentChunk(chunks, sceneElapsed);
  if (!currentChunk) return;

  const lines = currentChunk.text.split('\n');
  if (lines.length === 0) return;

  // 자막 스타일 설정
  const lineHeight = config.fontSize * 1.4;
  const padding = 20;
  const safeMargin = 10; // 화면 경계 안전 여백

  ctx.font = `bold ${config.fontSize}px ${config.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 전체 자막 영역 크기 계산
  const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  let boxWidth = maxLineWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  // 화면 경계 체크 - 박스가 화면을 넘지 않도록
  const maxBoxWidth = canvas.width - safeMargin * 2;
  if (boxWidth > maxBoxWidth) {
    boxWidth = maxBoxWidth;
  }

  const boxX = Math.max(safeMargin, (canvas.width - boxWidth) / 2);

  // position에 따른 Y 좌표 계산
  const position = config.position ?? 'bottom';
  let boxY: number;
  if (position === 'top') {
    boxY = config.bottomMargin;
  } else if (position === 'center') {
    boxY = Math.max(safeMargin, (canvas.height - boxHeight) / 2);
  } else {
    // bottom (기본)
    boxY = canvas.height - config.bottomMargin - boxHeight;
    if (boxY < safeMargin) boxY = safeMargin;
  }

  // 반투명 배경 박스
  ctx.fillStyle = config.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
  ctx.fill();

  // 텍스트 렌더링 (maxWidth로 캔버스 넘침 방지)
  const textMaxWidth = boxWidth - padding * 2;
  lines.forEach((line, lineIndex) => {
    const textY = boxY + padding + lineIndex * lineHeight;

    // 검은 외곽선
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(line, canvas.width / 2, textY, textMaxWidth);

    // 흰색 텍스트
    ctx.fillStyle = config.textColor;
    ctx.fillText(line, canvas.width / 2, textY, textMaxWidth);
  });
}

/**
 * 줌/팬 효과 좌표 계산 (모듈 레벨 - 재사용 가능)
 */
function calcZoomPan(
  canvasW: number, canvasH: number,
  srcW: number, srcH: number,
  effect: ZoomEffect, progress: number, intensity: number
): { x: number; y: number; w: number; h: number } {
  const baseRatio = Math.max(canvasW / srcW, canvasH / srcH); // cover fit
  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  switch (effect) {
    case 'zoomOut':
      scale = (1.0 + intensity) - intensity * progress;
      break;
    case 'panLeft':
      scale = 1.0 + intensity * 0.3;
      offsetX = intensity * srcW * baseRatio * 0.05 * (1 - 2 * progress);
      break;
    case 'panRight':
      scale = 1.0 + intensity * 0.3;
      offsetX = intensity * srcW * baseRatio * 0.05 * (2 * progress - 1);
      break;
    case 'none':
      scale = 1.0;
      break;
    case 'zoomIn':
    default:
      scale = 1.0 + intensity * progress;
      break;
  }

  const nw = srcW * baseRatio * scale;
  const nh = srcH * baseRatio * scale;
  return { x: (canvasW - nw) / 2 + offsetX, y: (canvasH - nh) / 2 + offsetY, w: nw, h: nh };
}

/**
 * 씬 이미지/비디오를 캔버스에 그리는 헬퍼
 * - 항상 무언가를 그려서 검은 프레임 방지
 */
function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  scene: PreparedScene, sceneProgress: number
) {
  let rendered = false;

  // 1순위: 애니메이션 영상 (네이티브 재생 - video.play()로 부드러운 프레임 출력)
  if (scene.isAnimated && scene.video && scene.video.readyState >= 2) {
    const v = scene.video;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      const { x, y, w, h } = calcZoomPan(canvasW, canvasH, v.videoWidth, v.videoHeight, scene.zoomEffect, sceneProgress, 0.05);
      ctx.drawImage(v, x, y, w, h);
      rendered = true;
    }
  }

  // 2순위: 정적 이미지
  if (!rendered && scene.img.width > 0 && scene.img.height > 0) {
    const { x, y, w, h } = calcZoomPan(canvasW, canvasH, scene.img.width, scene.img.height, scene.zoomEffect, sceneProgress, 0.1);
    ctx.drawImage(scene.img, x, y, w, h);
    rendered = true;
  }

  // 3순위: 최소 폴백 (검은 화면 방지)
  if (!rendered) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
}

/**
 * 씬 전환 효과 렌더링 (갭 구간에서 호출)
 */
function renderTransition(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  prevScene: PreparedScene,
  nextScene: PreparedScene,
  progress: number // 0~1
) {
  const transition = prevScene.transition;

  switch (transition) {
    case 'crossfade':
      drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
      ctx.save();
      ctx.globalAlpha = progress;
      drawSceneFrame(ctx, canvasW, canvasH, nextScene, 0);
      ctx.restore();
      break;

    case 'fadeBlack':
      if (progress < 0.5) {
        drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
        ctx.fillStyle = `rgba(0, 0, 0, ${progress * 2})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else {
        drawSceneFrame(ctx, canvasW, canvasH, nextScene, 0);
        ctx.fillStyle = `rgba(0, 0, 0, ${(1 - progress) * 2})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
      break;

    case 'wipeLeft': {
      const boundary = canvasW * (1 - progress);
      drawSceneFrame(ctx, canvasW, canvasH, nextScene, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, boundary, canvasH);
      ctx.clip();
      drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
      ctx.restore();
      break;
    }

    case 'wipeRight': {
      const boundary = canvasW * progress;
      drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, boundary, canvasH);
      ctx.clip();
      drawSceneFrame(ctx, canvasW, canvasH, nextScene, 0);
      ctx.restore();
      break;
    }

    case 'none':
    default:
      drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
      break;
  }
}

export interface VideoExportOptions {
  enableSubtitles?: boolean;  // 자막 활성화 여부 (기본: true)
  subtitleConfig?: Partial<SubtitleConfig>;
  bgmData?: string | null;    // BGM base64 오디오 데이터
  bgmVolume?: number;         // BGM 볼륨 (0.0~1.0, 기본 0.25)
  sceneGap?: number;          // 씬 전환 사이 무음 간격 (초, 기본 0.3)
  bgmDuckingEnabled?: boolean;   // BGM 자동 볼륨 조절 (기본: false)
  bgmDuckingAmount?: number;     // 덕킹 시 볼륨 비율 (0.1~0.5, 기본 0.3 = 30%)
  resolution?: ResolutionTier;   // 해상도 티어 (기본: '720p')
  bitrateOverride?: number;      // 비트레이트 직접 지정 (놀이터 경량 렌더링용)
}

// 실제 렌더링된 자막 타이밍 기록용 인터페이스
export interface RecordedSubtitleEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

// 비디오 생성 결과 (영상 + SRT 데이터)
export interface VideoGenerationResult {
  videoBlob: Blob;
  recordedSubtitles: RecordedSubtitleEntry[];
}

export const generateVideo = async (
  assets: GeneratedAsset[],
  onProgress: (msg: string) => void,
  abortRef?: { current: boolean },
  options?: VideoExportOptions
): Promise<VideoGenerationResult | null> => {
  // 옵션 기본값
  const enableSubtitles = options?.enableSubtitles ?? true;
  const sceneGap = options?.sceneGap ?? 0.3; // 씬 간 기본 0.3초 간격
  const config: SubtitleConfig = { ...DEFAULT_SUBTITLE_CONFIG, ...options?.subtitleConfig };

  // 해상도별 자막 크기 자동 스케일링 (720p 기준)
  const resolution = options?.resolution ?? '720p';
  const resConfig = VIDEO_RESOLUTIONS[resolution];
  const orientation = getVideoOrientation();
  const resDims = resConfig[orientation];
  const baseHeight = orientation === 'portrait' ? 1280 : 720;
  const resolutionScale = resDims.height / baseHeight;
  if (resolutionScale > 1) {
    if (!options?.subtitleConfig?.fontSize) config.fontSize = Math.round(DEFAULT_SUBTITLE_CONFIG.fontSize * resolutionScale);
    if (!options?.subtitleConfig?.bottomMargin) config.bottomMargin = Math.round(DEFAULT_SUBTITLE_CONFIG.bottomMargin * resolutionScale);
  }

  // 세로 영상 자막 자동 최적화 (사용자가 명시하지 않은 경우에만)
  if (orientation === 'portrait') {
    if (!options?.subtitleConfig?.fontSize) config.fontSize = Math.round(config.fontSize * 1.2);
    if (!options?.subtitleConfig?.bottomMargin) config.bottomMargin = Math.round(config.bottomMargin * 1.5);
  }

  // 이미지가 있는 모든 씬 포함 (오디오 없으면 기본 3초)
  const validAssets = assets.filter(a => a.imageData || a.imageUrl);
  if (validAssets.length === 0) throw new Error("에셋이 준비되지 않았습니다.");

  // 자막 데이터 유무 체크
  const hasSubtitles = enableSubtitles && validAssets.some(a => a.subtitleData !== null);
  onProgress("에셋 메모리 사전 로딩 중 (1/3)...");

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const destination = audioCtx.createMediaStreamDestination();

  // 1. 모든 장면의 경계(startTime, endTime)를 미리 계산하여 타임라인 구축
  const preparedScenes: PreparedScene[] = [];
  let timelinePointer = 0;

  const DEFAULT_DURATION = 3; // 오디오 없을 때 기본 3초

  for (let i = 0; i < validAssets.length; i++) {
    const asset = validAssets[i];
    onProgress(`데이터 디코딩 및 프레임 매칭 중 (${i + 1}/${validAssets.length})...`);

    // 이미지 로드 (폴백용으로 항상 필요) - 에러 핸들링 추가
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const imgData = asset.imageData || asset.imageUrl || '';
    img.src = imgData.startsWith('http') || imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        if (img.width === 0 || img.height === 0) {
          console.error(`[Video] 씬 ${i + 1}: 이미지 크기가 0 - 로드 실패`);
          reject(new Error('Image has zero dimensions'));
        } else {
          resolve();
        }
      };
      img.onerror = () => {
        console.error(`[Video] 씬 ${i + 1}: 이미지 로드 에러`);
        reject(new Error('Image load failed'));
      };
      // 타임아웃 (5초)
      setTimeout(() => reject(new Error('Image load timeout')), 5000);
    }).catch(e => {
      console.warn(`[Video] 씬 ${i + 1}: ${e.message}, 플레이스홀더 사용`);
      // 플레이스홀더 이미지 생성
      const placeholderCanvas = document.createElement('canvas');
      const pDims = dims;
      placeholderCanvas.width = pDims.width;
      placeholderCanvas.height = pDims.height;
      const pCtx = placeholderCanvas.getContext('2d');
      if (pCtx) {
        pCtx.fillStyle = '#1a1a2e';
        pCtx.fillRect(0, 0, pDims.width, pDims.height);
        pCtx.fillStyle = '#fff';
        pCtx.font = 'bold 48px sans-serif';
        pCtx.textAlign = 'center';
        pCtx.fillText(`씬 ${i + 1}`, pDims.width / 2, pDims.height / 2);
      }
      img.src = placeholderCanvas.toDataURL();
    });

    // 애니메이션 영상 로드 (있는 경우)
    let video: HTMLVideoElement | null = null;
    let isAnimated = false;

    if (asset.videoData) {
      try {
        video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';  // 전체 버퍼링

        // URL 기반이면 blob으로 프리페치 (렌더링 중 네트워크 버퍼링 방지)
        if (asset.videoData.startsWith('http://') || asset.videoData.startsWith('https://')) {
          try {
            const resp = await fetch(asset.videoData);
            const blob = await resp.blob();
            video.src = URL.createObjectURL(blob);
          } catch {
            video.src = asset.videoData; // 폴백
          }
        } else {
          video.src = asset.videoData;
        }

        await new Promise<void>((resolve, reject) => {
          video!.oncanplaythrough = () => resolve(); // 전체 재생 가능할 때까지 대기
          video!.onloadeddata = () => resolve();
          video!.onerror = () => reject(new Error('Video load failed'));
          setTimeout(() => reject(new Error('Video load timeout')), 15000);
        });

        isAnimated = true;
      } catch (e) {
        console.warn(`[Video] 씬 ${i + 1}: 애니메이션 로드 실패, 정적 이미지 사용`);
        video = null;
        isAnimated = false;
      }
    }

    let audioBuffer: AudioBuffer | null = null;
    let duration = DEFAULT_DURATION;

    // 오디오가 있으면 디코딩, 없으면 기본 시간 사용
    let audioSource = asset.audioData;
    // audioData가 없고 audioUrl(HTTP)이 있으면 fetch로 가져오기
    if (!audioSource && asset.audioUrl && asset.audioUrl.startsWith('http')) {
      try {
        const audioResp = await fetch(asset.audioUrl);
        const audioBlob = await audioResp.arrayBuffer();
        const audioBytes = new Uint8Array(audioBlob);
        let audioBin = '';
        for (let j = 0; j < audioBytes.length; j++) audioBin += String.fromCharCode(audioBytes[j]);
        audioSource = btoa(audioBin);
      } catch (e) {
        console.warn(`[Video] 씬 ${i + 1} 오디오 URL fetch 실패`);
      }
    }
    if (audioSource) {
      try {
        audioBuffer = await decodeAudio(audioSource, audioCtx);
        duration = audioBuffer.duration;
        // 뮤트 씬: duration은 유지하되 오디오는 출력하지 않음
        if (asset.audioMuted) audioBuffer = null;
      } catch (e) {
        console.warn(`[Video] 씬 ${i + 1} 오디오 디코딩 실패, 기본 ${DEFAULT_DURATION}초 사용`);
      }
    } else if (asset.audioDuration && asset.audioDuration > 0) {
      // 오디오 URL도 없지만 duration 정보가 있으면 사용
      duration = asset.audioDuration;
    }

    // 사용자 지정 재생 시간 우선 적용
    if (asset.customDuration && asset.customDuration > 0) {
      duration = asset.customDuration;
    }

    // 자막 청크 미리 계산 (자막 비활성화시 빈 배열)
    const subtitleChunks = enableSubtitles ? createSubtitleChunks(asset.subtitleData, config) : [];

    const startTime = timelinePointer;
    const endTime = startTime + duration;

    preparedScenes.push({
      img,
      video,
      isAnimated,
      audioBuffer,
      subtitleChunks,
      zoomEffect: (asset.zoomEffect || 'zoomIn') as ZoomEffect,
      transition: (asset.transition || 'none') as TransitionType,
      startTime,
      endTime,
      duration
    });
    // 씬 사이에 간격 삽입 (마지막 씬 제외)
    timelinePointer = endTime + (i < validAssets.length - 1 ? sceneGap : 0);
  }

  const totalDuration = timelinePointer;

  // BGM 미리 디코딩 (있는 경우)
  let bgmBuffer: AudioBuffer | null = null;
  if (options?.bgmData) {
    try {
      onProgress("BGM 로딩 중...");
      bgmBuffer = await decodeAudio(options.bgmData, audioCtx);
    } catch (e) {
      console.warn('[Video] BGM 로드 실패, 건너뜀:', e);
    }
  }

  // 2. 캔버스 및 미디어 레코더 설정 (해상도 티어 적용)
  const dims = resDims;
  const actualBitrate = options?.bitrateOverride ?? resConfig.bitrate;
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error("캔버스 초기화 실패");

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks()
  ]);

  const mimeType = MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
    ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    : 'video/webm; codecs=vp9,opus';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: options?.bitrateOverride ?? resConfig.bitrate
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  // 자막 타이밍 기록용 배열
  const recordedSubtitles: RecordedSubtitleEntry[] = [];
  let lastRecordedChunkText: string | null = null;
  let currentChunkStartTime: number = 0;
  let subtitleIndex = 0;

  return new Promise(async (resolve, reject) => {
    let isFinished = false;
    let frameTimer: ReturnType<typeof setInterval> | null = null;

    recorder.onstop = async () => {
      if (frameTimer) clearInterval(frameTimer); // 타이머 정리
      await audioCtx.close(); // 오디오 컨텍스트 정리

      // 마지막 자막 청크 종료 처리
      if (lastRecordedChunkText !== null) {
        recordedSubtitles.push({
          index: subtitleIndex,
          startTime: currentChunkStartTime,
          endTime: totalDuration,
          text: lastRecordedChunkText
        });
      }

      resolve({
        videoBlob: new Blob(chunks, { type: mimeType }),
        recordedSubtitles
      });
    };
    recorder.onerror = (e) => reject(e);

    if (audioCtx.state === 'suspended') await audioCtx.resume();

    onProgress("실시간 동기화 렌더링 시작 (2/3)...");

    // 3. 오디오 스케줄링
    const initialDelay = 0.5; // 레코더 안정화를 위한 여유 시간 확보
    const masterStartTime = audioCtx.currentTime + initialDelay;

    preparedScenes.forEach(scene => {
      // 오디오가 있는 씬만 스케줄링
      if (scene.audioBuffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = scene.audioBuffer;
        source.connect(destination);
        // 렌더링 중 스피커 출력 음소거 (MP4에는 정상 포함)
        source.start(masterStartTime + scene.startTime);
        source.stop(masterStartTime + scene.endTime);
      }
    });

    // BGM 스케줄링 (나레이션과 함께 믹싱 + 자동 덕킹)
    if (bgmBuffer) {
      const baseVolume = options?.bgmVolume ?? 0.25;
      const bgmGain = audioCtx.createGain();
      bgmGain.gain.value = baseVolume;
      bgmGain.connect(destination);

      const bgmSource = audioCtx.createBufferSource();
      bgmSource.buffer = bgmBuffer;
      bgmSource.loop = true;
      bgmSource.connect(bgmGain);
      bgmSource.start(masterStartTime);
      bgmSource.stop(masterStartTime + totalDuration);

      // 자동 덕킹: 나레이션 구간에서 BGM 볼륨 자동 감소
      const duckingEnabled = options?.bgmDuckingEnabled ?? false;
      if (duckingEnabled) {
        const duckingAmount = options?.bgmDuckingAmount ?? 0.3;
        const duckVolume = baseVolume * duckingAmount;
        const RAMP_TIME = 0.3;

        preparedScenes.forEach(scene => {
          if (scene.audioBuffer) {
            const duckStart = masterStartTime + scene.startTime;
            bgmGain.gain.setValueAtTime(baseVolume, duckStart);
            bgmGain.gain.linearRampToValueAtTime(duckVolume, duckStart + RAMP_TIME);

            const duckEnd = masterStartTime + scene.endTime;
            bgmGain.gain.setValueAtTime(duckVolume, duckEnd);
            bgmGain.gain.linearRampToValueAtTime(baseVolume, duckEnd + RAMP_TIME);
          }
        });
      }
    }

    // 애니메이션 영상 재생 스케줄링 (네이티브 play로 부드러운 프레임 출력)
    preparedScenes.forEach((scene, idx) => {
      if (scene.isAnimated && scene.video) {
        const videoStartDelay = (masterStartTime - audioCtx.currentTime + scene.startTime) * 1000;
        setTimeout(() => {
          if (!isFinished && scene.video) {
            scene.video.currentTime = 0;
            scene.video.play().catch(e => console.warn(`[Video] 씬 ${idx + 1} 영상 재생 실패:`, e));
          }
        }, Math.max(0, videoStartDelay));
      }
    });

    recorder.start();

    // 4. 고정밀 프레임 루프 (타이머 기반 - 브라우저 탭 전환 시에도 안정적)
    // requestAnimationFrame은 탭이 비활성화되면 1fps 이하로 스로틀링됨
    // setInterval은 백그라운드에서도 안정적으로 동작 (최소 ~4ms 간격)
    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const renderFrame = () => {
      if (isFinished) return;

      if (abortRef?.current) {
        isFinished = true;
        clearInterval(frameTimer);
        recorder.stop();
        return;
      }

      const currentAudioTime = audioCtx.currentTime;
      const elapsed = currentAudioTime - masterStartTime;

      // 모든 장면 완료 체크
      if (elapsed >= totalDuration) {
        isFinished = true;
        clearInterval(frameTimer);
        onProgress("렌더링 완료! 파일 생성 중...");
        setTimeout(() => recorder.stop(), 500); // 마지막 프레임 유지를 위해 0.5초 대기
        return;
      }

      // 현재 오디오 타임스탬프에 '절대 동기화'된 장면 찾기 (경계값 포함)
      let currentScene: PreparedScene | undefined = preparedScenes.find(s =>
        elapsed >= s.startTime && elapsed <= s.endTime
      );

      // 갭 구간 감지 (전환 효과용)
      let isInGap = false;
      let gapProgress = 0;
      let prevSceneForGap: PreparedScene | null = null;
      let nextSceneForGap: PreparedScene | null = null;

      if (!currentScene) {
        if (elapsed < preparedScenes[0].startTime) {
          currentScene = preparedScenes[0];
        } else {
          // 갭 구간: 이전 씬과 다음 씬 사이
          isInGap = true;
          for (let si = 0; si < preparedScenes.length - 1; si++) {
            if (elapsed >= preparedScenes[si].endTime && elapsed < preparedScenes[si + 1].startTime) {
              prevSceneForGap = preparedScenes[si];
              nextSceneForGap = preparedScenes[si + 1];
              const gapDuration = nextSceneForGap.startTime - prevSceneForGap.endTime;
              gapProgress = gapDuration > 0 ? (elapsed - prevSceneForGap.endTime) / gapDuration : 1;
              break;
            }
          }
          if (!prevSceneForGap) {
            // 마지막 씬 이후
            currentScene = preparedScenes[preparedScenes.length - 1];
            isInGap = false;
          }
        }
      }

      if (ctx) {
        // 배경 클리어
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (isInGap && prevSceneForGap && nextSceneForGap) {
          // 갭 구간: 전환 효과 렌더링
          renderTransition(ctx, canvas.width, canvas.height, prevSceneForGap, nextSceneForGap, gapProgress);
        } else if (currentScene) {
          // 일반 씬 렌더링
          const sceneProgress = currentScene.duration > 0
            ? Math.min(1, Math.max(0, (elapsed - currentScene.startTime) / currentScene.duration))
            : 0;
          drawSceneFrame(ctx, canvas.width, canvas.height, currentScene, sceneProgress);
        }

        // 씬 갭 구간이 아닐 때만 자막/타이밍 처리
        const activeScene = isInGap ? null : currentScene;
        const sceneElapsed = activeScene ? elapsed - activeScene.startTime : 0;

        // 자막 렌더링 (갭 구간에는 표시 안 함)
        if (activeScene) {
          renderSubtitle(ctx, canvas, activeScene.subtitleChunks, sceneElapsed, config);
        }

        // 자막 타이밍 기록
        const currentChunk = activeScene ? getCurrentChunk(activeScene.subtitleChunks, sceneElapsed) : null;
        const currentChunkText = currentChunk?.text || null;

        if (currentChunkText !== lastRecordedChunkText) {
          // 이전 청크 종료 기록
          if (lastRecordedChunkText !== null) {
            recordedSubtitles.push({
              index: subtitleIndex,
              startTime: currentChunkStartTime,
              endTime: elapsed,
              text: lastRecordedChunkText
            });
            subtitleIndex++;
          }
          // 새 청크 시작
          if (currentChunkText !== null) {
            currentChunkStartTime = elapsed;
          }
          lastRecordedChunkText = currentChunkText;
        }

        // 실시간 진행률 업데이트
        const percent = Math.min(100, Math.round((elapsed / totalDuration) * 100));
        if (percent % 5 === 0) { // 너무 빈번한 업데이트 방지
            onProgress(`동기화 렌더링 가동 중: ${percent}%`);
        }
      }
    };

    frameTimer = setInterval(renderFrame, FRAME_INTERVAL);
  });
};
