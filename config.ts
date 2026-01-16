
/**
 * TubeGen AI 전역 설정 파일
 * 보안을 위해 민감한 API 키는 이곳에 직접 입력하지 마세요.
 * 앱 내의 [설정] 메뉴를 통해 입력하면 브라우저에 안전하게 보관됩니다.
 */

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

export const CONFIG = {
  // 기본 설정값들 (키 제외)
  DEFAULT_VOICE_ID: "qilwn0AtH88Ij5OirLPw",
  DEFAULT_ELEVENLABS_MODEL: "eleven_multilingual_v2" as ElevenLabsModelId,
  VIDEO_WIDTH: 1280,
  VIDEO_HEIGHT: 720,

  // 로컬 스토리지 키 이름 (내부 관리용)
  STORAGE_KEYS: {
    ELEVENLABS_API_KEY: 'tubegen_el_key',
    ELEVENLABS_VOICE_ID: 'tubegen_el_voice',
    ELEVENLABS_MODEL: 'tubegen_el_model',
    FAL_API_KEY: 'tubegen_fal_key'
  },

  // 애니메이션 설정
  ANIMATION: {
    ENABLED_SCENES: 10,      // 앞 N개 씬을 애니메이션으로 변환
    VIDEO_DURATION: 5        // 생성 영상 길이 (초) - PixVerse v5.5
  }
};
