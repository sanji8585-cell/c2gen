// services/pilot/imageStep.ts
// C2 PILOT — 이미지 생성 스텝
// 브랜드 프리셋의 화풍 + 캐릭터 레퍼런스 시트를 주입하여 일관된 이미지 생성

import { generateImage } from '../imageService';
import { CREDIT_CONFIG } from '../../config';
import type { ScriptScene, ReferenceImages } from '../../types';
import type {
  PipelineContext,
  PilotScriptScene,
  PilotGeneratedAsset,
} from './types';

// ── 상수 ──

const IMAGE_CONCURRENCY = 10;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 2000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── URL → base64 데이터 URL 변환 ──

async function fetchAsBase64DataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    console.warn('[imageStep] Failed to fetch image:', url);
    return null;
  }
}

// ── 레퍼런스 이미지 빌드 ──

async function buildReferenceImages(ctx: PipelineContext): Promise<ReferenceImages> {
  const characterUrls: string[] = [];
  const styleUrls: string[] = [];

  // 캐릭터 레퍼런스 시트에서 URL 수집
  for (const char of ctx.characters) {
    const sheet = char.reference_sheet;
    if (!sheet) continue;

    // multi_angle.front 우선, 없으면 original_upload
    const url = sheet.multi_angle?.front || sheet.original_upload;
    if (url) {
      characterUrls.push(url);
    }
  }

  // 스타일 프리뷰 이미지 (첫 번째만)
  const stylePreviewUrl = ctx.preset.style_preview_images?.[0];
  if (stylePreviewUrl) {
    styleUrls.push(stylePreviewUrl);
  }

  // URL들을 base64 데이터 URL로 변환 (병렬)
  const allFetches = [
    ...characterUrls.map(u => fetchAsBase64DataUrl(u)),
    ...styleUrls.map(u => fetchAsBase64DataUrl(u)),
  ];
  const results = await Promise.all(allFetches);

  const characterBase64: string[] = [];
  const styleBase64: string[] = [];

  for (let i = 0; i < characterUrls.length; i++) {
    const b64 = results[i];
    if (b64) characterBase64.push(b64);
  }

  for (let i = 0; i < styleUrls.length; i++) {
    const b64 = results[characterUrls.length + i];
    if (b64) styleBase64.push(b64);
  }

  return {
    character: characterBase64,
    style: styleBase64,
    characterStrength: 70,
    styleStrength: 70,
  };
}

// ── 화풍 주입 ──

function injectArtStyle(scene: PilotScriptScene, ctx: PipelineContext): ScriptScene {
  const parts: string[] = [];

  // 브랜드 프리셋 커스텀 프롬프트 앞에 추가
  const customPrompt = ctx.preset.art_style?.custom_prompt;
  if (customPrompt) {
    parts.push(customPrompt);
  }

  // 원본 visualPrompt
  parts.push(scene.visualPrompt);

  // 팔레트 힌트
  const palette = ctx.preset.art_style?.extracted_features?.palette;
  if (palette && palette.length > 0) {
    parts.push(`Color palette: ${palette.join(', ')}`);
  }

  // 네거티브 프롬프트
  const negatives = ctx.preset.art_style?.negative_prompts;
  if (negatives && negatives.length > 0) {
    parts.push(`Avoid: ${negatives.join(', ')}`);
  }

  return {
    sceneNumber: scene.sceneNumber,
    narration: scene.narration,
    visualPrompt: parts.join('\n'),
    analysis: scene.analysis,
  };
}

// ── 이미지 크레딧 비용 ──

function getImageCreditCost(ctx: PipelineContext): number {
  const model = ctx.imageModel || 'gemini-2.5-flash-image';
  return CREDIT_CONFIG.COSTS[model] ?? CREDIT_CONFIG.COSTS['gemini-2.5-flash-image'] ?? 16;
}

// ── 단일 씬 이미지 생성 (재시도 포함) ──

async function generateSceneImage(
  scene: PilotScriptScene,
  ctx: PipelineContext,
  refImages: ReferenceImages,
): Promise<string | null> {
  const injectedScene = injectArtStyle(scene, ctx);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await wait(RETRY_BACKOFF_MS * attempt);
      }
      const result = await generateImage(injectedScene, refImages);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[imageStep] Scene ${scene.sceneNumber} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${msg}`,
      );
      if (attempt === MAX_RETRIES) {
        throw err;
      }
    }
  }
  return null;
}

// ── 배치 처리 유틸 ──

async function processBatch<T>(
  items: T[],
  batchSize: number,
  handler: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map((item, batchIdx) => handler(item, i + batchIdx)),
    );
  }
}

// ── 메인: 이미지 스텝 ──

export async function runImageStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
): Promise<void> {
  const total = scenes.length;

  ctx.onProgress({ step: 'images', current: 0, total, message: '레퍼런스 이미지 로딩...' });

  // 1. 레퍼런스 이미지 빌드 (한 번만)
  const refImages = await buildReferenceImages(ctx);

  const creditCost = getImageCreditCost(ctx);
  let completed = 0;

  // 2. 배치 단위로 이미지 생성
  await processBatch(scenes, IMAGE_CONCURRENCY, async (scene, idx) => {
    const asset = assets[idx];
    asset.status = 'generating';

    ctx.onProgress({
      step: 'images',
      current: completed,
      total,
      message: `씬 ${scene.sceneNumber} 이미지 생성 중...`,
    });

    try {
      const imageData = await generateSceneImage(scene, ctx, refImages);
      asset.imageUrl = imageData;
      asset.status = imageData ? 'completed' : 'error';
      asset.creditCost += creditCost;
      if (!imageData) {
        asset.errorMessage = '이미지 생성 결과 없음';
      }
    } catch (err) {
      asset.status = 'error';
      asset.errorMessage = err instanceof Error ? err.message : String(err);
    }

    completed++;
    ctx.onProgress({
      step: 'images',
      current: completed,
      total,
      message: `씬 ${scene.sceneNumber} 이미지 ${asset.status === 'error' ? '실패' : '완료'}`,
    });
  });
}
