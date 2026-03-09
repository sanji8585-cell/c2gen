// services/pilot/contentPipeline.ts
// C2 PILOT — Content Pipeline Orchestrator
// Chains all pipeline steps: script → images + tts + bgm (parallel) → save

import type { PipelineContext, PilotGeneratedAsset, PipelineResult } from './types';
import { runScriptStep } from './scriptStep';
import { runImageStep } from './imageStep';
import { runTtsStep } from './ttsStep';
import { runBgmStep } from './bgmStep';
import { runSaveStep } from './saveStep';

// ── Helper: initialize empty assets from scenes ──

function initializeAssets(
  scenes: Array<{ sceneNumber: number; narration: string; visualPrompt: string }>,
): PilotGeneratedAsset[] {
  return scenes.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    narration: scene.narration,
    visualPrompt: scene.visualPrompt,
    imageUrl: null,
    audioUrl: null,
    subtitleData: null,
    audioDuration: null,
    status: 'pending' as const,
    creditCost: 0,
  }));
}

// ── Main Export ──

export async function runContentPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const startTime = Date.now();

  try {
    // ── Step 1 (serial): Script generation ──
    const { scenes, emotionCurve } = await runScriptStep(ctx);

    // ── Initialize empty assets array ──
    const assets = initializeAssets(scenes);

    // ── Steps 2+3+4 (parallel): Images, TTS, BGM ──
    const [, , bgmResult] = await Promise.all([
      runImageStep(ctx, scenes, assets),
      runTtsStep(ctx, scenes, assets),
      runBgmStep(ctx, scenes),
    ]);

    // ── Calculate costs ──
    const scriptCost = 5;

    let imageCost = 0;
    let ttsCost = 0;

    for (const asset of assets) {
      // Images are 16 credits each (charged in imageStep via creditCost)
      // TTS is per-1000-chars (charged in ttsStep via creditCost)
      // We sum all creditCost per asset; image contributes a fixed amount, tts the rest
      if (asset.imageUrl) {
        imageCost += 16;
        ttsCost += Math.max(0, asset.creditCost - 16);
      } else {
        ttsCost += asset.creditCost;
      }
    }

    const bgmCost = bgmResult.creditCost;
    const totalCost = scriptCost + imageCost + ttsCost + bgmCost;

    const costs = {
      script: scriptCost,
      images: imageCost,
      tts: ttsCost,
      bgm: bgmCost,
      total: totalCost,
    };

    const durationMs = Date.now() - startTime;

    // ── Step 5: Save to approval queue + upload assets ──
    const result = await runSaveStep(
      ctx,
      scenes,
      assets,
      bgmResult.bgmData,
      emotionCurve,
      costs,
      durationMs,
    );

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    console.error('[contentPipeline] Pipeline failed:', errorMessage);

    return {
      success: false,
      topic: ctx.topic,
      presetId: ctx.preset.id,
      presetName: ctx.preset.name,
      scenes: [],
      assets: [],
      bgmUrl: null,
      metadata: {
        title: ctx.topic,
        description: '',
        tags: [],
        thumbnailText: ctx.topic,
      },
      costs: { script: 0, images: 0, tts: 0, bgm: 0, total: 0 },
      generatedAt: new Date().toISOString(),
      durationMs,
      error: errorMessage,
    };
  }
}
