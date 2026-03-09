
import { ScriptScene, ReferenceImages } from "../types";
import { CONFIG, GeminiStyleId, getVideoOrientation, type Language } from "../config";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── API 호출 헬퍼 ──

/** 커스텀 Gemini API 키 (localStorage, 하위 호환) */
function getCustomGeminiKey(): string | null {
  try { return localStorage.getItem('tubegen_custom_gemini_key') || null; } catch { return null; }
}

/** 세션 토큰 가져오기 */
function getSessionToken(): string | null {
  try { return localStorage.getItem('c2gen_session_token') || null; } catch { return null; }
}

/** /api/gemini 프록시 호출 */
async function callGeminiProxy(action: string, params: Record<string, any>): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const customKey = getCustomGeminiKey();
  if (customKey) headers['x-custom-api-key'] = customKey;
  const sessionToken = getSessionToken();
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `API error: ${res.status}`);
  }
  return res.json();
}

// ── 재시도 래퍼 ──

const retryGeminiRequest = async <T>(
  _operationName: string,
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 5000
): Promise<T> => {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: unknown) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('Quota') || (error as any).status === 429;
      if (isQuotaError && attempt < maxRetries) {
        await wait(baseDelay * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// ── 내보내기 함수들 (프록시 호출) ──

export const findTrendingTopics = async (category: string, usedTopics: string[], language?: Language) => {
  return retryGeminiRequest("Trend Search", () =>
    callGeminiProxy('findTrends', { category, usedTopics, language })
  );
};

/** 단일 청크 스크립트 생성 */
const generateScriptSingle = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext?: string | null,
  chunkInfo?: { current: number; total: number },
  language?: Language
): Promise<ScriptScene[]> => {
  return retryGeminiRequest("Script Generation", () =>
    callGeminiProxy('generateScript', { topic, hasReferenceImage, sourceContext, chunkInfo, language })
  );
};

/** 기존 generateScript (하위 호환) */
export const generateScript = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext?: string | null,
  language?: Language
): Promise<ScriptScene[]> => {
  return generateScriptSingle(topic, hasReferenceImage, sourceContext, undefined, language);
};

// ── 텍스트 청크 분할 (클라이언트 오케스트레이션) ──

function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + '\n\n' + trimmedPara).length <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      if (trimmedPara.length > maxChunkSize) {
        const sentences = trimmedPara.split(/(?<=[.!?。])\s+/);
        currentChunk = '';
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length <= maxChunkSize) {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          }
        }
      } else {
        currentChunk = trimmedPara;
      }
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

/** 긴 대본 청크 분할 처리 */
export const generateScriptChunked = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext: string,
  chunkSize: number = 2500,
  onProgress?: (message: string) => void,
  language?: Language
): Promise<ScriptScene[]> => {
  if (sourceContext.length <= chunkSize) {
    return generateScriptSingle(topic, hasReferenceImage, sourceContext, undefined, language);
  }

  const chunks = splitTextIntoChunks(sourceContext, chunkSize);

  const allScenes: ScriptScene[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const progressMsg = `스토리보드 생성 중... (${i + 1}/${chunks.length} 파트)`;
    onProgress?.(progressMsg);

    const chunkContext = chunks.length > 1
      ? `[파트 ${i + 1}/${chunks.length} - 전체 대본의 일부입니다. 이 파트의 내용만 시각화하세요.]\n\n${chunks[i]}`
      : chunks[i];

    try {
      const chunkScenes = await generateScriptSingle(
        topic, hasReferenceImage, chunkContext,
        { current: i + 1, total: chunks.length },
        language
      );
      const offset = allScenes.length;
      allScenes.push(...chunkScenes.map((scene, idx) => ({ ...scene, sceneNumber: offset + idx + 1 })));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Chunked Script] 청크 ${i + 1} 실패:`, msg);
      onProgress?.(`청크 ${i + 1} 처리 실패, 계속 진행 중...`);
    }
    if (i < chunks.length - 1) await wait(1500);
  }
  return allScenes;
};

// ── 스타일 정보 (서버로 전송) ──

function getGeminiStyleInfo(): { styleId: string; customStylePrompt: string } {
  const styleId = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE) as GeminiStyleId || 'gemini-none';
  const customStylePrompt = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';
  return { styleId, customStylePrompt };
}

/** data URL에서 base64 본문만 추출 (접두사 제거로 페이로드 축소) */
function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

/** 참조 이미지 페이로드 최적화 (base64 접두사 제거) */
function optimizeReferenceImages(refImages: ReferenceImages): ReferenceImages {
  return {
    ...refImages,
    character: refImages.character.map(stripDataUrlPrefix),
    style: refImages.style.map(stripDataUrlPrefix),
  };
}

/** 씬 이미지 생성 */
export const generateImageForScene = async (
  scene: ScriptScene,
  referenceImages: ReferenceImages,
  options?: { isPreview?: boolean }
): Promise<string | null> => {
  const { styleId, customStylePrompt } = getGeminiStyleInfo();
  const orientation = getVideoOrientation();

  // 참조 이미지 페이로드 최적화 (data URL 접두사 제거 → ~30% 크기 절감)
  const optimizedRefs = optimizeReferenceImages(referenceImages);

  const suppressKorean = localStorage.getItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN) === 'true';

  const result = await retryGeminiRequest("Image Generation", () =>
    callGeminiProxy('generateImage', {
      scene: { visualPrompt: scene.visualPrompt, analysis: scene.analysis, visual_keywords: (scene as any).visual_keywords || '' },
      referenceImages: optimizedRefs,
      styleId,
      customStylePrompt,
      orientation,
      isPreview: options?.isPreview || undefined,
      suppressKorean: suppressKorean || undefined,
    }), 2, 3000
  );
  return result?.imageData || null;
};

/** Gemini TTS */
export const generateAudioForScene = async (text: string) => {
  return retryGeminiRequest("TTS Generation", async () => {
    const result = await callGeminiProxy('generateAudio', { text });
    return result?.audioData || null;
  });
};

/** AI 자막 의미 단위 분리 */
export const splitSubtitleByMeaning = async (
  narration: string,
  maxChars: number = 20,
  language?: Language
): Promise<string[]> => {
  return retryGeminiRequest("Subtitle Split", () =>
    callGeminiProxy('splitSubtitle', { narration, maxChars, language }), 2, 1000
  );
};

/** 모션 프롬프트 생성 */
export const generateMotionPrompt = async (
  narration: string,
  visualPrompt: string
): Promise<string> => {
  try {
    const result = await callGeminiProxy('generateMotionPrompt', { narration, visualPrompt });
    return result?.motionPrompt || '';
  } catch {
    return `Slow gentle zoom in. Subtle natural movement. Maintain original art style. ${visualPrompt.slice(0, 100)}`;
  }
};

/** AI 대본 어시스턴트 (고급 모드) */
export const generateAdvancedScript = async (
  userIntent: string,
  settings: {
    format: string;
    speakerCount: string;
    mood: string;
    sceneConnection: string;
  },
  language: string = 'ko',
): Promise<string> => {
  return callGeminiProxy('generateAdvancedScript', { userIntent, settings, language });
};

/** 분위기 분석 (BGM 자동 선택용) */
export const analyzeMood = async (narrations: string[]): Promise<{ mood: string; confidence: number }> => {
  return callGeminiProxy('analyzeMood', { narrations });
};

/** 썸네일 이미지 생성 */
export const generateThumbnailImage = async (
  topic: string, platform: string, style?: string,
  contentSummary?: string, customPrompt?: string
): Promise<string | null> => {
  const result = await callGeminiProxy('generateThumbnail', { topic, platform, style, contentSummary, customPrompt });
  return result?.imageData || null;
};
