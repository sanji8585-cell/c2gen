
/**
 * TubeGen AI 전역 설정 파일
 * 보안을 위해 민감한 API 키는 이곳에 직접 입력하지 마세요.
 * 앱 내의 [설정] 메뉴를 통해 입력하면 브라우저에 안전하게 보관됩니다.
 */

// 이미지 생성 모델 목록 (Gemini만 지원)
export const IMAGE_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    pricePerImage: 0.0315,  // $0.0315/image (추정)
    description: '고품질, 프롬프트 이해력 우수',
    speed: '보통'
  },
] as const;

export type ImageModelId = typeof IMAGE_MODELS[number]['id'];

// Gemini 전용 스타일 카테고리 (3가지 핵심 화풍)
export const GEMINI_STYLE_CATEGORIES = [
  {
    id: 'main',
    name: '메인 화풍',
    styles: [
      {
        id: 'gemini-crayon',
        name: '크레용 (기본)',
        prompt: 'Hand-drawn crayon and colored pencil illustration style, waxy texture with rough organic strokes, warm nostalgic colors, childlike charm with innocent atmosphere, visible pencil texture on outlines and fills, soft analog warmth, 2D flat composition'
      },
      {
        id: 'gemini-korea-cartoon',
        name: '한국 경제 카툰',
        prompt: 'Korean economic cartoon style, digital illustration with clean bold black outlines, cel-shaded flat coloring, simple rounded stick figure character (white circle head, dot eyes), strong color contrasts with golden warm highlights vs cool gray tones, Korean text integration, modern webtoon infographic aesthetic, professional news graphic feel, dramatic lighting with sparkles and glow effects, 16:9 cinematic composition'
      },
      {
        id: 'gemini-watercolor',
        name: '수채화',
        prompt: 'Soft watercolor illustration style, gentle hand-drawn aesthetic, warm color palette by default, simple stick figure with white circle head and thin black line body, organic brush strokes with paint bleeding effects, soft diffused edges, analog texture. Use cool tones only when danger or twist elements appear. Focus on visualizing the exact meaning and context of the sentence.'
      },
    ]
  }
] as const;

export type GeminiStyleId = typeof GEMINI_STYLE_CATEGORIES[number]['styles'][number]['id'] | 'gemini-custom' | 'gemini-none';

// 가격 정보 (USD)
export const PRICING = {
  // 환율 (USD → KRW)
  USD_TO_KRW: 1450,

  // 이미지 생성 (Gemini만 지원)
  IMAGE: {
    'gemini-2.5-flash-image': 0.0315,  // $0.0315/image
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
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: '빠른 속도, 32개 언어', supportsTimestamp: true },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', description: '초고속 ~75ms, 32개 언어', supportsTimestamp: true },
  { id: 'eleven_turbo_v2', name: 'Turbo v2', description: '빠른 속도, 영어 최적화', supportsTimestamp: true },
  { id: 'eleven_monolingual_v1', name: 'Monolingual v1', description: '영어 전용 (레거시)', supportsTimestamp: false },
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
    IMAGE_MODEL: 'tubegen_image_model',
    // Gemini 전용 화풍 설정
    GEMINI_STYLE: 'tubegen_gemini_style',
    GEMINI_CUSTOM_STYLE: 'tubegen_gemini_custom_style',
    PROJECTS: 'tubegen_projects',
    VIDEO_ORIENTATION: 'tubegen_video_orientation',
    ELEVENLABS_SPEED: 'tubegen_el_speed',       // 음성 속도 (0.7~1.3)
    ELEVENLABS_STABILITY: 'tubegen_el_stability', // 리듬 안정성 (0.3~0.9)
  },

  // 애니메이션 설정
  ANIMATION: {
    ENABLED_SCENES: 10,      // 앞 N개 씬을 애니메이션으로 변환
    VIDEO_DURATION: 5        // 생성 영상 길이 (초) - PixVerse v5.5
  }
};
