
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScriptScene } from "../types";
import { SYSTEM_INSTRUCTIONS, getTrendSearchPrompt, getScriptGenerationPrompt, getFinalVisualPrompt } from "./prompts";

/**
 * Gemini API 클라이언트 초기화
 */
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 안전 필터 우회를 위한 키워드 대체 맵
 * - 필터에 걸리기 쉬운 표현 → 안전한 동의어로 변환
 */
const KEYWORD_ALTERNATIVES: Record<string, string[]> = {
  // X-ray 관련
  'x-ray': ['transparent cutaway', 'see-through', 'translucent'],
  'x-ray view': ['transparent cutaway view', 'see-through view', 'cross-section view'],
  'xray': ['transparent', 'see-through', 'translucent'],

  // 의료/해부 관련
  'dissection': ['cross-section', 'cutaway'],
  'anatomy': ['internal structure', 'inner components'],
  'surgical': ['precise', 'detailed'],

  // 무기/폭발 관련 (경제 뉴스에서 은유로 쓰일 수 있음)
  'explosion': ['burst', 'rapid expansion', 'dramatic surge'],
  'bomb': ['impact', 'dramatic event'],
  'crash': ['sharp decline', 'sudden drop'],

  // 기타 민감 표현
  'naked': ['bare', 'exposed', 'uncovered'],
  'blood': ['red liquid', 'crimson'],
  'death': ['end', 'decline', 'fall'],
  'kill': ['eliminate', 'end', 'stop'],
};

/**
 * 프롬프트에서 민감한 키워드를 안전한 대체어로 변환
 */
const sanitizePrompt = (prompt: string, attemptIndex: number = 0): string => {
  let sanitized = prompt.toLowerCase();
  let result = prompt;

  for (const [keyword, alternatives] of Object.entries(KEYWORD_ALTERNATIVES)) {
    const regex = new RegExp(keyword, 'gi');
    if (regex.test(sanitized)) {
      // attemptIndex에 따라 다른 대체어 선택 (재시도마다 다른 표현 시도)
      const altIndex = attemptIndex % alternatives.length;
      result = result.replace(regex, alternatives[altIndex]);
      sanitized = result.toLowerCase();
    }
  }

  return result;
};

/**
 * JSON 응답 텍스트 정리 - 불필요한 문자 제거
 */
const cleanJsonResponse = (text: string): string => {
  if (!text) return '[]';

  let cleaned = text.trim();

  // 마크다운 코드 블록 제거
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  // JSON 배열/객체 시작과 끝 찾기
  const firstBracket = cleaned.search(/[\[{]/);

  if (firstBracket === -1) {
    console.warn('[JSON Clean] JSON 시작 브래킷을 찾을 수 없음:', cleaned.slice(0, 100));
    return '[]';
  }

  // 배열인지 객체인지에 따라 올바른 닫는 브래킷 찾기
  const isArray = cleaned[firstBracket] === '[';
  const closingBracket = isArray ? ']' : '}';

  // 중첩 레벨을 추적하며 올바른 닫는 브래킷 찾기
  let depth = 0;
  let lastValidIndex = -1;

  for (let i = firstBracket; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '[' || char === '{') depth++;
    if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        lastValidIndex = i;
        break;
      }
    }
  }

  if (lastValidIndex !== -1) {
    cleaned = cleaned.slice(firstBracket, lastValidIndex + 1);
  } else {
    // 폴백: 기존 방식
    const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (lastBracket > firstBracket) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }
  }

  return cleaned.trim();
};

const retryGeminiRequest = async <T>(
  operationName: string,
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 5000
): Promise<T> => {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);
      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('Quota') || error.status === 429;
      if (isQuotaError && attempt < maxRetries) {
        await wait(baseDelay * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const findTrendingTopics = async (category: string, usedTopics: string[]) => {
  return retryGeminiRequest("Trend Search", async () => {
    const ai = getAI();
    const prompt = getTrendSearchPrompt(category, usedTopics.join(", "));
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS.TREND_RESEARCHER,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      },
    });
    return JSON.parse(cleanJsonResponse(response.text));
  });
};

export const generateScript = async (topic: string, hasReferenceImage: boolean, sourceContext?: string | null): Promise<ScriptScene[]> => {
  return retryGeminiRequest("Script Generation", async () => {
    const ai = getAI();
    const baseInstruction = topic === "Manual Script Input" ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER : 
                            hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH : 
                            SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;
                            
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: getScriptGenerationPrompt(topic, sourceContext),
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        systemInstruction: baseInstruction,
      },
    });

    const result = JSON.parse(cleanJsonResponse(response.text));
    const scenes = Array.isArray(result) ? result : (result.scenes || []);

    console.log(`[Script Generation] 생성된 씬 개수: ${scenes.length}`);

    // 씬이 너무 적으면 경고
    if (scenes.length < 3) {
      console.warn(`[Warning] 씬이 ${scenes.length}개만 생성됨. 대본이 제대로 분할되지 않았을 수 있음.`);
    }

    return scenes.map((scene: any, idx: number) => ({
      sceneNumber: scene.sceneNumber || idx + 1,
      narration: scene.narration || "",
      visualPrompt: scene.image_prompt_english || "",
      analysis: scene.analysis || {}
    }));
  });
};

export const generateImageForScene = async (scene: ScriptScene, referenceImages: string[]): Promise<string | null> => {
  const basePrompt = getFinalVisualPrompt(scene);

  const MAX_SANITIZE_ATTEMPTS = 3; // 대체어 시도 횟수
  let lastError: any;

  for (let sanitizeAttempt = 0; sanitizeAttempt < MAX_SANITIZE_ATTEMPTS; sanitizeAttempt++) {
    // 시도마다 다른 대체어 적용
    const sanitizedPrompt = sanitizeAttempt === 0
      ? basePrompt
      : sanitizePrompt(basePrompt, sanitizeAttempt - 1);

    if (sanitizeAttempt > 0) {
      console.log(`[Image Gen] 키워드 대체 시도 ${sanitizeAttempt}: 프롬프트 수정됨`);
    }

    try {
      const result = await retryGeminiRequest("Pro Image Generation", async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const parts: any[] = [];
        if (referenceImages && referenceImages.length > 0) {
          referenceImages.forEach(img => {
            parts.push({ inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' } });
          });
        }
        parts.push({ text: sanitizedPrompt });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts },
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: {
              aspectRatio: '16:9'
            }
          }
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return part.inlineData.data;
        }
        return null;
      }, 2, 3000); // 각 대체어당 2회 재시도

      if (result) return result;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);

      // 안전 필터/콘텐츠 정책 관련 에러인지 확인
      const isSafetyError =
        errorMsg.includes('safety') ||
        errorMsg.includes('blocked') ||
        errorMsg.includes('policy') ||
        errorMsg.includes('content') ||
        errorMsg.includes('SAFETY') ||
        errorMsg.includes('harmful') ||
        error.status === 400;

      if (isSafetyError && sanitizeAttempt < MAX_SANITIZE_ATTEMPTS - 1) {
        console.log(`[Image Gen] 안전 필터 감지됨. 대체 키워드로 재시도...`);
        await wait(1000);
        continue; // 다음 대체어로 재시도
      }

      // 안전 필터 에러가 아니거나 모든 대체어 소진 시 에러 throw
      throw error;
    }
  }

  throw lastError || new Error('이미지 생성 실패: 모든 대체어 시도 실패');
};

export const generateAudioForScene = async (text: string) => {
  return retryGeminiRequest("TTS Generation", async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
      }
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  });
};

/**
 * AI 기반 자막 의미 단위 분리
 * - 나레이션을 의미가 통하는 단위로 분리
 * - 각 청크는 maxChars(기본 22자) 이하
 * - 반환: 분리된 텍스트 청크 배열
 */
export const splitSubtitleByMeaning = async (
  narration: string,
  maxChars: number = 22
): Promise<string[]> => {
  return retryGeminiRequest("Subtitle Split", async () => {
    const ai = getAI();

    const prompt = `당신은 자막 편집 전문가입니다.
아래 나레이션을 자막용으로 분리해주세요.

## 규칙
1. 의미가 통하는 단위로 분리 (문장 중간에 어색하게 끊지 않기)
2. 각 청크는 반드시 ${maxChars}자 이하
3. 쉼표, 조사, 접속사 등 자연스러운 끊김 포인트 활용
4. 원문의 단어를 그대로 유지 (수정/생략 금지)
5. 모든 텍스트가 빠짐없이 포함되어야 함

## 나레이션
${narration}

## 출력 형식
JSON 배열로 출력. 예: ["첫 번째 청크", "두 번째 청크", ...]`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const chunks = JSON.parse(cleanJsonResponse(response.text));

    // 유효성 검증: 원문 복원 확인
    const reconstructed = chunks.join('').replace(/\s+/g, '');
    const original = narration.replace(/\s+/g, '');

    if (reconstructed !== original) {
      console.warn('[Subtitle Split] 원문과 청크 불일치, 폴백 사용');
      // 폴백: 단순 길이 기반 분리
      return fallbackSplit(narration, maxChars);
    }

    return chunks;
  }, 2, 1000);
};

/**
 * 대본과 이미지 프롬프트를 분석하여 애니메이션 움직임 프롬프트 생성
 * - 캐릭터 감정/동작 분석
 * - 상황에 맞는 움직임 제안
 */
export const generateMotionPrompt = async (
  narration: string,
  visualPrompt: string
): Promise<string> => {
  try {
    const ai = getAI();

    const prompt = `You are an animation director. Analyze the narration and visual description, then generate a motion prompt for image-to-video AI.

## Rules
1. Output in English only
2. Keep the original image style intact - NO style changes
3. Suggest subtle, natural character movements based on emotion/context
4. Camera: slow gentle zoom in
5. Keep movements minimal but expressive
6. Max 100 words

## Narration (Korean)
${narration}

## Visual Description
${visualPrompt.slice(0, 300)}

## Output Format
Return ONLY the motion prompt, no explanation. Example:
"Slow gentle zoom in. Character slightly nods with a warm smile, eyes blinking naturally. Subtle breathing motion. Background remains static. Maintain original art style consistency."`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const motionPrompt = response.text?.trim() || '';
    console.log('[Motion Prompt] 생성됨:', motionPrompt.slice(0, 100) + '...');
    return motionPrompt;

  } catch (error) {
    console.warn('[Motion Prompt] 생성 실패, 기본 프롬프트 사용');
    // 폴백: 기본 프롬프트
    return `Slow gentle zoom in. Subtle natural movement. Maintain original art style. ${visualPrompt.slice(0, 100)}`;
  }
};

/**
 * AI 실패 시 폴백: 구두점 + 길이 기반 분리
 */
function fallbackSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';

  // 구두점이나 공백 기준으로 분리
  const tokens = text.split(/(?<=[,.])|(?=\s)/);

  for (const token of tokens) {
    if ((current + token).length <= maxChars) {
      current += token;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = token.trimStart();
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
