import type { ScriptScene, EmotionCurve, PlatformVariant, EmotionCurvePoint } from '../types';
import { generateEmotionCurve } from './emotionCurveEngine';

export interface PlatformConfig {
  name: string;
  durationRange: [number, number]; // seconds
  hookDuration: number;            // seconds for opening hook
  ctaDuration: number;             // seconds for CTA at end
  subtitleStyle: 'center_bottom' | 'fullscreen_big';
  bgmStrategy: 'emotion_curve' | 'trending_sound';
  thumbnailNeeded: boolean;
}

const PLATFORM_CONFIGS: Record<PlatformVariant, PlatformConfig> = {
  youtube_shorts: {
    name: 'YouTube Shorts',
    durationRange: [30, 60],
    hookDuration: 2,
    ctaDuration: 3,
    subtitleStyle: 'center_bottom',
    bgmStrategy: 'emotion_curve',
    thumbnailNeeded: true,
  },
  tiktok: {
    name: 'TikTok',
    durationRange: [15, 30],
    hookDuration: 1,
    ctaDuration: 2,
    subtitleStyle: 'fullscreen_big',
    bgmStrategy: 'trending_sound',
    thumbnailNeeded: false,
  },
  youtube_long: {
    name: 'YouTube',
    durationRange: [180, 600],
    hookDuration: 5,
    ctaDuration: 10,
    subtitleStyle: 'center_bottom',
    bgmStrategy: 'emotion_curve',
    thumbnailNeeded: true,
  },
};

export interface PlatformAdaptedContent {
  platform: PlatformVariant;
  config: PlatformConfig;
  scenes: ScriptScene[];
  emotionCurve: EmotionCurve;
  hookScene: ScriptScene | null;
  ctaScene: ScriptScene | null;
  totalDuration: number;
}

/**
 * Adapt scenes for a specific platform.
 * For TikTok: compress to fewer scenes, stronger hook, loop-friendly ending.
 * For YouTube Shorts: balanced pacing, CTA at end.
 * For YouTube Long: full content, detailed pacing.
 */
export function adaptForPlatform(
  scenes: ScriptScene[],
  platform: PlatformVariant,
  storyArc: import('../types').StoryArcType
): PlatformAdaptedContent {
  const config = PLATFORM_CONFIGS[platform];
  const avgSceneDuration = 8; // seconds per scene estimate

  let adaptedScenes = [...scenes];

  if (platform === 'tiktok') {
    // TikTok: max 4-5 scenes (15-30 sec)
    const maxScenes = Math.min(4, scenes.length);
    adaptedScenes = scenes.slice(0, maxScenes);
  } else if (platform === 'youtube_shorts') {
    // YouTube Shorts: max 7-8 scenes (30-60 sec)
    const maxScenes = Math.min(8, scenes.length);
    adaptedScenes = scenes.slice(0, maxScenes);
  }
  // youtube_long: keep all scenes

  const totalDuration = adaptedScenes.length * avgSceneDuration;
  const emotionCurve = generateEmotionCurve(storyArc, platform, totalDuration);

  // Hook scene: first scene with boosted energy
  const hookScene = adaptedScenes[0] || null;

  // CTA scene: last scene
  const ctaScene = adaptedScenes[adaptedScenes.length - 1] || null;

  return {
    platform,
    config,
    scenes: adaptedScenes,
    emotionCurve,
    hookScene,
    ctaScene,
    totalDuration,
  };
}

/**
 * Get platform configuration.
 */
export function getPlatformConfig(platform: PlatformVariant): PlatformConfig {
  return PLATFORM_CONFIGS[platform];
}

/**
 * Get all available platforms.
 */
export function getAvailablePlatforms(): Array<{ id: PlatformVariant; name: string }> {
  return Object.entries(PLATFORM_CONFIGS).map(([id, config]) => ({
    id: id as PlatformVariant,
    name: config.name,
  }));
}
