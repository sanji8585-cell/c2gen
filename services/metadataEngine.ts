import type { ScriptScene, EmotionCurve, PlatformVariant } from '../types';

// ── Title patterns ──
const TITLE_PATTERNS = {
  question: (topic: string) => `${topic}, 정말 괜찮을까?`,
  number: (topic: string) => `${topic}의 3가지 비밀`,
  reversal: (topic: string) => `${topic}인 줄 알았는데... 반전 있음`,
  direct: (topic: string) => `${topic} 총정리`,
  emotional: (topic: string) => `${topic}, 보고 나면 마음이 따뜻해져요`,
};

export type TitlePattern = keyof typeof TITLE_PATTERNS;

export interface ContentMetadata {
  youtube: {
    titles: Array<{ text: string; pattern: TitlePattern }>;
    description: string;
    tags: string[];
    thumbnail_text: string;
  };
  tiktok: {
    caption: string;
    hashtags: string[];
    comment_bait: string;
  };
}

/**
 * Generate metadata for both platforms from script and topic.
 * This is a local generation (no API call) — Gemini-powered version can be added later.
 */
export function generateMetadata(
  topic: string,
  scenes: ScriptScene[],
  emotionCurve?: EmotionCurve | null
): ContentMetadata {
  const narrations = scenes.map(s => s.narration).join(' ');
  const keyPhrases = extractKeyPhrases(narrations);

  // YouTube titles (3 variants with different patterns)
  const patterns: TitlePattern[] = ['question', 'reversal', 'number'];
  const titles = patterns.map(pattern => ({
    text: TITLE_PATTERNS[pattern](topic),
    pattern,
  }));

  // YouTube description
  const description = `${topic}에 대해 알아봅니다.\n\n` +
    scenes.slice(0, 3).map((s, i) => `${i + 1}. ${s.narration.slice(0, 50)}...`).join('\n') +
    `\n\n#${topic.replace(/\s+/g, '')} #shorts`;

  // Tags
  const tags = [topic, ...keyPhrases.slice(0, 5), 'shorts', 'AI'];

  // Thumbnail text — use highest intensity point from emotion curve
  let thumbnailText = topic;
  if (emotionCurve?.curve_points?.length) {
    const peak = emotionCurve.curve_points.reduce((max, p) => p.intensity > max.intensity ? p : max);
    const peakScene = scenes[Math.floor((peak.time_seconds / emotionCurve.total_duration) * scenes.length)];
    if (peakScene) {
      thumbnailText = peakScene.narration.slice(0, 20) + '?!';
    }
  }

  // TikTok
  const caption = `${topic} 알고 계셨나요? 끝까지 보세요! 👀`;
  const hashtags = [`#${topic.replace(/\s+/g, '')}`, '#알쓸신잡', '#꿀팁', '#shorts', '#틱톡'];
  const commentBait = '이거 몰랐던 사람 손들어 🙋‍♂️';

  return {
    youtube: { titles, description, tags, thumbnail_text: thumbnailText },
    tiktok: { caption, hashtags, comment_bait: commentBait },
  };
}

function extractKeyPhrases(text: string): string[] {
  // Simple keyword extraction — extract nouns/key terms
  const words = text.split(/[\s,.\-!?]+/).filter(w => w.length >= 2 && w.length <= 10);
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}
