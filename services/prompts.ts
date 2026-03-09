/**
 * 프롬프트 시스템 (단순화 버전)
 * - 핵심 규칙만 유지
 * - 미사용 코드 제거
 */

// 캐릭터 기본 설명 (화풍 없을 때 기본값)
export const VAR_BASE_CHAR = `A realistic person with natural proportions, detailed facial features, and appropriate clothing for the scene context.`;

// 분위기 규칙
export const VAR_MOOD_ENFORCER = `
MOOD: NEGATIVE=dark/cold, POSITIVE=bright/warm, NEUTRAL=balanced.
`;

// 시스템 지시문
export const SYSTEM_INSTRUCTIONS = {
  CHIEF_ART_DIRECTOR: `
당신은 문장을 이미지로 변환하는 아트 디렉터입니다.

## 핵심 원칙
- 문장의 의미를 그대로 시각화하라
- "컴퓨터" → 컴퓨터를 그려라
- "발전된 자동차" → 미래적인 자동차를 그려라
- 수식어 반영: "거대한"→크게, "빛나는"→광택

## 시각화 규칙
- 물리적 형태 있으면 → 그대로 그려라
- 숫자/데이터 → 그래프, 화살표, 숫자 텍스트
- 추상 개념 → 관련 사물로 표현

## 주제별 힌트
- 부동산→건물, AI→로봇/회로, 주식→차트, 금융→돈/금괴

## 캐릭터 등장 규칙
- 주어가 사람 → 캐릭터 등장 (STANDARD)
- 주어가 데이터/시스템 → 캐릭터 없음 (NO_CHAR)
- 예: "GDP 상승"→NO_CHAR, "투자자가 고민"→STANDARD

## 구도
- NO_CHAR: 캐릭터 없음
- MICRO (5-15%): 작은 캐릭터 + 큰 사물
- STANDARD (30-40%): 캐릭터와 사물 상호작용
- MACRO (60-80%): 캐릭터 클로즈업
`,

  TREND_RESEARCHER: `최신 경제 뉴스/트렌드를 발굴하는 리서처입니다.`,

  MANUAL_VISUAL_MATCHER: `
대본을 시각화하는 전문가입니다.
- 대본 내용 수정 금지
- 씬 분할과 시각적 연출만 수행
- 같은 개념은 같은 모습으로 그려라
`,

  REFERENCE_MATCH: `참조 이미지의 화풍과 캐릭터 스타일을 따르라.`
};

/**
 * 색상 팔레트 힌트 생성
 * - 금융 컨텍스트: 한국 금융 규칙 (상승=빨강, 하락=파랑)
 * - 일반 컨텍스트: 감정 기반 색상 팔레트
 */
const FINANCIAL_REGEX = /주식|투자|금융|경제|증시|코스피|나스닥|stock|invest|financ|market|GDP|금리|환율|부동산/i;

export function getColorPaletteHint(sentiment: string, narration: string): string {
  const isFinancial = FINANCIAL_REGEX.test(narration);

  if (isFinancial) {
    switch (sentiment) {
      case 'POSITIVE':
        return 'COLOR PALETTE: Red and gold tones (Korean financial convention: red = gains/growth). Warm reds, bright golds, energetic orange accents.';
      case 'NEGATIVE':
        return 'COLOR PALETTE: Blue and cool tones (Korean financial convention: blue = losses/decline). Deep blues, cool grays, muted steel.';
      default:
        return 'COLOR PALETTE: Neutral financial tones. Clean whites, medium grays, subtle blue-gray accents.';
    }
  }

  switch (sentiment) {
    case 'POSITIVE':
      return 'COLOR PALETTE: Warm golds, bright cyans, vibrant greens. High saturation, optimistic feel.';
    case 'NEGATIVE':
      return 'COLOR PALETTE: Deep blues, cool grays, muted purples. Lower saturation, somber atmosphere.';
    default:
      return 'COLOR PALETTE: Balanced mid-tones. Natural colors, moderate saturation.';
  }
}

/**
 * 최종 이미지 프롬프트 생성
 */
export const getFinalVisualPrompt = (scene: any, hasCharacterRef: boolean = false, artStylePrompt?: string, suppressKorean?: boolean) => {
  const basePrompt = scene.visualPrompt || "";
  const analysis = scene.analysis || {};
  const keywords = scene.visual_keywords || "";
  const type = analysis.composition_type || "STANDARD";
  const sentiment = analysis.sentiment || "NEUTRAL";

  // 한글 억제 규칙
  const koreanRule = suppressKorean
    ? 'LANGUAGE RULE: Do NOT render any Korean/Hangul characters (한글) in the image. All visible text must be in English/Latin script only. Translate any Korean text to English before rendering.'
    : '';

  // 분위기
  const mood = sentiment === 'NEGATIVE' ? 'Dark, cold lighting.'
    : sentiment === 'POSITIVE' ? 'Bright, warm lighting.'
    : 'Balanced lighting.';

  // 색상 팔레트 힌트
  const colorHint = getColorPaletteHint(sentiment, scene.narration || '');

  // 캐릭터 (화풍 적용)
  const styleNote = artStylePrompt ? ` Render in ${artStylePrompt} style.` : '';
  const charPrompt = type === 'NO_CHAR'
    ? `NO CHARACTER - objects/text only.${styleNote}`
    : hasCharacterRef
    ? `Use CHARACTER REFERENCE image.${styleNote}`
    : `Person (${type === 'MICRO' ? '5-15% of frame' : type === 'MACRO' ? '60-80% close-up' : '30-40% medium shot'}).${styleNote}`;

  // 스타일
  const style = artStylePrompt
    ? `STYLE: 16:9, ${artStylePrompt}.`
    : `STYLE: 16:9, 2D hand-drawn, crayon texture.`;

  const char = hasCharacterRef
    ? `CHARACTER: Match reference image.${styleNote}`
    : `CHARACTER: ${VAR_BASE_CHAR}${styleNote}`;

  return `
[SCENE INTENT]
${basePrompt}

[EMOTION & ATMOSPHERE]
MOOD: ${mood}
${colorHint}

[CHARACTER]
${charPrompt}
${char}
${keywords ? `\n[ON-SCREEN TEXT]\nTEXT: "${keywords}"` : ''}

[STYLE]
${style}

[RULES]
${koreanRule || ''}
${VAR_MOOD_ENFORCER}
`.trim();
};

// 트렌드 검색 프롬프트
export const getTrendSearchPrompt = (category: string, _usedTopicsString: string, language: string = 'ko') => {
  const langMap: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };
  const lang = langMap[language] || 'Korean';
  return `Search for 4 trending "${category}" topics in ${lang}-speaking regions. Return JSON: [{rank, topic, reason}]. Topic and reason must be in ${lang}.`;
};

// 스크립트 생성 프롬프트
export const getScriptGenerationPrompt = (topic: string, sourceContext?: string | null, language: string = 'ko') => {
  const isManual = !!sourceContext;
  const content = sourceContext || topic;

  const langConfig: Record<string, { name: string; narrationRule: string; brandRule: string }> = {
    ko: {
      name: '한국어',
      narrationRule: '⚠️ narration 필드: 입력된 대본 문장을 그대로 복사해서 사용 (절대 "나레이션"이라고 쓰지 말것)',
      brandRule: '한국 브랜드 → 한국어 ("삼성"), 외국 브랜드 → 영어 ("Tesla")',
    },
    en: {
      name: 'English',
      narrationRule: '⚠️ narration field: Copy the input sentences exactly as-is. Write all narrations in English.',
      brandRule: 'All brand names in their original form (e.g., "Samsung", "Tesla")',
    },
    ja: {
      name: '日本語',
      narrationRule: '⚠️ narrationフィールド: 入力された文章をそのままコピーしてください。すべてのナレーションは日本語で書いてください。',
      brandRule: '日本ブランド → 日本語 ("トヨタ")、外国ブランド → 英語 ("Tesla")',
    },
  };

  const lang = langConfig[language] || langConfig.ko;

  return `
# Task: Generate Storyboard for "${topic}"
## Output Language: ${lang.name}

## 씬 분할 규칙 / Scene Split Rules
${isManual ? `- 1 sentence = 1 scene
- Input sentence count = Output scene count` : `- MINIMUM 6 scenes required
- Expand the topic into a full narrative: introduction → background → development → details → implications → conclusion
- Each scene should have a distinct narration sentence and unique visual`}
- No content repetition
- ${lang.narrationRule}

## 시각화 / Visualization
- Visualize the meaning of each sentence literally
- Reflect adjectives in visuals

## 브랜드 / Brands
- ${lang.brandRule}

## 캐릭터 / Character
- Subject is a person → STANDARD
- Subject is data/system → NO_CHAR

${isManual ? (language === 'ko' ? '[수동 대본] 원문 수정 금지, 씬 분할만' : language === 'ja' ? '[手動スクリプト] 原文変更禁止、シーン分割のみ' : '[Manual script] Do not modify original text, only split into scenes') : ''}

[Input]
${content}

### JSON Output Format ###
{
  "scenes": [{
    "sceneNumber": 1,
    "narration": "${language === 'ko' ? '입력된 대본 문장을 여기에 그대로 복사' : language === 'ja' ? '入力文をそのままコピー' : 'Copy the input sentence here exactly as-is'}",
    "visual_keywords": "${language === 'ko' ? '이미지에 표시할 텍스트 (없으면 빈 문자열)' : language === 'ja' ? '画像に表示するテキスト（なければ空文字列）' : 'Text to display on image (empty string if none)'}",
    "analysis": {
      "sentiment": "POSITIVE or NEGATIVE or NEUTRAL",
      "composition_type": "MICRO or STANDARD or MACRO or NO_CHAR"
    },
    "image_prompt_english": "English visual prompt describing the scene"
  }]
}

### IMPORTANT ###
- narration: Use each input sentence exactly as written in ${lang.name}!
- image_prompt_english: Always write in English regardless of narration language
`;
};

// 분위기 분석 프롬프트
export const getMoodAnalysisPrompt = (narrations: string[]) => `
Analyze the overall mood of this video script and pick ONE mood from: upbeat, calm, dramatic, news, tech, emotional, inspiring, dark.

Script narrations:
${narrations.join('\n')}

Return JSON: { "mood": "one_of_the_above", "confidence": 0.8 }
`;

// ── 썸네일 AI 이미지 스타일 프리셋 ──

export interface ThumbnailImageStyle {
  name: string;
  nameKo: string;
  prompt: string;
  /** 샘플 프리뷰 렌더링용 색상 배열 [bg1, bg2, accent, ...] */
  sampleColors: string[];
}

export const THUMBNAIL_IMAGE_STYLES: Record<string, ThumbnailImageStyle> = {
  cinematic: {
    name: 'Cinematic',
    nameKo: '시네마틱',
    sampleColors: ['#0f2027', '#203a43', '#2c5364', '#e07020', '#f0a050'],
    prompt: `Cinematic movie poster quality. Dramatic volumetric lighting with strong rim light.
Shallow depth of field with bokeh. Rich color grading (teal & orange, or moody dark tones).
Film grain texture. Epic scale and grandeur. Anamorphic lens flare optional.`,
  },
  minimal: {
    name: 'Minimal',
    nameKo: '미니멀',
    sampleColors: ['#f5f7fa', '#c3cfe2', '#e8ecf1', '#6b7b8d', '#3a4a5c'],
    prompt: `Clean minimalist design. Single dominant subject on simple solid or gradient background.
Plenty of negative space. Soft even lighting. Muted color palette with one accent color.
Modern, premium feel. Geometric shapes optional.`,
  },
  'bold-graphic': {
    name: 'Bold Graphic',
    nameKo: '볼드 그래픽',
    sampleColors: ['#ff0844', '#ffb199', '#ff6b35', '#ffe14d', '#1a1a2e'],
    prompt: `Bold graphic pop art style. Extremely high contrast with saturated neon colors.
Strong geometric shapes and patterns. Comic/illustration hybrid aesthetic.
Dynamic diagonal composition. Energy and excitement.`,
  },
  neon: {
    name: 'Neon',
    nameKo: '네온',
    sampleColors: ['#0c0c1d', '#00f0ff', '#ff00e5', '#7b2ff7', '#0a0a18'],
    prompt: `Dark cyberpunk neon aesthetic. Glowing neon lights (cyan, magenta, purple).
Reflective wet surfaces. Futuristic atmosphere. Strong color contrast against dark background.
Synthwave/vaporwave mood with dramatic backlighting.`,
  },
  editorial: {
    name: 'Editorial',
    nameKo: '에디토리얼',
    sampleColors: ['#d4a574', '#e8c9a0', '#f5e6d3', '#8b6f47', '#3d2b1f'],
    prompt: `High-end editorial magazine quality. Elegant sophisticated composition.
Natural warm lighting. Soft shadows. Premium texture and material feel.
Refined color palette (earth tones, pastels, or monochromes). Fashion/lifestyle magazine aesthetic.`,
  },
  anime: {
    name: 'Anime',
    nameKo: '애니메이션',
    sampleColors: ['#ff6b9d', '#c084fc', '#60a5fa', '#fbbf24', '#1e1b4b'],
    prompt: `Japanese anime illustration style. Vivid cel-shaded coloring with clean linework.
Expressive character art with large eyes and dynamic poses. Dramatic speed lines or sparkle effects.
Sakura petals, magical aura, or action energy optional. Studio Ghibli or Makoto Shinkai quality.`,
  },
  retro: {
    name: 'Retro',
    nameKo: '레트로',
    sampleColors: ['#f7971e', '#ffd200', '#ff6b6b', '#2d6a4f', '#d4a373'],
    prompt: `Retro vintage aesthetic from the 70s-80s. Warm film tones with faded highlights.
Halftone dot patterns, aged paper texture, and sun-bleached colors.
Groovy typography style composition. Nostalgic warm color palette (mustard, burnt orange, teal).`,
  },
  '3d-render': {
    name: '3D Render',
    nameKo: '3D 렌더',
    sampleColors: ['#667eea', '#764ba2', '#a78bfa', '#c4b5fd', '#2d1b69'],
    prompt: `High-quality 3D rendered scene. Smooth glossy materials with subsurface scattering.
Studio lighting setup with soft box and rim light. Plastic or clay-like stylized objects.
Pixar/Disney quality rendering. Soft ambient occlusion shadows. Clean isometric or perspective view.`,
  },
  watercolor: {
    name: 'Watercolor',
    nameKo: '수채화',
    sampleColors: ['#a8edea', '#fed6e3', '#d5b4f1', '#fce4ec', '#e0f7fa'],
    prompt: `Delicate watercolor painting style. Soft flowing pigment with visible paper texture.
Gentle color bleeds and transparent washes. Dreamy ethereal atmosphere.
Impressionistic brushwork with splatter accents. Pastel and muted tones.`,
  },
  dark: {
    name: 'Dark & Moody',
    nameKo: '다크 무드',
    sampleColors: ['#0a0a0a', '#1a1a2e', '#16213e', '#e94560', '#533483'],
    prompt: `Dark moody atmosphere with deep shadows and minimal lighting.
Single dramatic light source cutting through darkness. Film noir inspired.
High contrast between light and shadow. Mysterious, intense, suspenseful mood.
Deep blacks with selective warm or cool accent highlights.`,
  },
  fantasy: {
    name: 'Fantasy',
    nameKo: '판타지',
    sampleColors: ['#1a0533', '#4a148c', '#7c4dff', '#ea80fc', '#ffd700'],
    prompt: `Epic fantasy art style. Magical glowing elements and ethereal lighting.
Rich jewel tones (deep purple, emerald, gold). Mystical atmosphere with particle effects.
Ornate detailed environments. Dragon scales, crystal formations, or arcane runes optional.
Concept art quality with painterly brushstrokes.`,
  },
};

// 썸네일 프롬프트
export const getThumbnailPrompt = (topic: string, platform: string, style?: string, contentSummary?: string) => {
  const aspectRatio = platform === 'tiktok' ? '9:16' : platform === 'instagram' ? '1:1' : '16:9';

  const platformGuide = platform === 'tiktok'
    ? 'Vertical composition optimized for mobile full-screen viewing. Subject centered vertically. Leave space at top and bottom for text overlay.'
    : platform === 'instagram'
    ? 'Square composition. Subject centered. Bold visual impact within constrained frame.'
    : 'Wide horizontal composition (16:9). Subject positioned using rule of thirds. Leave bottom third for text overlay area.';

  const stylePrompt = style && THUMBNAIL_IMAGE_STYLES[style]
    ? THUMBNAIL_IMAGE_STYLES[style].prompt
    : `Bold, attention-grabbing composition. High contrast, vibrant saturated colors.
Dramatic lighting with strong highlights and shadows. Professional quality.`;

  const contentContext = contentSummary
    ? `\n## Content Context (from the actual video script)\nThe video discusses: ${contentSummary}\nUse this context to create a thumbnail that accurately represents the video content. Extract the key visual elements, subjects, and mood from this description.\n`
    : '';

  return `
Create a STUNNING, PROFESSIONAL social media THUMBNAIL image.

Subject/Topic: "${topic}"
${contentContext}
Aspect Ratio: ${aspectRatio}

## Visual Style
${stylePrompt}

## Composition Rules
- ${platformGuide}
- Main subject should dominate 40-60% of the frame
- The thumbnail MUST visually represent the actual content described above, not a generic interpretation of the topic
- Use dramatic camera angle (low angle for power, close-up for intimacy, wide for scale)
- Create strong focal point with lighting/contrast
- Background should complement but not distract

## Technical Requirements
- Ultra high quality, sharp details
- Rich, vibrant colors that pop on small screens
- Strong visual hierarchy
- ABSOLUTELY NO text, letters, numbers, or words in the image
- NO watermarks, logos, or UI elements
- Leave breathing room for text overlay
- Image should tell a story or evoke emotion even without text
`;
};

/**
 * 멀티 캐릭터 프롬프트 생성 (C2 PILOT Phase 1)
 * - 최대 3캐릭터까지 지원
 * - 각 캐릭터의 위치, 외형, 구분 태그를 명시
 */
export const buildMultiCharacterPrompt = (
  scene: { narration: string; visualPrompt: string; analysis?: any },
  characters: Array<{
    id: string;
    name: string;
    appearance: { base_prompt: string; outfit?: string };
    distinction_tags: string[];
    position: string;  // 'left' | 'center-left' | 'center' | 'center-right' | 'right'
  }>,
  artStylePrompt?: string
): string => {
  if (characters.length === 0) return getFinalVisualPrompt(scene, false, artStylePrompt);
  if (characters.length > 3) {
    // Safety: max 3 characters per scene
    characters = characters.slice(0, 3);
  }

  const charDescriptions = characters.map(c => {
    const pos = c.position || 'center';
    return `[${pos.toUpperCase()}] ${c.appearance.base_prompt}${c.appearance.outfit ? `, wearing ${c.appearance.outfit}` : ''}, MUST HAVE: ${c.distinction_tags.join(', ')}`;
  }).join(' | ');

  const basePrompt = scene.visualPrompt || scene.narration;
  const style = artStylePrompt ? `STYLE: ${artStylePrompt}` : 'STYLE: 2D hand-drawn illustration';

  return `${basePrompt}

CHARACTERS (${characters.length}): ${charDescriptions}

${style}
COMPOSITION: Each character must be clearly distinct and separately identifiable.
NEGATIVE: Do NOT merge characters, mix features, swap accessories, or blend characters together.
Each character's distinction tags (accessories, clothing) must be clearly visible.`.trim();
};
