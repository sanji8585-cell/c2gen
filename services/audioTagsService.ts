import type { EmotionType, SceneEmotionMeta } from '../types';

// ── Emotion to Audio Tags mapping ──
const EMOTION_TAG_MAP: Record<EmotionType, string[]> = {
  curiosity: ['[curiously]', '[intrigued]'],
  tension: ['[tense]', '[nervously]'],
  surprise: ['[surprised]', '[gasps]', '[excited]'],
  empathy: ['[softly]', '[gently]', '[warmly]'],
  warmth: ['[warmly]', '[smiling]', '[happily]'],
  lingering: ['[softly]', '[pause]', '[reflectively]'],
  excitement: ['[excited]', '[enthusiastically]', '[energetically]'],
  calm: ['[calmly]', '[peacefully]'],
  fear: ['[fearfully]', '[whispers]', '[nervously]'],
};

// ── Imperfection elements ──
const IMPERFECTION_TAGS = {
  hesitation: ['[hesitantly]', '[pause]', '[clears throat]'],
  sigh: ['[sigh]', '[deep breath]'],
  laugh: ['[laughs]', '[chuckles]', '[giggles]'],
  whisper: ['[whispers]', '[softly]'],
  emotion_spike: ['[excited]', '[surprised]', '[gasps]'],
};

/**
 * Inject emotion-based audio tags into narration text.
 * Uses the scene's emotion metadata to select appropriate tags.
 */
export function injectEmotionTags(
  narration: string,
  emotionMeta?: SceneEmotionMeta
): string {
  if (!emotionMeta) return narration;

  const tags = EMOTION_TAG_MAP[emotionMeta.emotion] || [];
  if (tags.length === 0) return narration;

  // Pick a tag based on intensity
  const tag = tags[Math.min(Math.floor(emotionMeta.intensity * tags.length), tags.length - 1)];

  // Insert at the beginning of the narration
  return `${tag} ${narration}`;
}

/**
 * Inject imperfection elements to make TTS sound more natural.
 * imperfectionLevel: 0 (none) to 1 (maximum)
 */
export function injectImperfections(
  narration: string,
  imperfectionLevel: number = 0.3
): string {
  if (imperfectionLevel <= 0) return narration;

  const sentences = narration.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 1) return narration;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // Decide whether to inject an imperfection before this sentence
    if (i > 0 && Math.random() < imperfectionLevel * 0.5) {
      const types = Object.keys(IMPERFECTION_TAGS) as (keyof typeof IMPERFECTION_TAGS)[];
      const type = types[Math.floor(Math.random() * types.length)];
      const options = IMPERFECTION_TAGS[type];
      const tag = options[Math.floor(Math.random() * options.length)];
      result.push(`${tag} ${sentence}`);
    } else {
      result.push(sentence);
    }
  }

  return result.join(' ');
}

/**
 * Apply both emotion tags and imperfections.
 * This is the main entry point used during TTS generation.
 */
export function processNarrationForTTS(
  narration: string,
  emotionMeta?: SceneEmotionMeta,
  imperfectionLevel: number = 0.3
): string {
  let processed = narration;
  processed = injectEmotionTags(processed, emotionMeta);
  if (imperfectionLevel > 0) {
    processed = injectImperfections(processed, imperfectionLevel);
  }
  return processed;
}

/**
 * Get TTS pace setting based on emotion metadata.
 * Returns speed multiplier for ElevenLabs API.
 */
export function getEmotionTtsPace(emotionMeta?: SceneEmotionMeta): number {
  if (!emotionMeta) return 1.0;
  switch (emotionMeta.tts_pace) {
    case 'fast': return 1.15;
    case 'slow': return 0.85;
    default: return 1.0;
  }
}
