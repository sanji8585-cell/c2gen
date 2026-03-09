import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import {
  SYSTEM_INSTRUCTIONS,
  getTrendSearchPrompt,
  getScriptGenerationPrompt,
  getFinalVisualPrompt,
  getMoodAnalysisPrompt,
  getThumbnailPrompt,
} from '../services/prompts.js';
import { GEMINI_STYLE_CATEGORIES, GEMINI_VOICE_MAP, VIDEO_DIMENSIONS, type VideoOrientation } from '../config.js';

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

async function logError(action: string, errorMessage: string, options?: {
  severity?: 'info' | 'warn' | 'error' | 'critical';
  stack?: string;
  email?: string;
  context?: Record<string, any>;
}) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from('c2gen_error_logs').insert({
      service: 'gemini', action, error_message: errorMessage,
      severity: options?.severity || 'error',
      stack_trace: options?.stack?.slice(0, 4000),
      email: options?.email,
      request_context: options?.context,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* ignore */ }
}

// ── 크레딧 차감 ─────────────────────────────

async function checkAndDeductCredits(req: VercelRequest, creditAmount: number, description: string): Promise<{ ok: boolean; error?: string; balance?: number }> {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken || req.headers['x-custom-api-key']) return { ok: true };

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true };

    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions')
      .select('email')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!session?.email) return { ok: true };

    // 운영자 등급은 크레딧 차감 스킵
    const { data: userRow } = await supabase
      .from('c2gen_users').select('plan').eq('email', session.email).single();
    if (userRow?.plan === 'operator') return { ok: true };

    const { data } = await supabase.rpc('deduct_credits', {
      p_email: session.email,
      p_amount: creditAmount,
      p_description: description,
    });
    if (!data?.success) return { ok: false, error: data?.error, balance: data?.current };
    return { ok: true, balance: data.balance };
  } catch (e) {
    console.error('[api/gemini] checkAndDeductCredits error:', e);
    return { ok: true }; // 크레딧 시스템 오류 시 생성 허용
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
        const { category, usedTopics, language } = params;
        const prompt = getTrendSearchPrompt(category, (usedTopics || []).join(', '), language);
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTIONS.TREND_RESEARCHER,
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
          },
        });
        return res.json(JSON.parse(cleanJsonResponse(response.text ?? '')));
      }

      // ── 스크립트 생성 (단일 청크) ──
      case 'generateScript': {
        const { topic, hasReferenceImage, sourceContext, chunkInfo, language } = params;
        const baseInstruction =
          topic === 'Manual Script Input' ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER
          : hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH
          : SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;

        const inputText = sourceContext || topic;
        const inputLength = inputText.length;
        const sentences = inputText.split(/[.!?。]+/).filter((s: string) => s.trim().length > 0);
        const sentenceCount = Math.max(1, sentences.length);
        const isKeywordOnly = !sourceContext || inputLength < 100;
        const rawSceneCount = inputLength < 200
          ? sentenceCount
          : Math.max(sentenceCount, Math.ceil(inputLength / 80));
        const estimatedSceneCount = isKeywordOnly ? Math.max(6, rawSceneCount) : rawSceneCount;
        const maxOutputTokens = Math.min(65536, Math.max(16384, Math.ceil(estimatedSceneCount * 800 * 1.5)));

        const chunkLabel = chunkInfo ? `[청크 ${chunkInfo.current}/${chunkInfo.total}] ` : '';
        console.log(`${chunkLabel}[Script] 입력: ${inputLength}자, 예상 씬: ${estimatedSceneCount}개, maxOutputTokens: ${maxOutputTokens}, lang: ${language || 'ko'}`);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: getScriptGenerationPrompt(topic, sourceContext, language),
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

        // 크레딧 차감 (스크립트: 5크레딧)
        const scriptCreditResult = await checkAndDeductCredits(req, 5, '스크립트 생성');
        if (!scriptCreditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${scriptCreditResult.balance ?? 0}, 필요: 5)`,
            balance: scriptCreditResult.balance,
          });
        }

        logUsage(req, 'script', 0);
        return res.json(mapped);
      }

      // ── 이미지 생성 ──
      case 'generateImage': {
        const { scene, referenceImages, styleId, customStylePrompt, orientation, isPreview, suppressKorean } = params;
        const hasCharacterRef = referenceImages?.character?.length > 0;
        const hasStyleRef = referenceImages?.style?.length > 0;
        const geminiStylePrompt = hasStyleRef ? undefined : resolveStylePrompt(styleId, customStylePrompt);
        const basePrompt = getFinalVisualPrompt(scene, hasCharacterRef, geminiStylePrompt, suppressKorean, scene?.analysis?.directives);

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

            const responseParts = response.candidates?.[0]?.content?.parts || [];
            for (const part of responseParts) {
              if (part.inlineData) {
                // 미리보기는 크레딧 차감 없이 허용
                if (!isPreview) {
                  // 크레딧 차감 (Gemini 이미지: 16크레딧)
                  const creditResult = await checkAndDeductCredits(req, 16, '이미지 생성 (Gemini)');
                  if (!creditResult.ok) {
                    return res.status(402).json({
                      error: 'insufficient_credits',
                      message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 16)`,
                      balance: creditResult.balance,
                    });
                  }
                  logUsage(req, 'image', 0.0315);
                  return res.json({ imageData: part.inlineData.data, creditBalance: creditResult.balance });
                }
                logUsage(req, 'preview', 0.0315);
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
        // V2.0: 언어/성별 기반 음성 자동 선택
        const voiceName = (() => {
          const lang = params.language || 'ko';
          const gender = params.gender || 'female';
          return GEMINI_VOICE_MAP[lang]?.[gender] || GEMINI_VOICE_MAP.ko.female;
        })();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: { parts: [{ text }] },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        return res.json({ audioData });
      }

      // ── 자막 의미 단위 분리 ──
      case 'splitSubtitle': {
        const { narration, maxChars = 20, language = 'ko' } = params;

        const langRules: Record<string, string> = {
          ko: `## 자막 분리 규칙
1. 각 청크는 15~20자 (최대 ${maxChars}자)
2. 1초당 4-5글자, 최소 1.5초 = 최소 6~8글자
3. 의미 단위로 자연스럽게 끊기

## 끊는 위치
✅ 좋은 위치: 쉼표(,) 뒤, 마침표(.) 뒤, 조사 뒤 공백
❌ 나쁜 위치: 단어 중간, 숫자 내 쉼표(4,200), 조사 앞`,
          en: `## Subtitle Split Rules
1. Each chunk is 5-8 words (max ${maxChars} characters)
2. Split at natural phrase boundaries
3. Keep meaningful units together

## Good split positions
✅ After commas, periods, conjunctions, prepositions
❌ In the middle of a phrase or name`,
          ja: `## 字幕分割ルール
1. 各チャンクは15~20文字（最大${maxChars}文字）
2. 1秒あたり4-5文字、最低1.5秒 = 最低6~8文字
3. 意味単位で自然に区切る

## 区切り位置
✅ 読点(、)の後、句点(。)の後、助詞の後
❌ 単語の途中、数字内のカンマ`,
        };

        const prompt = `Subtitle splitting task. Split the original text into chunks.

###### CRITICAL RULES ######
- Do NOT add/remove spaces
- Do NOT fix spelling
- Do NOT change any character
- Concatenating all chunks must exactly reproduce the original
############################

${langRules[language] || langRules.ko}

## Original text (split this exactly)
${narration}

## Output
JSON array only. Example: ["chunk1", "chunk2"]`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const chunks = JSON.parse(cleanJsonResponse(response.text ?? ''));
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

      // ── 분위기 분석 (BGM 자동 선택용) ──
      case 'analyzeMood': {
        const { narrations } = params;
        const prompt = getMoodAnalysisPrompt(narrations);
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        return res.json(JSON.parse(cleanJsonResponse(response.text ?? '')));
      }

      // ── 썸네일 이미지 생성 ──
      case 'generateThumbnail': {
        const { topic, platform, style, contentSummary, customPrompt } = params;
        const thumbnailPromptText = customPrompt || getThumbnailPrompt(topic, platform || 'youtube', style, contentSummary);
        const aspectRatio = platform === 'tiktok' ? '9:16' : platform === 'instagram' ? '1:1' : '16:9';

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: thumbnailPromptText }] },
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: { aspectRatio },
          },
        });

        const thumbParts = response.candidates?.[0]?.content?.parts || [];
        for (const part of thumbParts) {
          if (part.inlineData) {
            const creditResult = await checkAndDeductCredits(req, 16, '썸네일 생성');
            if (!creditResult.ok) {
              return res.status(402).json({
                error: 'insufficient_credits',
                message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 16)`,
                balance: creditResult.balance,
              });
            }
            logUsage(req, 'thumbnail', 0.0315);
            return res.json({ imageData: part.inlineData.data, creditBalance: creditResult.balance });
          }
        }
        return res.json({ imageData: null });
      }

      // ── AI 대본 어시스턴트 (고급 모드) ──
      case 'generateAdvancedScript': {
        const { userIntent, settings, language } = params;
        const langName = language === 'en' ? 'English' : language === 'ja' ? '日本語' : '한국어';

        const formatGuide = settings.format !== 'auto' ? `형식: ${settings.format === 'monologue' ? '독백' : settings.format === 'dialogue' ? '대화형' : '나레이션'}` : '';
        const speakerGuide = settings.speakerCount !== 'auto' ? `화자 수: ${settings.speakerCount}명` : '';
        const moodGuide = settings.mood !== 'auto' ? `분위기: ${settings.mood === 'bright' ? '밝고 희망적' : settings.mood === 'tense' ? '긴장감 있는' : '차분한'}` : '';
        const connectionGuide = settings.sceneConnection !== 'auto' ? `씬 연결: ${settings.sceneConnection === 'connected' ? '이전 씬과 이어지게 (이전씬유지) 디렉티브 사용' : '각 씬 독립적'}` : '';

        const settingsText = [formatGuide, speakerGuide, moodGuide, connectionGuide].filter(Boolean).join('\n');

        const prompt = `당신은 영상 대본 작가입니다. 사용자의 의도를 바탕으로 디렉티브가 포함된 완성 대본을 ${langName}로 작성하세요.

## 디렉티브 문법
각 문장 끝에 괄호로 연출 지시를 넣을 수 있습니다:
- (배경: 설명) — 배경 장면
- (분위기: 밝음/어두움/중립) — 이미지 톤
- (구도: 클로즈업/미디엄샷/와이드샷/캐릭터없음) — 카메라 구도
- (화자: 이름) — 해당 씬의 화자 (대화형일 때)
- (이전씬유지) — 이전 씬과 같은 배경 유지
- (같은장소) — 이전 씬 배경만 유지
- (시간경과) — 같은 장소 + 조명 변화
- (텍스트: "표시할 내용") — 이미지 내 텍스트
- (색상: 설명) — 색상 강조
- (카메라: 설명) — 카메라 앵글

## 규칙
- 한 문장 = 1개 씬. 마침표로 구분
- 최소 6씬 이상 작성
- 나레이션은 ${langName}로, 디렉티브 값은 ${langName}로 작성
- 자연스럽고 몰입감 있는 대본 작성
- 디렉티브는 적절히 배치 (매 씬마다 넣을 필요 없음)
${settingsText ? `\n## 사용자 설정\n${settingsText}` : ''}

## 사용자 의도
${userIntent}

디렉티브가 포함된 완성 대본만 출력하세요. 설명이나 주석 없이 대본만 작성합니다.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        return res.json({ script: response.text ?? '' });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/gemini] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error', { stack: error.stack });
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
