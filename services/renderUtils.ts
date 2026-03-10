/**
 * 공유 렌더링 유틸리티 - videoService.ts와 PreviewPlayer에서 공통 사용
 */
import { SubtitleData, SubtitleConfig } from '../types';

// 자막 청크
export interface SubtitleChunk {
  text: string;
  startTime: number;
  endTime: number;
}

export type ZoomEffect = 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'none';
export type TransitionType = 'crossfade' | 'fadeBlack' | 'wipeLeft' | 'wipeRight' | 'none';

export interface PreparedScene {
  img: HTMLImageElement;
  video: HTMLVideoElement | null;
  isAnimated: boolean;
  audioBuffer: AudioBuffer | null;
  subtitleChunks: SubtitleChunk[];
  zoomEffect: ZoomEffect;
  transition: TransitionType;
  startTime: number;
  endTime: number;
  duration: number;
  speakerColor?: string;
}

/**
 * 오디오 디코딩 (MP3/WAV + PCM 폴백)
 */
export async function decodeAudio(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  try {
    return await ctx.decodeAudioData(bytes.buffer.slice(0));
  } catch {
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  }
}

/**
 * 자막 데이터를 청크로 변환
 */
export function createSubtitleChunks(
  subtitleData: SubtitleData | null,
  config: SubtitleConfig
): SubtitleChunk[] {
  if (!subtitleData || subtitleData.words.length === 0) return [];

  if (subtitleData.meaningChunks && subtitleData.meaningChunks.length > 0) {
    return subtitleData.meaningChunks.map(chunk => ({
      text: chunk.text, startTime: chunk.startTime, endTime: chunk.endTime
    }));
  }

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

  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].endTime = chunks[i + 1].startTime;
  }

  return chunks;
}

/**
 * 현재 시간의 자막 청크 검색
 */
export function getCurrentChunk(
  chunks: SubtitleChunk[],
  sceneElapsed: number
): SubtitleChunk | null {
  if (chunks.length === 0) return null;

  for (const chunk of chunks) {
    if (sceneElapsed >= chunk.startTime && sceneElapsed <= chunk.endTime) return chunk;
  }

  for (let i = chunks.length - 1; i >= 0; i--) {
    if (sceneElapsed > chunks[i].endTime) {
      if (i + 1 < chunks.length && sceneElapsed < chunks[i + 1].startTime) return chunks[i];
      if (i === chunks.length - 1) return chunks[i];
      break;
    }
  }

  if (sceneElapsed < chunks[0].startTime && sceneElapsed >= 0) {
    if (chunks[0].startTime - sceneElapsed < 0.1) return chunks[0];
    return null;
  }

  return null;
}

/**
 * 자막 렌더링
 */
export function renderSubtitle(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chunks: SubtitleChunk[],
  sceneElapsed: number,
  config: SubtitleConfig,
  speakerColor?: string
) {
  const currentChunk = getCurrentChunk(chunks, sceneElapsed);
  if (!currentChunk) return;

  const lines = currentChunk.text.split('\n');
  if (lines.length === 0) return;

  const lineHeight = config.fontSize * 1.4;
  const padding = 20;
  const safeMargin = 10;

  ctx.font = `bold ${config.fontSize}px ${config.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  let boxWidth = maxLineWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  const maxBoxWidth = canvas.width - safeMargin * 2;
  if (boxWidth > maxBoxWidth) boxWidth = maxBoxWidth;

  const boxX = Math.max(safeMargin, (canvas.width - boxWidth) / 2);

  const position = config.position ?? 'bottom';
  let boxY: number;
  if (position === 'top') {
    boxY = config.bottomMargin;
  } else if (position === 'center') {
    boxY = Math.max(safeMargin, (canvas.height - boxHeight) / 2);
  } else {
    boxY = canvas.height - config.bottomMargin - boxHeight;
    if (boxY < safeMargin) boxY = safeMargin;
  }

  ctx.fillStyle = config.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
  ctx.fill();

  const textMaxWidth = boxWidth - padding * 2;
  lines.forEach((line, lineIndex) => {
    const textY = boxY + padding + lineIndex * lineHeight;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(line, canvas.width / 2, textY, textMaxWidth);
    ctx.fillStyle = speakerColor || config.textColor;
    ctx.fillText(line, canvas.width / 2, textY, textMaxWidth);
  });
}

/**
 * 줌/팬 효과 좌표 계산
 */
export function calcZoomPan(
  canvasW: number, canvasH: number,
  srcW: number, srcH: number,
  effect: ZoomEffect, progress: number, intensity: number
): { x: number; y: number; w: number; h: number } {
  const baseRatio = Math.max(canvasW / srcW, canvasH / srcH);
  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  switch (effect) {
    case 'zoomOut': scale = (1.0 + intensity) - intensity * progress; break;
    case 'panLeft':
      scale = 1.0 + intensity * 0.3;
      offsetX = intensity * srcW * baseRatio * 0.05 * (1 - 2 * progress);
      break;
    case 'panRight':
      scale = 1.0 + intensity * 0.3;
      offsetX = intensity * srcW * baseRatio * 0.05 * (2 * progress - 1);
      break;
    case 'none': scale = 1.0; break;
    case 'zoomIn': default: scale = 1.0 + intensity * progress; break;
  }

  const nw = srcW * baseRatio * scale;
  const nh = srcH * baseRatio * scale;
  return { x: (canvasW - nw) / 2 + offsetX, y: (canvasH - nh) / 2 + offsetY, w: nw, h: nh };
}

/**
 * 씬 프레임 그리기
 */
export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  scene: PreparedScene, sceneProgress: number
) {
  let rendered = false;
  if (scene.isAnimated && scene.video && scene.video.readyState >= 2) {
    const v = scene.video;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      const { x, y, w, h } = calcZoomPan(canvasW, canvasH, v.videoWidth, v.videoHeight, scene.zoomEffect, sceneProgress, 0.05);
      ctx.drawImage(v, x, y, w, h);
      rendered = true;
    }
  }
  if (!rendered && scene.img.width > 0 && scene.img.height > 0) {
    const { x, y, w, h } = calcZoomPan(canvasW, canvasH, scene.img.width, scene.img.height, scene.zoomEffect, sceneProgress, 0.1);
    ctx.drawImage(scene.img, x, y, w, h);
  }
}

/**
 * 씬 전환 효과 렌더링
 */
export function renderTransition(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  prevScene: PreparedScene,
  nextScene: PreparedScene,
  progress: number
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

    case 'none': default:
      drawSceneFrame(ctx, canvasW, canvasH, prevScene, 1);
      break;
  }
}
