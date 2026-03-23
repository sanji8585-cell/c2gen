
/**
 * 이미지 생성 서비스
 * - Gemini 2.5 Flash: 참조 이미지 지원
 * - GPT Image-1: 최고 품질, 참조 이미지 미지원
 */

import { CONFIG, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, GPT_STYLE_CATEGORIES, GptStyleId, getVideoOrientation } from '../config';
import { generateImageForScene as generateWithGemini } from './geminiService';
import { ScriptScene, ReferenceImages } from '../types';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 현재 선택된 이미지 모델 가져오기
 */
export function getSelectedImageModel(): ImageModelId {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL);
  return (saved as ImageModelId) || CONFIG.DEFAULT_IMAGE_MODEL;
}

/**
 * 현재 선택된 Gemini 스타일 가져오기
 */
export function getSelectedGeminiStyle(): GeminiStyleId {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE);
  return (saved as GeminiStyleId) || 'gemini-none';
}

/**
 * 커스텀 스타일 프롬프트 가져오기 (Gemini)
 */
function getGeminiCustomStylePrompt(): string {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';
}

/**
 * 선택된 Gemini 화풍의 프롬프트 가져오기
 * @returns 화풍 프롬프트 (없음이면 빈 문자열)
 */
export function getGeminiStylePrompt(): string {
  const styleId = getSelectedGeminiStyle();

  // 화풍 없음 선택
  if (styleId === 'gemini-none') {
    return '';
  }

  // 커스텀 스타일인 경우
  if (styleId === 'gemini-custom') {
    return getGeminiCustomStylePrompt().trim();
  }

  // 프리셋 스타일 찾기
  for (const category of GEMINI_STYLE_CATEGORIES) {
    const style = category.styles.find(s => s.id === styleId);
    if (style) {
      return style.prompt;
    }
  }

  return '';
}

/**
 * 현재 선택된 GPT 스타일 가져오기
 */
export function getSelectedGptStyle(): GptStyleId {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_STYLE);
  return (saved as GptStyleId) || 'gpt-none';
}

/**
 * 커스텀 스타일 프롬프트 가져오기 (GPT)
 */
function getGptCustomStylePrompt(): string {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_CUSTOM_STYLE) || '';
}

/**
 * 선택된 GPT 화풍의 프롬프트 가져오기
 * @returns 화풍 프롬프트 (없음이면 빈 문자열)
 */
export function getGptStylePrompt(): string {
  const styleId = getSelectedGptStyle();

  if (styleId === 'gpt-none') return '';

  if (styleId === 'gpt-custom') {
    return getGptCustomStylePrompt().trim();
  }

  for (const category of GPT_STYLE_CATEGORIES) {
    const style = category.styles.find(s => s.id === styleId);
    if (style) return style.prompt;
  }

  return '';
}

/**
 * 한글 억제 설정 가져오기
 */
export function getSuppressKorean(): boolean {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN) === 'true';
}

// ── OpenAI GPT Image-1 클라이언트 ──

function getCustomOpenAIKey(): string | null {
  try {
    const key = localStorage.getItem(CONFIG.STORAGE_KEYS.OPENAI_API_KEY) || null;
    // sk-로 시작하지 않는 값은 잘못된 키 (브라우저 자동완성 등) → 무시하고 삭제
    if (key && !key.startsWith('sk-')) {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.OPENAI_API_KEY);
      return null;
    }
    return key;
  } catch { return null; }
}

function getSessionToken(): string | null {
  try { return localStorage.getItem('c2gen_session_token') || null; } catch { return null; }
}

async function callOpenAIProxy(action: string, params: Record<string, any>): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const customKey = getCustomOpenAIKey();
  if (customKey) headers['x-custom-api-key'] = customKey;
  const sessionToken = getSessionToken();
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch('/api/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `OpenAI API 오류: ${res.status}`);
  }
  return res.json();
}

async function generateWithOpenAI(scene: ScriptScene, options?: { isPreview?: boolean }): Promise<string | null> {
  const orientation = getVideoOrientation();
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await wait(3000);

      const stylePrompt = getGptStylePrompt();
      const result = await callOpenAIProxy('generateImage', {
        scene: {
          visualPrompt: scene.visualPrompt,
          analysis: scene.analysis,
          visual_keywords: (scene as any).visual_keywords || '',
        },
        orientation,
        stylePrompt: stylePrompt || undefined,
        isPreview: options?.isPreview || undefined,
        suppressKorean: getSuppressKorean() || undefined,
      });

      return result?.imageData || null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Image Service] OpenAI attempt ${attempt + 1} 실패:`, msg);
      if (attempt === MAX_RETRIES) throw e;
    }
  }
  return null;
}

/**
 * 이미지 생성 함수
 * - GPT Image-1: OpenAI 프록시 호출 (참조 이미지 미지원)
 * - Gemini: 기존 Gemini 서비스 호출 (참조 이미지 지원)
 */
export async function generateImage(
  scene: ScriptScene,
  referenceImages: ReferenceImages,
  options?: { isPreview?: boolean; prevSceneImage?: string; dominantMood?: string }
): Promise<string | null> {
  const modelId = getSelectedImageModel();
  const hasCharacterRef = referenceImages.character && referenceImages.character.length > 0;
  const hasStyleRef = referenceImages.style && referenceImages.style.length > 0;

  // GPT Image-1 (참조 이미지 미지원)
  if (modelId === 'gpt-image-1') {
    if (hasCharacterRef || hasStyleRef) {
      console.warn('[Image Service] GPT Image-1은 참조 이미지를 지원하지 않습니다. 텍스트 프롬프트만 사용합니다.');
    }
    return await generateWithOpenAI(scene, options);
  }

  // Gemini (참조 이미지 지원)
  return await generateWithGemini(scene, referenceImages, options);
}
