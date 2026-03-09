// services/pilot/ttsStep.ts
// C2 PILOT — TTS Generation Step
// Generates narration audio for each scene using ElevenLabs,
// with character-specific voices and emotion audio tags.

import type { SceneEmotionMeta, EmotionType } from '../../types';
import type { Language } from '../../config';
import { LANGUAGE_CONFIG } from '../../config';
import type { PipelineContext, PilotScriptScene, PilotGeneratedAsset } from './types';
import { generateAudioWithElevenLabs } from '../elevenLabsService';
import { generateAudioForScene } from '../geminiService';
import { processNarrationForTTS, getEmotionTtsPace } from '../audioTagsService';

// ── Constants ──

const TTS_CONCURRENCY = 5;
const MAX_RETRIES = 2;
const RETRY_429_DELAY_MS = 3000;
const BATCH_DELAY_MS = 1500;
const TTS_CREDIT_PER_1K_CHARS = 15;
const DEFAULT_IMPERFECTION = 0.3;
const DEFAULT_STABILITY = 0.6;

// ── Helpers ──

/** Build a minimal SceneEmotionMeta from the emotionTag string stored on PilotScriptScene. */
function buildEmotionMeta(emotionTag?: string): SceneEmotionMeta | undefined {
  if (!emotionTag) return undefined;

  // Extract the emotion keyword from the tag (e.g. "[excited]" → "excitement")
  const EMOTION_KEYWORDS: Record<string, EmotionType> = {
    curious: 'curiosity',
    curiously: 'curiosity',
    intrigued: 'curiosity',
    tense: 'tension',
    nervously: 'tension',
    surprised: 'surprise',
    gasps: 'surprise',
    excited: 'excitement',
    enthusiastically: 'excitement',
    energetically: 'excitement',
    softly: 'empathy',
    gently: 'empathy',
    warmly: 'warmth',
    smiling: 'warmth',
    happily: 'warmth',
    reflectively: 'lingering',
    pause: 'lingering',
    calmly: 'calm',
    peacefully: 'calm',
    fearfully: 'fear',
    whispers: 'fear',
  };

  const tagLower = emotionTag.toLowerCase();
  let matchedEmotion: EmotionType = 'calm';

  for (const [keyword, emotion] of Object.entries(EMOTION_KEYWORDS)) {
    if (tagLower.includes(keyword)) {
      matchedEmotion = emotion;
      break;
    }
  }

  // Determine pace from emotion
  const FAST_EMOTIONS: EmotionType[] = ['excitement', 'surprise', 'fear'];
  const SLOW_EMOTIONS: EmotionType[] = ['lingering', 'calm', 'empathy'];
  const pace: 'fast' | 'normal' | 'slow' = FAST_EMOTIONS.includes(matchedEmotion)
    ? 'fast'
    : SLOW_EMOTIONS.includes(matchedEmotion)
      ? 'slow'
      : 'normal';

  return {
    emotion: matchedEmotion,
    intensity: 0.6,
    visual_cue: '',
    bgm_shift: '',
    tts_pace: pace,
  };
}

/** Clean narration text for TTS: collapse whitespace, ensure ending punctuation. */
function cleanTextForTts(text: string): string {
  let cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > 0 && !/[.!?。！？]$/.test(cleaned)) {
    cleaned += '.';
  }
  return cleaned;
}

/** Calculate TTS credit cost based on text length. */
function calculateTtsCreditCost(text: string): number {
  return Math.ceil(text.length / 1000) * TTS_CREDIT_PER_1K_CHARS;
}

/** Delay utility. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error is a 429 rate limit. */
function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many');
  }
  return false;
}

/** Check if an error is a voice-not-found (invalid voice_id) error. */
function isVoiceNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('voice_not_found') || msg.includes('404') || msg.includes('voice not found');
  }
  return false;
}

// ── Single Scene TTS ──

async function generateTtsForScene(
  scene: PilotScriptScene,
  asset: PilotGeneratedAsset,
  language: Language,
): Promise<void> {
  const emotionMeta = buildEmotionMeta(scene.emotionTag);

  // 1. Process narration with emotion audio tags
  const processedText = processNarrationForTTS(scene.narration, emotionMeta, DEFAULT_IMPERFECTION);

  // 2. Clean text
  const cleanedText = cleanTextForTts(processedText);
  if (!cleanedText) return;

  // 3. Select voice
  const defaultVoiceId = LANGUAGE_CONFIG[language]?.defaultVoiceId;
  let voiceId = scene.speakerVoiceId || defaultVoiceId;

  // 4. Get TTS speed from emotion
  const speed = getEmotionTtsPace(emotionMeta);

  // 5. Try ElevenLabs with retries
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateAudioWithElevenLabs(
        cleanedText,
        undefined,
        voiceId,
        undefined,
        { speed, stability: DEFAULT_STABILITY },
      );

      if (result.audioData) {
        asset.audioUrl = result.audioData;
        asset.subtitleData = result.subtitleData;
        asset.audioDuration = result.estimatedDuration;
        asset.creditCost += calculateTtsCreditCost(cleanedText);
        return;
      }

      // audioData is null — treat as failure
      lastError = new Error('ElevenLabs returned null audioData');
    } catch (err) {
      lastError = err;

      // On voice_not_found/404, immediately switch to default voice and retry once
      if (isVoiceNotFoundError(err) && voiceId !== defaultVoiceId && defaultVoiceId) {
        console.warn(
          `[ttsStep] Scene ${scene.sceneNumber}: voice_id "${voiceId}" not found, falling back to default voice "${defaultVoiceId}"`,
        );
        voiceId = defaultVoiceId;
        continue;
      }

      // On 429, wait before retrying
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        await delay(RETRY_429_DELAY_MS);
        continue;
      }
    }
  }

  // 6. Fallback to Gemini TTS
  try {
    const geminiAudio = await generateAudioForScene(cleanedText);
    if (geminiAudio) {
      asset.audioUrl = geminiAudio;
      asset.subtitleData = null;
      asset.audioDuration = null;
      asset.creditCost += calculateTtsCreditCost(cleanedText);
      return;
    }
  } catch {
    // Gemini fallback also failed
  }

  // All attempts failed
  console.error(
    `[ttsStep] Scene ${scene.sceneNumber} TTS failed after ${MAX_RETRIES + 1} attempts + fallback:`,
    lastError,
  );
  asset.errorMessage = `TTS failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`;
}

// ── Main Export ──

export async function runTtsStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
): Promise<void> {
  const total = scenes.length;

  ctx.onProgress({ step: 'tts', current: 0, total, message: 'Starting TTS generation...' });

  // Process in batches of TTS_CONCURRENCY
  for (let batchStart = 0; batchStart < total; batchStart += TTS_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + TTS_CONCURRENCY, total);
    const batchPromises: Promise<void>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(generateTtsForScene(scenes[i], assets[i], ctx.language));
    }

    await Promise.all(batchPromises);

    // Report progress
    ctx.onProgress({
      step: 'tts',
      current: batchEnd,
      total,
      message: `TTS generated for ${batchEnd}/${total} scenes`,
    });

    // Rate limit protection: delay between batches (skip after last batch)
    if (batchEnd < total) {
      await delay(BATCH_DELAY_MS);
    }
  }

  ctx.onProgress({ step: 'tts', current: total, total, message: 'TTS generation complete' });
}
