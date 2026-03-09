// services/pilot/types.ts
// C2 PILOT 콘텐츠 파이프라인 타입 정의

import type {
  ScriptScene,
  SubtitleData,
  BrandPreset,
  CharacterProfile,
  EmotionCurve,
  PlatformVariant,
  VideoEngineMode,
} from '../../types';
import type { Language } from '../../config';

// ── 파이프라인 단계 ──

export type PipelineStep = 'script' | 'images' | 'tts' | 'bgm' | 'save';

export interface PipelineProgress {
  step: PipelineStep;
  current: number;
  total: number;
  message?: string;
}

// ── 파이프라인 입력 컨텍스트 ──

export interface PipelineContext {
  topic: string;
  preset: BrandPreset;
  characters: CharacterProfile[];
  emotionCurve?: EmotionCurve;
  platform: PlatformVariant;
  language: Language;
  campaignId?: string;

  onProgress: (progress: PipelineProgress) => void;

  imageModel?: string;
  orientation?: 'landscape' | 'portrait' | 'square';

  // 미래 확장 (MVP에서는 모두 undefined)
  enableSfx?: boolean;
  enableLipSync?: boolean;
  videoEngineMode?: VideoEngineMode;
}

// ── 확장된 씬 데이터 ──

export interface PilotScriptScene extends ScriptScene {
  speakerName?: string;
  speakerVoiceId?: string;
  emotionTag?: string;

  // 미래 확장
  speakers?: { name: string; voiceId: string; text: string; emotion?: string }[];
  isDialogueScene?: boolean;
  sfxPrompt?: string;
  lipSyncEnabled?: boolean;
  videoEngine?: 'pixverse' | 'kling_2.6' | 'kling_3.0';
}

// ── 씬별 생성 결과 ──

export interface PilotGeneratedAsset {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;

  imageUrl: string | null;
  audioUrl: string | null;
  subtitleData: SubtitleData | null;
  audioDuration: number | null;

  status: 'pending' | 'generating' | 'completed' | 'error';
  errorMessage?: string;
  creditCost: number;

  // 미래 확장
  videoUrl?: string | null;
  sfxUrl?: string | null;
  lipSyncVideoUrl?: string | null;
}

// ── 파이프라인 최종 결과 ──

export interface PipelineResult {
  success: boolean;
  topic: string;
  presetId: string;
  presetName: string;
  scenes: PilotScriptScene[];
  assets: PilotGeneratedAsset[];
  bgmUrl: string | null;
  emotionCurve?: EmotionCurve;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    thumbnailText: string;
  };
  costs: {
    script: number;
    images: number;
    tts: number;
    bgm: number;
    total: number;
  };
  generatedAt: string;
  durationMs: number;
  error?: string;
}
