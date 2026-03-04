import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import {
  SYSTEM_INSTRUCTIONS,
  getTrendSearchPrompt,
  getScriptGenerationPrompt,
  getFinalVisualPrompt,
} from '../services/prompts.js';
import { GEMINI_STYLE_CATEGORIES, VIDEO_DIMENSIONS, type VideoOrientation } from '../config.js';

// ── 유틸리티 (서버 전용) ─────────────────────────────

const KEYWORD_ALTERNATIVES: Record<string, string[]> = {
  'x-ray': ['transparent cutaway', 'see-through', 'translucent'],
  'x-ray view': ['transparent cutaway view', 'see-through view', 'cross-section view'],
  xray: ['transparent', 'see-through', 'translucent'],
  dissection: ['cross-section', 'cutaway'],
  anatomy: ['internal structure', 'inner components'],
  surgical: ['precise', 'detailed'],
  explosion: ['burst', 'rapid expansion', 'dramatic surge'],
  bomb: ['impact', 'dramatic event'],
  crash: ['sharp decline', 'sudden drop'],
  naked: ['bare', 'exposed', 'uncovered'],
  blood: ['red liquid', 'crimson'],
  death: ['end', 'decline', 'fall'],
  kill: ['eliminate', 'end', 'stop'],
};

function sanitizePrompt(prompt: string, attemptIndex = 0): string {
  let sanitized = prompt.toLowerCase();
  let result = prompt;
  for (const [keyword, alternatives] of Object.entries(KEYWORD_ALTERNATIVES)) {
    const regex = new RegExp(keyword, 'gi');
    if (regex.test(sanitized)) {
      const altIndex = attemptIndex % alternatives.length;
      result = result.replace(regex, alternatives[altIndex]);
      sanitized = result.toLowerCase();
    }
  }
  return result;
}

function findLastCompleteSceneObject(json: string): number {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let lastCompleteEnd = -1;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}') { depth--; if (depth === 1) lastCompleteEnd = i + 1; }
  }
  return lastCompleteEnd;
}

function cleanJsonResponse(text: string): string {
  if (!text) return '[]';
  let cleaned = text.trim();
  const originalLength = cleaned.length;
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBracket = cleaned.search(/[\[{]/);
  if (firstBracket === -1) return '[]';

  let depth = 0, lastValidIndex = -1, inString = false, escapeNext = false;
  for (let i = firstBracket; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '[' || char === '{') depth++;
    if (char === ']' || char === '}') { depth--; if (depth === 0) { lastValidIndex = i; break; } }
  }

  if (lastValidIndex !== -1) {
    cleaned = cleaned.slice(firstBracket, lastValidIndex + 1);
  } else {
    console.warn(`[JSON Clean] 불완전 JSON (${originalLength}자). 복구 시도...`);
    cleaned = cleaned.slice(firstBracket);
    const lastCompleteEnd = findLastCompleteSceneObject(cleaned);
    if (lastCompleteEnd > 0) {
      cleaned = cleaned.slice(0, lastCompleteEnd);
      cleaned += cleaned.includes('"scenes"') ? ']}' : ']';
    } else {
      return '[]';
    }
  }
  return cleaned.trim();
}

function getStrengthDescription(strength: number) {
  if (strength <= 20) return { level: 'very loosely', instruction: 'Use as a very loose inspiration only. Feel free to deviate significantly.' };
  if (strength <= 40) return { level: 'loosely', instruction: 'Use as a loose reference. Capture the general feel but allow creative interpretation.' };
  if (strength <= 60) return { level: 'moderately', instruction: 'Follow the reference moderately. Balance between reference and scene requirements.' };
  if (strength <= 80) return { level: 'closely', instruction: 'Follow the reference closely. Maintain strong similarity while adapting to the scene.' };
  return { level: 'exactly', instruction: 'Match the reference as exactly as possible. Replicate with high precision.' };
}

function fallbackSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';
  const tokens = text.split(/(?<=[,.])|(?=\s)/);
  for (const token of tokens) {
    if ((current + token).length <= maxChars) { current += token; }
    else { if (current.trim()) chunks.push(current.trim()); current = token.trimStart(); }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function resolveStylePrompt(styleId?: string, customStylePrompt?: string): string {
  if (!styleId || styleId === 'gemini-none') return '';
  if (styleId === 'gemini-custom') return (customStylePrompt || '').trim();
  for (const category of GEMINI_STYLE_CATEGORIES) {
    const style = category.styles.find(s => s.id === styleId);
    if (style) return style.prompt;
  }
  return '';
}

// ── API 키 라운드 로빈 ─────────────────────────────

function pickGeminiKey(): string | undefined {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean) as string[];
  if (keys.length === 0) return undefined;
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── 사용량 로깅 ─────────────────────────────

async function logUsage(req: VercelRequest, action: string, costUsd: number) {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) return;
    // 커스텀 키 사용자는 로깅 스킵
    if (req.headers['x-custom-api-key']) return;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions')
      .select('email')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session?.email) return;

    await supabase.from('c2gen_usage').insert({
      email: session.email,
      action,
      cost_usd: costUsd,
      count: 1,
    });
  } catch (e) {
    console.error('[api/gemini] logUsage error:', e);
  }
}

// ── 핸들러 ─────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || pickGeminiKey();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { action, ...params } = req.body;
  const ai = new GoogleGenAI({ apiKey });

  try {
    switch (action) {
      // ── 트렌드 검색 ──
      case 'findTrends': {
        const { category, usedTopics } = params;
        const prompt = getTrendSearchPrompt(category, (usedTopics || []).join(', '));
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTIONS.TREND_RESEARCHER,
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
          },
        });
        return res.json(JSON.parse(cleanJsonResponse(response.text)));
      }

      // ── 스크립트 생성 (단일 청크) ──
      case 'generateScript': {
        const { topic, hasReferenceImage, sourceContext, chunkInfo } = params;
        const baseInstruction =
          topic === 'Manual Script Input' ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER
          : hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH
          : SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;

        const inputText = sourceContext || topic;
        const inputLength = inputText.length;
        const sentences = inputText.split(/[.!?。]+/).filter((s: string) => s.trim().length > 0);
        const sentenceCount = Math.max(1, sentences.length);
        const estimatedSceneCount = inputLength < 200
          ? sentenceCount
          : Math.max(sentenceCount, Math.ceil(inputLength / 80));
        const maxOutputTokens = Math.min(65536, Math.max(16384, Math.ceil(estimatedSceneCount * 800 * 1.5)));

        const chunkLabel = chunkInfo ? `[청크 ${chunkInfo.current}/${chunkInfo.total}] ` : '';
        console.log(`${chunkLabel}[Script] 입력: ${inputLength}자, 예상 씬: ${estimatedSceneCount}개, maxOutputTokens: ${maxOutputTokens}`);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: getScriptGenerationPrompt(topic, sourceContext),
          config: {
            thinkingConfig: { thinkingBudget: 24576 },
            responseMimeType: 'application/json',
            systemInstruction: baseInstruction,
            maxOutputTokens,
          },
        });

        const result = JSON.parse(cleanJsonResponse(response.text || '[]'));
        const scenes = Array.isArray(result) ? result : (result.scenes || []);

        const mapped = scenes.map((scene: any, idx: number) => ({
          sceneNumber: scene.sceneNumber || idx + 1,
          narration: scene.narration || '',
          visualPrompt: scene.image_prompt_english || '',
          analysis: scene.analysis || {},
        }));

        logUsage(req, 'script', 0);
        return res.json(mapped);
      }

      // ── 이미지 생성 ──
      case 'generateImage': {
        const { scene, referenceImages, styleId, customStylePrompt, orientation } = params;
        const hasCharacterRef = referenceImages?.character?.length > 0;
        const hasStyleRef = referenceImages?.style?.length > 0;
        const geminiStylePrompt = hasStyleRef ? undefined : resolveStylePrompt(styleId, customStylePrompt);
        const basePrompt = getFinalVisualPrompt(scene, hasCharacterRef, geminiStylePrompt);

        const characterStrength = referenceImages?.characterStrength ?? 70;
        const styleStrength = referenceImages?.styleStrength ?? 70;
        const orient: VideoOrientation = orientation || 'landscape';
        const aspectRatio = VIDEO_DIMENSIONS[orient].aspectRatio;

        const MAX_SANITIZE = 3;
        let lastError: any;

        for (let sanitizeAttempt = 0; sanitizeAttempt < MAX_SANITIZE; sanitizeAttempt++) {
          const sanitizedPrompt = sanitizeAttempt === 0 ? basePrompt : sanitizePrompt(basePrompt, sanitizeAttempt - 1);
          try {
            const parts: any[] = [];

            if (hasCharacterRef) {
              const charDesc = getStrengthDescription(characterStrength);
              parts.push({ text: `[CHARACTER REFERENCE - Strength: ${characterStrength}%]\nMatch this character's appearance ${charDesc.level}.\n${charDesc.instruction}\nFocus on: face, hair, clothing, body proportions.` });
              referenceImages.character.forEach((img: string) => {
                const imageData = img.includes(',') ? img.split(',')[1] : img;
                parts.push({ inlineData: { data: imageData, mimeType: 'image/jpeg' } });
              });
            }

            if (hasStyleRef) {
              const styleDesc = getStrengthDescription(styleStrength);
              parts.push({ text: `[STYLE REFERENCE - Strength: ${styleStrength}%]\nMatch this art style ${styleDesc.level}.\n${styleDesc.instruction}\nFocus on: color palette, brush strokes, lighting, overall mood.` });
              referenceImages.style.forEach((img: string) => {
                const imageData = img.includes(',') ? img.split(',')[1] : img;
                parts.push({ inlineData: { data: imageData, mimeType: 'image/jpeg' } });
              });
            }

            if (!hasStyleRef) {
              const resolvedStyle = resolveStylePrompt(styleId, customStylePrompt);
              if (resolvedStyle) {
                parts.push({ text: `[ART STYLE INSTRUCTION]\nApply this art style: ${resolvedStyle}\nEnsure the entire image consistently follows this visual style.` });
              }
            }

            parts.push({ text: `[SCENE PROMPT]\n${sanitizedPrompt}` });

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts },
              config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio },
              },
            });

            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                logUsage(req, 'image', 0.0315);
                return res.json({ imageData: part.inlineData.data });
              }
            }
            return res.json({ imageData: null });
          } catch (error: any) {
            lastError = error;
            const errorMsg = error.message || JSON.stringify(error);
            const isSafetyError = /safety|blocked|policy|content|SAFETY|harmful/i.test(errorMsg) || error.status === 400;
            if (isSafetyError && sanitizeAttempt < MAX_SANITIZE - 1) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            throw error;
          }
        }
        throw lastError || new Error('이미지 생성 실패: 모든 대체어 시도 실패');
      }

      // ── Gemini TTS ──
      case 'generateAudio': {
        const { text } = params;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: { parts: [{ text }] },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          },
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        return res.json({ audioData });
      }

      // ── 자막 의미 단위 분리 ──
      case 'splitSubtitle': {
        const { narration, maxChars = 20 } = params;
        const prompt = `자막 분리 작업입니다. 원문을 청크로 나누세요.

###### 🚨 절대 금지 사항 (위반 시 실패) ######
- 띄어쓰기 추가 금지: "자막나오는거" → "자막 나오는 거" ❌
- 띄어쓰기 삭제 금지: "역대 최고치" → "역대최고치" ❌
- 맞춤법 교정 금지: 틀린 맞춤법도 그대로 유지
- 어떤 글자도 변경/추가/삭제 금지
################################################

## 검증 방법
청크를 그대로 이어붙이면 원문과 글자 하나 틀리지 않고 완전히 같아야 함.
"${narration}".split('').join('') === chunks.join('').split('').join('')

## 자막 분리 규칙
1. 각 청크는 15~20자 (최대 ${maxChars}자)
2. 1초당 4-5글자, 최소 1.5초 = 최소 6~8글자
3. 의미 단위로 자연스럽게 끊기

## 끊는 위치
✅ 좋은 위치: 쉼표(,) 뒤, 마침표(.) 뒤, 조사 뒤 공백
❌ 나쁜 위치: 단어 중간, 숫자 내 쉼표(4,200), 조사 앞

## 원문 (이것을 정확히 분리)
${narration}

## 출력
JSON 배열만 출력. 예: ["청크1", "청크2"]`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const chunks = JSON.parse(cleanJsonResponse(response.text));
        const reconstructed = chunks.join('');

        if (reconstructed !== narration) {
          console.warn('[Subtitle Split] 원문과 청크 불일치, 폴백 사용');
          return res.json(fallbackSplit(narration, maxChars));
        }
        return res.json(chunks);
      }

      // ── 모션 프롬프트 생성 ──
      case 'generateMotionPrompt': {
        const { narration, visualPrompt } = params;
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
${(visualPrompt || '').slice(0, 300)}

## Output Format
Return ONLY the motion prompt, no explanation.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return res.json({ motionPrompt: response.text?.trim() || '' });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/gemini] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
