
/**
 * TubeGen AI 전역 설정 파일
 * 보안을 위해 민감한 API 키는 이곳에 직접 입력하지 마세요.
 * 앱 내의 [설정] 메뉴를 통해 입력하면 브라우저에 안전하게 보관됩니다.
 */

// 이미지 생성 모델 목록
export const IMAGE_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    pricePerImage: 0.0315,  // $0.0315/image (추정)
    description: '고품질, 참조이미지 지원',
    speed: '보통'
  },
  {
    id: 'gpt-image-1',
    name: 'GPT Image-1',
    provider: 'OpenAI',
    pricePerImage: 0.042,   // $0.042/image (medium quality)
    description: '최고 품질, 사실적 표현',
    speed: '보통'
  },
] as const;

export type ImageModelId = typeof IMAGE_MODELS[number]['id'];

// Gemini 전용 스타일 카테고리
// 주의: 캐릭터 설명은 VAR_BASE_CHAR가 처리하므로 스타일 프롬프트에 포함하지 않음
export const GEMINI_STYLE_CATEGORIES = [
  {
    id: 'casual',
    name: '캐주얼',
    styles: [
      {
        id: 'gemini-crayon',
        name: '크레용',
        description: '따뜻한 크레용 질감, 손그림 느낌',
        prompt: 'Hand-drawn crayon and colored pencil illustration style, waxy texture with rough organic strokes, warm nostalgic colors, childlike charm with innocent atmosphere, visible pencil texture on outlines and fills, soft analog warmth, 2D flat composition'
      },
      {
        id: 'gemini-watercolor',
        name: '수채화',
        description: '부드러운 번짐, 몽환적 분위기',
        prompt: 'Soft watercolor illustration style, gentle hand-drawn aesthetic, warm color palette by default, organic brush strokes with paint bleeding effects, soft diffused edges, analog texture, dreamy and delicate atmosphere'
      },
      {
        id: 'gemini-minimal-flat',
        name: '미니멀 플랫',
        description: '깔끔한 도형, 토스/컬리 디자인풍',
        prompt: 'Minimal flat design illustration, clean geometric shapes, limited color palette with bold accent colors, no gradients, no shadows, modern UI/UX aesthetic inspired by Korean fintech apps, white space emphasis, simple iconographic elements, professional and sleek'
      },
    ]
  },
  {
    id: 'professional',
    name: '전문/뉴스',
    styles: [
      {
        id: 'gemini-korea-cartoon',
        name: '한국 경제 카툰',
        description: '웹툰풍 경제 뉴스, 굵은 외곽선',
        prompt: 'Korean economic cartoon style, digital illustration with clean bold black outlines, cel-shaded flat coloring, strong color contrasts with golden warm highlights vs cool gray tones, Korean text integration, modern webtoon infographic aesthetic, professional news graphic feel, dramatic lighting with sparkles and glow effects, 16:9 cinematic composition'
      },
      {
        id: 'gemini-infographic',
        name: '인포그래픽',
        description: '차트/데이터 시각화, 비즈니스 보고서풍',
        prompt: 'Clean infographic illustration style, data visualization aesthetic, flat icons and diagram elements, bold sans-serif typography, color-coded sections with red for up and blue for down (Korean financial convention), white or light gray background, chart and graph visual motifs, professional business report feel, organized grid layout'
      },
      {
        id: 'gemini-retro-news',
        name: '레트로 뉴스',
        description: '80-90년대 TV 뉴스, 복고풍 그래픽',
        prompt: 'Retro 1980s-90s Korean news broadcast style, vintage CRT TV aesthetic, halftone dot texture, limited color palette with warm yellows and deep blues, old newspaper print quality, nostalgic analog broadcast graphics, bold Korean headline typography, grainy film texture overlay'
      },
    ]
  },
  {
    id: 'dimensional',
    name: '입체/공간',
    styles: [
      {
        id: 'gemini-isometric',
        name: '3D 아이소메트릭',
        description: '미니어처 블록, 파스텔 입체 도시',
        prompt: 'Isometric 3D block illustration style, 30-degree angle perspective, clean geometric shapes, bright pastel colors with subtle shadows, miniature diorama feel, detailed tiny buildings and objects, organized grid layout, low-poly aesthetic with smooth surfaces'
      },
    ]
  }
] as const;

export type GeminiStyleId = typeof GEMINI_STYLE_CATEGORIES[number]['styles'][number]['id'] | 'gemini-custom' | 'gemini-none';

// GPT Image-1 전용 스타일 카테고리
// GPT Image-1은 사실적/고품질 표현이 강점이므로 이에 맞게 차별화
export const GPT_STYLE_CATEGORIES = [
  {
    id: 'realistic',
    name: '사실적',
    styles: [
      {
        id: 'gpt-photorealistic',
        name: '포토리얼리스틱',
        description: '스톡 사진급 초고화질, DSLR 퀄리티',
        prompt: 'Photorealistic stock photography style, ultra-sharp detail, natural studio lighting with soft fill light, shallow depth of field, professional DSLR camera quality, neutral color grading, clean commercial aesthetic, 4K resolution feel'
      },
      {
        id: 'gpt-cinematic',
        name: '시네마틱',
        description: '넷플릭스 다큐 느낌, 드라마틱 조명',
        prompt: 'Cinematic movie still style, dramatic three-point lighting, subtle film grain, anamorphic lens bokeh, moody color grading with teal and orange tones, wide-angle composition, atmospheric haze, depth of field, Netflix documentary quality'
      },
      {
        id: 'gpt-news-graphic',
        name: '뉴스 그래픽',
        description: 'Bloomberg/CNBC 방송 그래픽, 홀로그램 UI',
        prompt: 'Professional broadcast news graphic style, Bloomberg/CNBC financial news aesthetic, clean dark background with glowing data elements, sleek glass and metal textures, holographic UI overlays, blue and white corporate color scheme, sharp typography integration, polished 3D infographic elements'
      },
    ]
  },
  {
    id: 'stylized',
    name: '스타일라이즈',
    styles: [
      {
        id: 'gpt-3d-render',
        name: '3D 렌더',
        description: '픽사/블렌더풍, 클레이 질감 3D',
        prompt: 'High-quality 3D render style, Pixar/Blender aesthetic, soft global illumination, subsurface scattering, smooth rounded shapes, vibrant saturated colors, clay-like material texture, clean studio backdrop, professional product visualization quality'
      },
      {
        id: 'gpt-webtoon',
        name: '한국 웹툰',
        description: '깔끔한 선화, 셀 셰이딩, 만화 느낌',
        prompt: 'Korean webtoon digital illustration style, clean precise linework, cel-shaded coloring with smooth gradients, expressive character poses, dramatic panel-like composition, manhwa aesthetic, vibrant colors with atmospheric lighting effects, modern Korean digital art quality'
      },
      {
        id: 'gpt-oil-painting',
        name: '유화',
        description: '르네상스 유화, 무게감 있는 클래식',
        prompt: 'Classical oil painting style, rich impasto brushwork, layered glazing technique, warm Renaissance-inspired palette, dramatic chiaroscuro lighting, museum-quality fine art aesthetic, canvas texture visible in brush strokes, timeless and authoritative'
      },
    ]
  },
  {
    id: 'creative',
    name: '특수 효과',
    styles: [
      {
        id: 'gpt-neon-cyber',
        name: '네온/사이버',
        description: '사이버펑크 네온, 암호화폐/AI 콘텐츠용',
        prompt: 'Cyberpunk neon aesthetic, dark background with vivid neon glow effects in pink/cyan/purple, futuristic holographic UI elements, circuit board patterns, glitch art accents, rain-soaked reflective surfaces, high-tech dystopian atmosphere, crypto and blockchain visual motifs'
      },
      {
        id: 'gpt-watercolor',
        name: '수채화',
        description: '갤러리급 수채화, 투명한 색감',
        prompt: 'Artistic watercolor painting style, soft wet-on-wet washes of translucent color, gentle brush strokes with organic paint bleeding effects, delicate and ethereal atmosphere, visible paper texture, muted pastel tones with occasional vibrant accents, dreamy hand-painted gallery quality'
      },
    ]
  }
] as const;

export type GptStyleId = typeof GPT_STYLE_CATEGORIES[number]['styles'][number]['id'] | 'gpt-custom' | 'gpt-none';

// 가격 정보 (USD)
export const PRICING = {
  // 환율 (USD → KRW)
  USD_TO_KRW: 1450,

  // 이미지 생성 (Gemini만 지원)
  IMAGE: {
    'gemini-2.5-flash-image': 0.0315,  // $0.0315/image
    'gpt-image-1': 0.042,              // $0.042/image (medium)
  },
  // TTS (ElevenLabs) - 글자당 가격
  TTS: {
    perCharacter: 0.00003,  // 약 $0.03/1000자 (추정)
  },
  // 영상 생성 (PixVerse)
  VIDEO: {
    perVideo: 0.15,  // $0.15/video (5초)
  }
} as const;

// 크레딧 시스템 설정
export const CREDIT_CONFIG = {
  // 1 크레딧 = 10원
  KRW_PER_CREDIT: 10,

  // 작업별 크레딧 비용 (API 원가 대비 원가율 30% 기준)
  // 원가율 = API원가 / 판매가, 판매가 = 크레딧 × 10원
  COSTS: {
    'gemini-2.5-flash-image': 16,  // 원가 $0.0315(46원) → 160원 판매 → 원가율 29%
    'gpt-image-1': 21,             // 원가 $0.042(61원) → 210원 판매 → 원가율 29%
    tts_per_1000_chars: 15,        // 원가 $0.03(44원) → 150원 판매 → 원가율 29%
    video: 73,                     // 원가 $0.15(218원) → 730원 판매 → 원가율 30%
    script: 5,                     // 원가 ~$0.01(15원) → 50원 판매 → 원가율 30%
    thumbnail: 16,                 // 원가 $0.0315(46원) → 160원 판매 → 원가율 29%
    bgm_generation: 50,            // ElevenLabs Music 30초 BGM 생성 (Scale 플랜 550분 포함)
    // C2 PILOT Phase 1
    character_reference_sheet: 32,  // 멀티앵글 4장 × 8크레딧
    style_preview: 48,              // A/B 프리뷰 3변형 × 16크레딧
    situation_gallery: 96,          // 상황별 갤러리 6장 × 16크레딧
    voice_design: 30,               // 캐릭터 음성 디자인 3변형
    tone_analysis: 5,               // AI 톤 분석
  } as Record<string, number>,

  // 구독 요금제
  PLANS: {
    free:  { name: '무료',   price_krw: 0,     monthly_credits: 0,    features: ['가입 시 100크레딧'] },
    basic: { name: '베이직', price_krw: 9900,  monthly_credits: 500,  features: ['월 500크레딧', '우선 생성'] },
    pro:      { name: '프로',   price_krw: 29900, monthly_credits: 2000,   features: ['월 2,000크레딧', '우선 생성', '워터마크 제거'] },
    operator: { name: '운영자', price_krw: 0,     monthly_credits: 999999, features: ['전 기능 무제한', '크레딧 차감 없음'] },
  } as Record<string, { name: string; price_krw: number; monthly_credits: number; features: string[] }>,

  // 크레딧 팩
  PACKS: [
    { id: 'pack_1000',  credits: 1000,  price_krw: 10000, label: '1,000 크레딧' },
    { id: 'pack_3000',  credits: 3000,  price_krw: 25000, label: '3,000 크레딧 (17% 할인)' },
    { id: 'pack_10000', credits: 10000, price_krw: 70000, label: '10,000 크레딧 (30% 할인)' },
  ],

  SIGNUP_BONUS: 100,
  LOW_CREDIT_THRESHOLD: 10,
};

// TTS 크레딧 계산 (글자 수 기반)
export function calcTtsCredits(charCount: number): number {
  return Math.ceil(charCount / 1000) * CREDIT_CONFIG.COSTS.tts_per_1000_chars;
}

// USD를 KRW로 변환
export function toKRW(usd: number): number {
  return Math.round(usd * PRICING.USD_TO_KRW);
}

// KRW 포맷 (예: 1,234원)
export function formatKRW(usd: number): string {
  const krw = toKRW(usd);
  return krw.toLocaleString('ko-KR') + '원';
}

// ElevenLabs 자막(타임스탬프) 지원 모델 목록
export const ELEVENLABS_MODELS = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: '다국어 29개, 고품질 (기본값)', supportsTimestamp: true },
  { id: 'eleven_v3', name: 'Eleven v3', description: '최신 모델, 70개 언어, 고표현력', supportsTimestamp: true },
] as const;

export type ElevenLabsModelId = typeof ELEVENLABS_MODELS[number]['id'];

// ElevenLabs 프리메이드 음성 전체 목록 (45개)
// 미리듣기는 API Key를 사용해 "테스트 목소리입니다" 문구로 생성됨
export const ELEVENLABS_DEFAULT_VOICES = [
  // ── 여성 음성 (Female) ──
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '⭐ 추천! 나레이션 최적화, 안정적' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '부드럽고 친근한 대화형' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female' as const, accent: 'British-Swedish', age: 'middle' as const, description: '세련된 유럽풍 나레이션' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female' as const, accent: 'British', age: 'middle' as const, description: '고급스러운 영국식' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '밝고 활기찬 젊은 음성' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', gender: 'female' as const, accent: 'British', age: 'young' as const, description: '영국식 젊은 여성' },
  { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '자연스럽고 깔끔한 발음' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '맑고 청량한 음색' },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '경쾌하고 에너지 넘치는' },
  { id: 'z9fAnlkpzviPz146aGWa', name: 'Glinda', gender: 'female' as const, accent: 'American', age: 'middle' as const, description: '따뜻하고 포근한 음성' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', gender: 'female' as const, accent: 'American-Southern', age: 'young' as const, description: '남부식 부드러운 억양' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female' as const, accent: 'British', age: 'middle' as const, description: '우아한 영국식 나레이션' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '친근하고 자연스러운' },
  { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi', gender: 'female' as const, accent: 'English-Swedish', age: 'young' as const, description: '독특한 북유럽 억양' },
  { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole', gender: 'female' as const, accent: 'American', age: 'young' as const, description: '밝고 명확한 발음' },
  { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena', gender: 'female' as const, accent: 'American', age: 'middle' as const, description: '차분하고 안정감 있는' },
  // ── 남성 음성 (Male) ──
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '⭐ 추천! 뉴스/다큐 스타일, 안정적' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '젊고 역동적, 유튜브에 적합' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '차분하고 신뢰감, 교육/설명용' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '젊은 남성, 캐주얼한 톤' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '굵직하고 힘 있는 음성' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '성숙하고 전문적인' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '따뜻하고 친근한 다큐 스타일' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '깊고 안정적인 음색' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male' as const, accent: 'Australian', age: 'middle' as const, description: '호주식 억양, 친근함' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '깔끔하고 명확한 발음' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '낮고 차분한 음성' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male' as const, accent: 'British', age: 'middle' as const, description: '품격 있는 영국식 나레이션' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', gender: 'male' as const, accent: 'British-Essex', age: 'young' as const, description: '에너지 넘치는 영국 청년' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '부드럽고 설득력 있는' },
  { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '젊고 경쾌한 톤' },
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', gender: 'male' as const, accent: 'Irish', age: 'old' as const, description: '아일랜드 억양, 깊은 음색' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male' as const, accent: 'British', age: 'middle' as const, description: '클래식 영국 신사 스타일' },
  { id: 'zcAOhNBS3c14rBihAFp1', name: 'Giovanni', gender: 'male' as const, accent: 'English-Italian', age: 'young' as const, description: '이탈리아 억양의 매력' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '활발하고 젊은 음성' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', gender: 'male' as const, accent: 'Australian', age: 'old' as const, description: '호주식 원숙한 나레이션' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', gender: 'male' as const, accent: 'American-Irish', age: 'young' as const, description: '아일랜드풍 젊은 남성' },
  { id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie', gender: 'male' as const, accent: 'American', age: 'old' as const, description: '원숙하고 편안한 음성' },
  { id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph', gender: 'male' as const, accent: 'British', age: 'middle' as const, description: '정중한 영국식 톤' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '젊고 깔끔한 나레이션' },
  { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', gender: 'male' as const, accent: 'American', age: 'old' as const, description: '깊고 권위 있는 음성' },
  { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '전문적이고 명확한' },
  { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', gender: 'male' as const, accent: 'American', age: 'middle' as const, description: '뉴스 앵커 스타일' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', gender: 'male' as const, accent: 'American', age: 'young' as const, description: '밝고 친근한 젊은 남성' },
] as const;

// 기본 음성 타입 정의
export type ElevenLabsDefaultVoice = typeof ELEVENLABS_DEFAULT_VOICES[number];
export type VoiceGender = 'male' | 'female';
export type VoiceAge = 'young' | 'middle' | 'old';

// 영상 방향 타입
export type VideoOrientation = 'landscape' | 'portrait';

// 방향별 해상도 및 비율
export const VIDEO_DIMENSIONS = {
  landscape: { width: 1280, height: 720,  aspectRatio: '16:9' as const },
  portrait:  { width: 720,  height: 1280, aspectRatio: '9:16' as const },
};

// 현재 선택된 영상 방향 가져오기
export function getVideoOrientation(): VideoOrientation {
  return (localStorage.getItem('tubegen_video_orientation') as VideoOrientation) || 'landscape';
}

// 영상 방향 저장
export function setVideoOrientation(orientation: VideoOrientation): void {
  localStorage.setItem('tubegen_video_orientation', orientation);
}

// 해상도 티어
export type ResolutionTier = '720p' | '1080p' | '4k';

export const VIDEO_RESOLUTIONS: Record<ResolutionTier, {
  label: string;
  landscape: { width: number; height: number };
  portrait: { width: number; height: number };
  bitrate: number;
  requiredPlan: string;
  planLabel: string;
}> = {
  '720p': {
    label: '720p HD',
    landscape: { width: 1280, height: 720 },
    portrait:  { width: 720,  height: 1280 },
    bitrate: 8_000_000,
    requiredPlan: 'free',
    planLabel: '무료',
  },
  '1080p': {
    label: '1080p Full HD',
    landscape: { width: 1920, height: 1080 },
    portrait:  { width: 1080, height: 1920 },
    bitrate: 15_000_000,
    requiredPlan: 'basic',
    planLabel: '베이직+',
  },
  '4k': {
    label: '4K Ultra HD',
    landscape: { width: 3840, height: 2160 },
    portrait:  { width: 2160, height: 3840 },
    bitrate: 35_000_000,
    requiredPlan: 'pro',
    planLabel: '프로',
  },
};

const PLAN_HIERARCHY: Record<string, number> = { free: 0, basic: 1, pro: 2, operator: 3 };

export function canAccessResolution(plan: string, resolution: ResolutionTier): boolean {
  const tier = VIDEO_RESOLUTIONS[resolution];
  return (PLAN_HIERARCHY[plan] ?? 0) >= (PLAN_HIERARCHY[tier.requiredPlan] ?? 0);
}

export function getVideoResolution(): ResolutionTier {
  return (localStorage.getItem('tubegen_video_resolution') as ResolutionTier) || '720p';
}

export function setVideoResolution(resolution: ResolutionTier): void {
  localStorage.setItem('tubegen_video_resolution', resolution);
}

// ── 다국어 지원 ──

export type Language = 'ko' | 'en' | 'ja';

export interface LanguageConfig {
  id: Language;
  name: string;
  subtitleFont: string;
  defaultVoiceId: string;
  sampleText: string;
}

export const LANGUAGE_CONFIG: Record<Language, LanguageConfig> = {
  ko: { id: 'ko', name: '한국어', subtitleFont: '"Noto Sans KR", "Malgun Gothic", sans-serif', defaultVoiceId: '21m00Tcm4TlvDq8ikWAM', sampleText: '테스트 음성입니다' },
  en: { id: 'en', name: 'English', subtitleFont: '"Inter", "Segoe UI", "Roboto", sans-serif', defaultVoiceId: '21m00Tcm4TlvDq8ikWAM', sampleText: 'This is a test voice sample.' },
  ja: { id: 'ja', name: '日本語', subtitleFont: '"Noto Sans JP", "Yu Gothic", sans-serif', defaultVoiceId: '21m00Tcm4TlvDq8ikWAM', sampleText: 'テスト音声です。' },
};

// ── BGM 라이브러리 ──

export type BgmMood = 'upbeat' | 'calm' | 'dramatic' | 'news' | 'tech' | 'emotional' | 'inspiring' | 'dark';

export interface BgmTrack {
  id: string;
  name: string;
  mood: BgmMood;
  url: string;
  description: string;
}

export const BGM_MOODS: Record<BgmMood, { label: string; emoji: string }> = {
  upbeat: { label: '밝은/활기', emoji: '🎵' },
  calm: { label: '잔잔한', emoji: '🎹' },
  dramatic: { label: '극적인', emoji: '🎻' },
  news: { label: '뉴스/정보', emoji: '📰' },
  tech: { label: '테크/IT', emoji: '💻' },
  emotional: { label: '감성적', emoji: '🎶' },
  inspiring: { label: '희망/동기부여', emoji: '✨' },
  dark: { label: '어두운/미스터리', emoji: '🌑' },
};

// Pixabay 무료 BGM 트랙 (Content License: free for commercial use)
// 사용자가 Pixabay에서 다운로드하여 public/bgm/ 폴더에 넣으면 사용 가능
export const BGM_LIBRARY: BgmTrack[] = [
  { id: 'bgm-upbeat', name: '밝은 에너지', mood: 'upbeat', url: '/bgm/upbeat.mp3', description: '활기차고 긍정적인 분위기' },
  { id: 'bgm-calm', name: '잔잔한 피아노', mood: 'calm', url: '/bgm/calm.mp3', description: '차분하고 편안한 분위기' },
  { id: 'bgm-dramatic', name: '극적인 오케스트라', mood: 'dramatic', url: '/bgm/dramatic.mp3', description: '긴장감과 무게감' },
  { id: 'bgm-news', name: '뉴스 브리핑', mood: 'news', url: '/bgm/news.mp3', description: '뉴스/정보 전달 분위기' },
  { id: 'bgm-tech', name: '테크 일렉트로닉', mood: 'tech', url: '/bgm/tech.mp3', description: 'IT/기술 주제에 적합' },
  { id: 'bgm-emotional', name: '감성 어쿠스틱', mood: 'emotional', url: '/bgm/emotional.mp3', description: '감성적인 스토리텔링' },
  { id: 'bgm-inspiring', name: '희망의 선율', mood: 'inspiring', url: '/bgm/inspiring.mp3', description: '동기부여/영감' },
  { id: 'bgm-dark', name: '다크 앰비언트', mood: 'dark', url: '/bgm/dark.mp3', description: '어둡고 미스터리한 분위기' },
];

// ── 썸네일 플랫폼 ──

export type ThumbnailPlatform = 'youtube' | 'tiktok' | 'instagram';

export const THUMBNAIL_PLATFORMS: Record<ThumbnailPlatform, { label: string; width: number; height: number; aspectRatio: string }> = {
  youtube:   { label: 'YouTube', width: 1280, height: 720,  aspectRatio: '16:9' },
  tiktok:    { label: 'TikTok', width: 1080, height: 1920, aspectRatio: '9:16' },
  instagram: { label: 'Instagram', width: 1080, height: 1080, aspectRatio: '1:1' },
};

export const CONFIG = {
  // 기본 설정값들 (키 제외)
  DEFAULT_VOICE_ID: "21m00Tcm4TlvDq8ikWAM",  // Rachel - 기본 음성 목록에 포함된 유효한 ID
  DEFAULT_ELEVENLABS_MODEL: "eleven_multilingual_v2" as ElevenLabsModelId,
  DEFAULT_IMAGE_MODEL: "gemini-2.5-flash-image" as ImageModelId,
  VIDEO_WIDTH: 1280,
  VIDEO_HEIGHT: 720,

  // 로컬 스토리지 키 이름 (내부 관리용)
  STORAGE_KEYS: {
    ELEVENLABS_API_KEY: 'tubegen_el_key',
    ELEVENLABS_VOICE_ID: 'tubegen_el_voice',
    ELEVENLABS_MODEL: 'tubegen_el_model',
    FAL_API_KEY: 'tubegen_fal_key',  // PixVerse 영상 변환용
    OPENAI_API_KEY: 'tubegen_openai_key',  // GPT Image-1용
    IMAGE_MODEL: 'tubegen_image_model',
    // Gemini 전용 화풍 설정
    GEMINI_STYLE: 'tubegen_gemini_style',
    GEMINI_CUSTOM_STYLE: 'tubegen_gemini_custom_style',
    // GPT 전용 화풍 설정
    GPT_STYLE: 'tubegen_gpt_style',
    GPT_CUSTOM_STYLE: 'tubegen_gpt_custom_style',
    PROJECTS: 'tubegen_projects',
    VIDEO_ORIENTATION: 'tubegen_video_orientation',
    VIDEO_RESOLUTION: 'tubegen_video_resolution',
    ELEVENLABS_SPEED: 'tubegen_el_speed',       // 음성 속도 (0.7~1.3)
    ELEVENLABS_STABILITY: 'tubegen_el_stability', // 리듬 안정성 (0.3~0.9)
    LANGUAGE: 'tubegen_language',                 // 나레이션 언어
    SUPPRESS_KOREAN: 'tubegen_suppress_korean',  // 이미지 내 한글 억제
    THEME: 'tubegen_theme',                      // 테마 (light/dark)
  },

  // 애니메이션 설정
  ANIMATION: {
    ENABLED_SCENES: 10,      // 앞 N개 씬을 애니메이션으로 변환
    VIDEO_DURATION: 5        // 생성 영상 길이 (초) - PixVerse v5.5
  }
};

// ══════════════════════════════════════════
// Engine V2.0 — 디렉티브 매핑 테이블
// ══════════════════════════════════════════

/** 다국어 디렉티브 키 → 내부 키 */
export const DIRECTIVE_KEY_MAP: Record<string, string> = {
  // 한국어
  '구도': 'COMPOSITION', '샷': 'COMPOSITION',
  '분위기': 'MOOD',
  '배경': 'BACKGROUND', '화면': 'BACKGROUND', '배경색': 'BACKGROUND',
  '스타일': 'STYLE', '화풍': 'STYLE',
  '텍스트': 'TEXT',
  '카메라': 'CAMERA', '앵글': 'CAMERA',
  '색상': 'COLOR', '색깔': 'COLOR', '색조': 'COLOR',
  '화자': 'SPEAKER', '나레이터': 'SPEAKER',
  '이전씬유지': 'KEEP_PREV', '같은장소': 'SAME_PLACE', '시간경과': 'TIME_PASS',
  // English
  'composition': 'COMPOSITION', 'shot': 'COMPOSITION',
  'mood': 'MOOD', 'tone': 'MOOD',
  'background': 'BACKGROUND', 'bg': 'BACKGROUND', 'scene': 'BACKGROUND',
  'style': 'STYLE',
  'text': 'TEXT',
  'camera': 'CAMERA', 'angle': 'CAMERA',
  'color': 'COLOR', 'colour': 'COLOR',
  'speaker': 'SPEAKER', 'narrator': 'SPEAKER',
  'keep-prev': 'KEEP_PREV', 'keep': 'KEEP_PREV', 'continue': 'KEEP_PREV',
  'same-place': 'SAME_PLACE', 'time-pass': 'TIME_PASS',
  // 日本語
  '構図': 'COMPOSITION', 'ショット': 'COMPOSITION',
  '雰囲気': 'MOOD',
  '背景': 'BACKGROUND', '場面': 'BACKGROUND',
  'スタイル': 'STYLE',
  'テキスト': 'TEXT',
  'カメラ': 'CAMERA',
  '色': 'COLOR', '色合い': 'COLOR',
  '話者': 'SPEAKER', 'ナレーター': 'SPEAKER',
  '前シーン維持': 'KEEP_PREV', '同じ場所': 'SAME_PLACE', '時間経過': 'TIME_PASS',
};

/** 다국어 구도 값 → 내부 값 */
export const COMPOSITION_VALUE_MAP: Record<string, string> = {
  // 한국어
  '클로즈업': 'MACRO', '클로즈 업': 'MACRO', '익스트림 클로즈업': 'MACRO',
  '미디엄샷': 'STANDARD', '미디엄': 'STANDARD', '바스트샷': 'STANDARD',
  '와이드샷': 'MICRO', '와이드': 'MICRO', '풀샷': 'MICRO', '전신샷': 'MICRO',
  '캐릭터없음': 'NO_CHAR',
  // English
  'close-up': 'MACRO', 'close up': 'MACRO', 'closeup': 'MACRO', 'cu': 'MACRO', 'extreme close-up': 'MACRO', 'ecu': 'MACRO',
  'medium': 'STANDARD', 'medium shot': 'STANDARD', 'mid shot': 'STANDARD', 'ms': 'STANDARD',
  'wide': 'MICRO', 'wide shot': 'MICRO', 'full shot': 'MICRO', 'ws': 'MICRO', 'fs': 'MICRO',
  'no-char': 'NO_CHAR', 'none': 'NO_CHAR', 'no char': 'NO_CHAR', 'object only': 'NO_CHAR',
  // 日本語
  'クローズアップ': 'MACRO', 'ミディアム': 'STANDARD', 'ワイド': 'MICRO', 'フルショット': 'MICRO',
  'キャラなし': 'NO_CHAR',
};

/** 다국어 분위기 값 → 내부 값 */
export const MOOD_VALUE_MAP: Record<string, string> = {
  // 한국어 POSITIVE
  '밝음': 'POSITIVE', '희망적': 'POSITIVE', '희망': 'POSITIVE', '설렘': 'POSITIVE',
  '신나는': 'POSITIVE', '경쾌한': 'POSITIVE', '활기찬': 'POSITIVE', '따뜻한': 'POSITIVE',
  // 한국어 NEGATIVE
  '어두움': 'NEGATIVE', '긴장': 'NEGATIVE', '긴장감': 'NEGATIVE', '무거움': 'NEGATIVE',
  '공포': 'NEGATIVE', '슬픔': 'NEGATIVE', '우울': 'NEGATIVE', '불안': 'NEGATIVE', '극적인': 'NEGATIVE',
  // 한국어 NEUTRAL
  '중립': 'NEUTRAL', '차분한': 'NEUTRAL', '잔잔한': 'NEUTRAL', '진지한': 'NEUTRAL',
  // English POSITIVE
  'bright': 'POSITIVE', 'hopeful': 'POSITIVE', 'happy': 'POSITIVE', 'warm': 'POSITIVE',
  'energetic': 'POSITIVE', 'exciting': 'POSITIVE', 'positive': 'POSITIVE',
  // English NEGATIVE
  'dark': 'NEGATIVE', 'tense': 'NEGATIVE', 'dramatic': 'NEGATIVE', 'anxious': 'NEGATIVE',
  'sad': 'NEGATIVE', 'gloomy': 'NEGATIVE', 'melancholy': 'NEGATIVE', 'negative': 'NEGATIVE',
  // English NEUTRAL
  'neutral': 'NEUTRAL', 'calm': 'NEUTRAL', 'serious': 'NEUTRAL',
  // 日本語
  '明るい': 'POSITIVE', '希望': 'POSITIVE',
  '暗い': 'NEGATIVE', '緊張': 'NEGATIVE', '恐怖': 'NEGATIVE', '悲しい': 'NEGATIVE', 'ドラマティック': 'NEGATIVE',
  '中立': 'NEUTRAL', '穏やか': 'NEUTRAL',
};

/** Gemini TTS 폴백 음성 매핑 */
export const GEMINI_VOICE_MAP: Record<string, Record<string, string>> = {
  ko: { male: 'Charon', female: 'Kore' },
  en: { male: 'Fenrir', female: 'Aoede' },
  ja: { male: 'Iapetus', female: 'Despina' },
};
