// services/pilot/bgmStep.ts
// C2 PILOT BGM 생성 스텝 — 브랜드 프리셋 BGM 또는 AI 분위기 분석 기반 생성

import type { PipelineContext, PilotScriptScene } from './types';
import { generateBrandBgm, generateMusicWithElevenLabs } from '../elevenLabsService';
import { analyzeMood } from '../geminiService';

export interface BgmStepResult {
  bgmData: string | null;  // base64 data URL, will be uploaded in saveStep
  creditCost: number;
}

/**
 * BGM 생성 스텝
 * 1. 브랜드 프리셋에 bgm_preferences가 있으면 해당 설정으로 생성
 * 2. 없거나 실패 시 AI 분위기 분석 후 자동 생성
 * 3. 모두 실패해도 파이프라인은 중단하지 않음
 */
export async function runBgmStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[]
): Promise<BgmStepResult> {
  try {
    ctx.onProgress({
      step: 'bgm',
      current: 0,
      total: 1,
      message: 'BGM 생성 중...',
    });

    const narrations = scenes.map((s) => s.narration);

    // 1) 브랜드 프리셋 BGM preferences로 생성 시도
    const prefs = ctx.preset.bgm_preferences;
    if (prefs && (prefs.genre || prefs.mood || prefs.custom_prompt)) {
      const result = await generateBrandBgm(prefs, 30000);
      if (result.audio_base64) {
        ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 생성 완료' });
        return {
          bgmData: `data:audio/mpeg;base64,${result.audio_base64}`,
          creditCost: 50,
        };
      }
      // brand BGM 실패 — fallback으로 진행
    }

    // 2) AI 분위기 분석 → 자동 생성
    const { mood } = await analyzeMood(narrations);
    const musicResult = await generateMusicWithElevenLabs(mood, 30000);
    if (musicResult.audioBase64) {
      ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 생성 완료' });
      return {
        bgmData: `data:audio/mpeg;base64,${musicResult.audioBase64}`,
        creditCost: 50,
      };
    }

    // 3) 모두 실패
    ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 생성 실패 (건너뜀)' });
    return { bgmData: null, creditCost: 0 };
  } catch {
    // BGM 실패는 파이프라인을 중단하지 않음
    ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 생성 실패 (건너뜀)' });
    return { bgmData: null, creditCost: 0 };
  }
}
