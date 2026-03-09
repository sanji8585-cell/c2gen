// services/pilot/scriptStep.ts
// C2 PILOT — Script Generation Step
// Generates a brand-aware, emotion-guided script using the existing Gemini API.

import type { EmotionCurve, SceneEmotionMeta, CharacterProfile } from '../../types';
import type { PipelineContext, PilotScriptScene } from './types';
import { generateScript } from '../geminiService';
import { selectStoryArc, generateEmotionCurve, applyEmotionToScenes } from '../emotionCurveEngine';
import { injectEmotionTags } from '../audioTagsService';

// ── Result Type ──

export interface ScriptStepResult {
  scenes: PilotScriptScene[];
  emotionCurve: EmotionCurve;
}

// ── Platform Default Durations (seconds) ──

const PLATFORM_DURATION: Record<string, number> = {
  youtube_shorts: 50,
  tiktok: 25,
  youtube_long: 300,
};

// ── Helper: Build preset context string ──

export function buildPresetContext(ctx: PipelineContext): string {
  const { preset, characters } = ctx;
  const lines: string[] = [];

  // Tone & Voice
  const tone = preset.tone_voice;
  if (tone) {
    lines.push(`[TONE & VOICE]`);
    lines.push(`Style: ${tone.style}`);
    if (tone.formality !== undefined) {
      const formalityLabel = tone.formality > 0.7 ? 'formal' : tone.formality > 0.3 ? 'neutral' : 'casual';
      lines.push(`Formality: ${formalityLabel} (${tone.formality})`);
    }
    if (tone.humor_level !== undefined) {
      const humorLabel = tone.humor_level > 0.7 ? 'high' : tone.humor_level > 0.3 ? 'moderate' : 'low';
      lines.push(`Humor level: ${humorLabel} (${tone.humor_level})`);
    }
    if (tone.catchphrase) {
      lines.push(`Catchphrase to include naturally: "${tone.catchphrase}"`);
    }
    if (tone.forbidden_words && tone.forbidden_words.length > 0) {
      lines.push(`NEVER use these words: ${tone.forbidden_words.join(', ')}`);
    }
  }

  // World View
  if (preset.world_view) {
    lines.push('');
    lines.push(`[WORLD VIEW]`);
    lines.push(preset.world_view);
  }

  // Target Audience
  if (preset.target_audience) {
    lines.push('');
    lines.push(`[TARGET AUDIENCE]`);
    lines.push(preset.target_audience);
  }

  // Character Profiles
  const chars = characters.length > 0 ? characters : preset.character_profiles;
  if (chars && chars.length > 0) {
    lines.push('');
    lines.push(`[CHARACTERS]`);
    for (const c of chars) {
      const roleSuffix = c.char_role === 'main' ? ' (MAIN)' : c.char_role === 'supporting' ? ' (SUPPORTING)' : '';
      lines.push(`- ${c.name}${roleSuffix}: ${c.personality}`);
      if (c.speech_style) {
        lines.push(`  Speech: ${c.speech_style.tone}`);
        if (c.speech_style.catchphrase) {
          lines.push(`  Catchphrase: "${c.speech_style.catchphrase}"`);
        }
      }
    }
  }

  return lines.join('\n');
}

// ── Helper: Build emotion guide string ──

export function buildEmotionGuide(curve: EmotionCurve): string {
  if (!curve.curve_points || curve.curve_points.length === 0) return '';

  const lines: string[] = [];
  lines.push(`[EMOTION CURVE GUIDE — ${curve.story_arc}]`);
  lines.push(`Target duration: ~${curve.total_duration}s | Platform: ${curve.platform_variant}`);
  lines.push('Follow this emotional progression across scenes:');

  for (const pt of curve.curve_points) {
    const pct = Math.round((pt.time_seconds / curve.total_duration) * 100);
    lines.push(`  ${pct}% — ${pt.label}: ${pt.emotion} (intensity ${pt.intensity})`);
  }

  lines.push('Adjust narration pacing and intensity to match the emotion at each point.');

  return lines.join('\n');
}

// ── Helper: Find best matching character for a scene ──

function findSpeaker(
  scene: { analysis?: { directives?: { SPEAKER?: string } } },
  characters: CharacterProfile[],
): CharacterProfile | undefined {
  if (characters.length === 0) return undefined;

  // If scene has a SPEAKER directive, match by name
  const speakerName = scene.analysis?.directives?.SPEAKER;
  if (speakerName) {
    const match = characters.find(
      (c) => c.name.toLowerCase() === speakerName.toLowerCase(),
    );
    if (match) return match;
  }

  // Default to main character
  const main = characters.find((c) => c.char_role === 'main');
  return main || characters[0];
}

// ── Main: runScriptStep ──

export async function runScriptStep(ctx: PipelineContext): Promise<ScriptStepResult> {
  const { topic, preset, characters, platform, language, onProgress } = ctx;

  onProgress({ step: 'script', current: 0, total: 3, message: 'Analyzing story arc...' });

  // 1. Generate emotion curve locally
  const arcType = selectStoryArc(topic);
  const totalDuration = PLATFORM_DURATION[platform] || 60;
  const emotionCurve = ctx.emotionCurve || generateEmotionCurve(arcType, platform, totalDuration);

  onProgress({ step: 'script', current: 1, total: 3, message: 'Generating script...' });

  // 2. Build enriched sourceContext (truncate to prevent Gemini JSON corruption)
  const presetContext = buildPresetContext(ctx);
  const emotionGuide = buildEmotionGuide(emotionCurve);
  let sourceContext = [presetContext, emotionGuide].filter(Boolean).join('\n\n');
  if (sourceContext.length > 2000) sourceContext = sourceContext.slice(0, 2000) + '\n...';

  // 3. Call existing Gemini script generation (with retry on JSON parse error)
  const hasRef = characters.some(
    (c) => c.reference_sheet?.original_upload || c.reference_sheet?.style_converted,
  );
  let rawScenes;
  try {
    rawScenes = await generateScript(topic, hasRef, sourceContext || null, language);
  } catch (e: any) {
    // If JSON parse error, retry without sourceContext
    if (e?.message?.includes('JSON') || e?.message?.includes('position')) {
      console.warn('[scriptStep] JSON parse error with sourceContext, retrying without it');
      rawScenes = await generateScript(topic, hasRef, null, language);
    } else {
      throw e;
    }
  }

  onProgress({ step: 'script', current: 2, total: 3, message: 'Applying emotion curve...' });

  // 4. Apply emotion curve to scenes
  const emotionScenes = applyEmotionToScenes(emotionCurve, rawScenes);

  // 5. Map characters and build PilotScriptScene[]
  const allChars = characters.length > 0 ? characters : preset.character_profiles || [];

  const pilotScenes: PilotScriptScene[] = emotionScenes.map((scene) => {
    const emotionMeta = (scene as { emotionMeta?: SceneEmotionMeta }).emotionMeta;
    const speaker = findSpeaker(scene, allChars);

    return {
      sceneNumber: scene.sceneNumber,
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      analysis: scene.analysis,
      speakerName: speaker?.name,
      speakerVoiceId: speaker?.voice_id,
      emotionTag: emotionMeta ? injectEmotionTags('', emotionMeta).trim() : undefined,
    };
  });

  onProgress({ step: 'script', current: 3, total: 3, message: 'Script complete' });

  return {
    scenes: pilotScenes,
    emotionCurve,
  };
}
