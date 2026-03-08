import type {
  StoryArcType,
  EmotionType,
  PlatformVariant,
  EmotionCurvePoint,
  EmotionCurve,
  SceneEmotionMeta,
  ScriptScene,
} from '../types';

// ─── 1. Story Arc Definitions ───────────────────────────────────────────────

export const STORY_ARCS: Record<StoryArcType, {
  name: string;
  nameKo: string;
  structure: string;
  suitableFor: string;
  defaultPoints: Array<{ timePercent: number; emotion: EmotionType; intensity: number; label: string }>;
}> = {
  problem_solution: {
    name: 'Problem → Solution',
    nameKo: '문제→해결',
    structure: '고민 → 원인 → 해결책 → 효과',
    suitableFor: '정보/팁 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'curiosity', intensity: 0.8, label: '후킹' },
      { timePercent: 15, emotion: 'tension', intensity: 0.6, label: '문제 제기' },
      { timePercent: 40, emotion: 'empathy', intensity: 0.7, label: '공감' },
      { timePercent: 70, emotion: 'excitement', intensity: 0.8, label: '해결' },
      { timePercent: 90, emotion: 'warmth', intensity: 0.5, label: 'CTA' },
    ],
  },
  reversal: {
    name: 'Reversal',
    nameKo: '반전형',
    structure: '예상 설정 → 뒤집기 → 진짜 결론',
    suitableFor: '호기심/바이럴 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'curiosity', intensity: 0.9, label: '후킹' },
      { timePercent: 30, emotion: 'calm', intensity: 0.5, label: '설정' },
      { timePercent: 60, emotion: 'tension', intensity: 0.7, label: '빌드업' },
      { timePercent: 80, emotion: 'surprise', intensity: 1.0, label: '반전!' },
      { timePercent: 95, emotion: 'warmth', intensity: 0.6, label: '결론' },
    ],
  },
  emotional: {
    name: 'Emotional Arc',
    nameKo: '감동형',
    structure: '일상 → 점진적 감정 상승 → 클라이맥스',
    suitableFor: '브랜디드/감성 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'calm', intensity: 0.4, label: '일상' },
      { timePercent: 25, emotion: 'curiosity', intensity: 0.5, label: '발견' },
      { timePercent: 50, emotion: 'empathy', intensity: 0.7, label: '공감' },
      { timePercent: 75, emotion: 'warmth', intensity: 0.9, label: '클라이맥스' },
      { timePercent: 95, emotion: 'lingering', intensity: 0.6, label: '여운' },
    ],
  },
  horror_warning: {
    name: 'Horror/Warning',
    nameKo: '공포/경고형',
    structure: '긴장 → 충격 → 해결/교훈',
    suitableFor: '사회이슈 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'tension', intensity: 0.7, label: '긴장' },
      { timePercent: 30, emotion: 'fear', intensity: 0.8, label: '위험 신호' },
      { timePercent: 60, emotion: 'surprise', intensity: 1.0, label: '충격' },
      { timePercent: 80, emotion: 'calm', intensity: 0.5, label: '해결' },
      { timePercent: 95, emotion: 'warmth', intensity: 0.4, label: '교훈' },
    ],
  },
  humor: {
    name: 'Comedy',
    nameKo: '웃음형',
    structure: '설정 → 기대 쌓기 → 뒤집기',
    suitableFor: '유머/밈 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'curiosity', intensity: 0.7, label: '설정' },
      { timePercent: 30, emotion: 'excitement', intensity: 0.6, label: '기대' },
      { timePercent: 60, emotion: 'tension', intensity: 0.8, label: '빌드업' },
      { timePercent: 80, emotion: 'surprise', intensity: 1.0, label: '펀치라인' },
      { timePercent: 95, emotion: 'warmth', intensity: 0.5, label: '마무리' },
    ],
  },
  educational: {
    name: 'Educational',
    nameKo: '교육형',
    structure: '궁금증 → 단계별 설명 → 아하!',
    suitableFor: '강의/가이드 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'curiosity', intensity: 0.8, label: '궁금증' },
      { timePercent: 25, emotion: 'calm', intensity: 0.5, label: '기본 설명' },
      { timePercent: 50, emotion: 'curiosity', intensity: 0.6, label: '심화' },
      { timePercent: 75, emotion: 'excitement', intensity: 0.8, label: '아하!' },
      { timePercent: 95, emotion: 'warmth', intensity: 0.4, label: '정리' },
    ],
  },
  vlog: {
    name: 'Daily Vlog',
    nameKo: '일상 브이로그',
    structure: '잔잔한 흐름 + 작은 포인트들',
    suitableFor: '일상/라이프 콘텐츠',
    defaultPoints: [
      { timePercent: 0, emotion: 'calm', intensity: 0.5, label: '시작' },
      { timePercent: 25, emotion: 'warmth', intensity: 0.6, label: '일상' },
      { timePercent: 50, emotion: 'excitement', intensity: 0.7, label: '포인트' },
      { timePercent: 75, emotion: 'calm', intensity: 0.5, label: '일상' },
      { timePercent: 95, emotion: 'lingering', intensity: 0.4, label: '마무리' },
    ],
  },
  series: {
    name: 'Series',
    nameKo: '시리즈 연결형',
    structure: '이전편 요약 → 본편 → 다음편 떡밥',
    suitableFor: '연재물',
    defaultPoints: [
      { timePercent: 0, emotion: 'curiosity', intensity: 0.6, label: '이전편 요약' },
      { timePercent: 15, emotion: 'excitement', intensity: 0.7, label: '본편 시작' },
      { timePercent: 50, emotion: 'tension', intensity: 0.8, label: '클라이맥스' },
      { timePercent: 80, emotion: 'surprise', intensity: 0.9, label: '떡밥' },
      { timePercent: 95, emotion: 'curiosity', intensity: 0.8, label: '다음편 예고' },
    ],
  },
};

// ─── 2. Platform Modifiers ──────────────────────────────────────────────────

const PLATFORM_MODIFIERS: Record<PlatformVariant, {
  durationRange: [number, number];
  hookIntensityBoost: number;
  paceMultiplier: number;
}> = {
  youtube_shorts: { durationRange: [30, 60], hookIntensityBoost: 0.1, paceMultiplier: 1.0 },
  tiktok: { durationRange: [15, 30], hookIntensityBoost: 0.2, paceMultiplier: 1.5 },
  youtube_long: { durationRange: [180, 600], hookIntensityBoost: 0, paceMultiplier: 0.7 },
};

// ─── 3. Emotion → Visual/BGM/Subtitle Mappings ─────────────────────────────

const EMOTION_MAPPINGS: Record<EmotionType, {
  visual_cue: string;
  bgm_shift: string;
  subtitle_style: string;
}> = {
  curiosity: { visual_cue: 'quick_zoom_text', bgm_shift: 'mystery_buildup', subtitle_style: 'big_bold_question' },
  tension: { visual_cue: 'slow_pan_dark', bgm_shift: 'dark_bass', subtitle_style: 'red_highlight' },
  surprise: { visual_cue: 'cut_flash', bgm_shift: 'impact_hit', subtitle_style: 'shake_exclaim' },
  empathy: { visual_cue: 'slow_dissolve', bgm_shift: 'gentle_piano', subtitle_style: 'soft_font' },
  warmth: { visual_cue: 'warm_dissolve', bgm_shift: 'warm_acoustic', subtitle_style: 'pastel_bg' },
  lingering: { visual_cue: 'slow_fadeout', bgm_shift: 'fadeout', subtitle_style: 'small_font' },
  excitement: { visual_cue: 'fast_montage', bgm_shift: 'upbeat_pop', subtitle_style: 'bold_colors' },
  calm: { visual_cue: 'gentle_pan', bgm_shift: 'ambient_pad', subtitle_style: 'clean_minimal' },
  fear: { visual_cue: 'dark_vignette', bgm_shift: 'suspense_strings', subtitle_style: 'dark_red' },
};

// ─── 4. Functions ───────────────────────────────────────────────────────────

/** Select the best story arc type based on topic keywords (local heuristics). */
export function selectStoryArc(topic: string): StoryArcType {
  const lower = topic.toLowerCase();
  if (/해결|방법|팁|가이드|how to/i.test(lower)) return 'problem_solution';
  if (/반전|놀라|충격|shocking/i.test(lower)) return 'reversal';
  if (/감동|눈물|따뜻|touching/i.test(lower)) return 'emotional';
  if (/위험|경고|주의|사건|사고/i.test(lower)) return 'horror_warning';
  if (/웃긴|유머|ㅋㅋ|funny|meme/i.test(lower)) return 'humor';
  if (/배우|강의|설명|교육|tutorial/i.test(lower)) return 'educational';
  if (/일상|브이로그|vlog|daily/i.test(lower)) return 'vlog';
  if (/시리즈|ep\.|episode|편/i.test(lower)) return 'series';
  return 'problem_solution';
}

/** Generate a full emotion curve by applying arc defaults + platform modifiers. */
export function generateEmotionCurve(
  arc: StoryArcType,
  platform: PlatformVariant,
  totalDuration: number,
): EmotionCurve {
  const arcDef = STORY_ARCS[arc];
  const modifier = PLATFORM_MODIFIERS[platform];

  const curvePoints: EmotionCurvePoint[] = arcDef.defaultPoints.map((pt, idx) => {
    // Apply pace multiplier: compress or expand timing around center (50%)
    const adjustedPercent = Math.min(
      100,
      Math.max(0, 50 + (pt.timePercent - 50) * modifier.paceMultiplier),
    );
    const timeSeconds = (adjustedPercent / 100) * totalDuration;

    // Boost first point intensity for short-form platforms
    let intensity = pt.intensity;
    if (idx === 0) {
      intensity = Math.min(1.0, intensity + modifier.hookIntensityBoost);
    }

    const mapping = EMOTION_MAPPINGS[pt.emotion];

    return {
      time_seconds: Math.round(timeSeconds * 10) / 10,
      emotion: pt.emotion,
      intensity,
      visual_cue: mapping.visual_cue,
      bgm_shift: mapping.bgm_shift,
      subtitle_style: mapping.subtitle_style,
      label: pt.label,
    };
  });

  return {
    story_arc: arc,
    platform_variant: platform,
    total_duration: totalDuration,
    curve_points: curvePoints,
  };
}

/** Map each scene to the nearest emotion curve point and attach SceneEmotionMeta. */
export function applyEmotionToScenes(
  curve: EmotionCurve,
  scenes: ScriptScene[],
): (ScriptScene & { emotionMeta?: SceneEmotionMeta })[] {
  if (scenes.length === 0 || curve.curve_points.length === 0) return scenes;

  return scenes.map((scene, idx) => {
    const sceneTimePercent = scenes.length === 1 ? 0 : idx / (scenes.length - 1);
    const sceneTimeSeconds = sceneTimePercent * curve.total_duration;

    // Find the nearest curve point
    let nearest = curve.curve_points[0];
    let minDist = Math.abs(nearest.time_seconds - sceneTimeSeconds);
    for (let i = 1; i < curve.curve_points.length; i++) {
      const dist = Math.abs(curve.curve_points[i].time_seconds - sceneTimeSeconds);
      if (dist < minDist) {
        minDist = dist;
        nearest = curve.curve_points[i];
      }
    }

    const emotionMeta: SceneEmotionMeta = {
      emotion: nearest.emotion,
      intensity: nearest.intensity,
      visual_cue: nearest.visual_cue,
      bgm_shift: nearest.bgm_shift,
      subtitle_style: nearest.subtitle_style,
    };

    return { ...scene, emotionMeta };
  });
}

/** Linear interpolation of intensity at a given time (seconds). */
export function interpolateIntensity(curve: EmotionCurve, timeSeconds: number): number {
  const points = curve.curve_points;
  if (points.length === 0) return 0;
  if (timeSeconds <= points[0].time_seconds) return points[0].intensity;
  if (timeSeconds >= points[points.length - 1].time_seconds) return points[points.length - 1].intensity;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (timeSeconds >= a.time_seconds && timeSeconds <= b.time_seconds) {
      const t = (timeSeconds - a.time_seconds) / (b.time_seconds - a.time_seconds);
      return a.intensity + t * (b.intensity - a.intensity);
    }
  }

  return points[points.length - 1].intensity;
}
