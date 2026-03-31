import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// ── 크레딧 차감 ──

// toss 쇼츠메이커는 toss-user.ts에서 크레딧을 관리하므로, 여기서는 스킵
async function checkAndDeductCredits(_req: VercelRequest, _creditAmount: number, _description: string): Promise<{ ok: boolean; error?: string; balance?: number }> {
  return { ok: true };
}

// ── 사용량 로깅 ──

async function logUsage(_req: VercelRequest, action: string, costUsd: number) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const now = new Date();
    await supabase.from('toss_usage').insert({
      action,
      cost_usd: costUsd,
      count: 1,
      created_at: now.toISOString(),
    });

    // 일일 비용 모니터링 (10분에 1번만 체크 — Math.random 확률)
    if (Math.random() < 0.1) {
      const todayStart = `${now.toISOString().split('T')[0]}T00:00:00`;
      const { data } = await supabase
        .from('toss_usage')
        .select('cost_usd')
        .gte('created_at', todayStart);
      const totalCost = (data || []).reduce((sum: number, r: any) => sum + (r.cost_usd || 0), 0);
      if (totalCost > 10) { // $10/일 초과 시 경고
        console.warn(`[COST ALERT] Daily cost: $${totalCost.toFixed(2)} (threshold: $10)`);
      }
    }
  } catch (e) {
    console.error('[toss-image] logUsage error:', e);
  }
}

// ── 안전 키워드 대체 ──

const KEYWORD_ALTERNATIVES: Record<string, string[]> = {
  'explosion': ['burst', 'rapid expansion'],
  'bomb': ['impact', 'dramatic event'],
  'naked': ['bare', 'exposed'],
  'blood': ['red liquid', 'crimson'],
  'death': ['end', 'decline'],
  'kill': ['eliminate', 'stop'],
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

// ── API 키 ──

function pickGeminiKey(): string | undefined {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean) as string[];
  if (keys.length === 0) return undefined;
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — 앱인토스 미니앱 origin 화이트리스트
  const { handleCors } = await import('./_cors');
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 세션 인증 필수
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sUrl || !sKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const sb = createClient(sUrl, sKey);
  const { data: sess } = await sb
    .from('toss_sessions')
    .select('user_key')
    .eq('token', sessionToken)
    .single();
  if (!sess?.user_key) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const apiKey = pickGeminiKey();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const ai = new GoogleGenAI({ apiKey });
  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      case 'generateImage': {
        const {
          visualPrompt,       // 영어 장면 디렉션 (toss-script.ts에서 생성)
          customStylePrompt,  // 추가 스타일 지시
          prevSceneImage,     // 이전 장면 이미지 (캐릭터 일관성)
          referenceImages,    // 캐릭터 참조 이미지
          imageModelId,       // Gemini 모델 ID
        } = params;

        if (!visualPrompt) {
          return res.status(400).json({ error: 'visualPrompt required' });
        }

        // 입력값 검증
        const ALLOWED_MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-exp-image-generation'];
        if (imageModelId && !ALLOWED_MODELS.includes(imageModelId)) {
          return res.status(400).json({ error: 'Invalid imageModelId' });
        }
        if (typeof visualPrompt !== 'string' || visualPrompt.length > 5000) {
          return res.status(400).json({ error: 'visualPrompt too long' });
        }

        // 크레딧 차감 (16크레딧)
        const creditResult = await checkAndDeductCredits(req, 16, '이미지 생성 (토스 쇼츠)');
        if (!creditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 16)`,
            balance: creditResult.balance,
          });
        }

        const MAX_RETRY = 3;
        let lastError: any;

        for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
          const promptText = attempt === 0 ? visualPrompt : sanitizePrompt(visualPrompt, attempt - 1);

          try {
            const parts: any[] = [];

            // 이전 장면 이미지 참조 (캐릭터만 유지, 배경 변경)
            if (prevSceneImage) {
              const imageData = prevSceneImage.startsWith('data:')
                ? prevSceneImage.split(',')[1]
                : prevSceneImage;
              parts.push({
                inlineData: { mimeType: 'image/png', data: imageData },
              });
              parts.push({
                text: '[CHARACTER CONTINUITY] This is the reference image. Keep the EXACT SAME character design — same species, proportions, colors, clothing, and features. However, the BACKGROUND and SETTING must be COMPLETELY DIFFERENT from the reference. Follow the scene prompt below for the new environment.',
              });
            }

            // 캐릭터 참조 이미지
            if (referenceImages?.character?.length) {
              if (referenceImages.character.length > 3) {
                return res.status(400).json({ error: 'Max 3 reference images' });
              }
              for (const img of referenceImages.character) {
                // 형식: "image/png:base64data" 또는 순수 base64
                let imageData: string;
                let mimeType = 'image/jpeg';
                if (img.startsWith('image/')) {
                  const colonIdx = img.indexOf(':');
                  mimeType = img.slice(0, colonIdx);
                  imageData = img.slice(colonIdx + 1);
                } else if (img.includes(',')) {
                  imageData = img.split(',')[1];
                } else {
                  imageData = img;
                }
                parts.push({ inlineData: { data: imageData, mimeType } });
              }
              parts.push({
                text: `[CRITICAL CHARACTER REFERENCE — HIGHEST PRIORITY]
The image(s) above show the EXACT character that MUST appear in the generated image.
You MUST replicate this character's appearance with high fidelity:
- SAME face shape, eye shape, eye color
- SAME hair style, hair color, hair length
- SAME skin tone and body proportions
- SAME clothing style and colors (if visible)
- SAME species and features (if animal character)
The generated image must look like the SAME character in a different scene.
Do NOT create a generic or different-looking character. The reference image is the ground truth.`,
              });
            }

            // 스타일 지시
            if (customStylePrompt) {
              parts.push({
                text: `[STYLE INSTRUCTION] ${customStylePrompt}`,
              });
            }

            // 메인 장면 프롬프트 — getFinalVisualPrompt 없이 직접 구성
            const scenePrompt = [
              `[SCENE] ${promptText}`,
              '',
              '[RULES]',
              '- Do NOT render any text, captions, titles, speech bubbles, or watermarks anywhere in the image.',
              '- Do NOT render any Korean/Hangul characters (한글) in the image.',
              '- Portrait orientation (9:16 aspect ratio).',
              '- The image must be a pure visual illustration with no written content whatsoever.',
            ].join('\n');

            parts.push({ text: scenePrompt });

            const model = imageModelId || 'gemini-2.5-flash-image';
            const response = await ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: '9:16' },
              },
            });

            const responseParts = response.candidates?.[0]?.content?.parts || [];
            for (const part of responseParts) {
              if (part.inlineData) {
                logUsage(req, 'toss-image', 0.039);
                return res.json({
                  imageData: part.inlineData.data,
                  creditBalance: creditResult.balance,
                });
              }
            }

            // 이미지 없는 응답 → 재시도 (안전 필터 소프트 거부)
            if (attempt < MAX_RETRY - 1) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            return res.json({ imageData: null });
          } catch (error: any) {
            lastError = error;
            const errorMsg = error.message || JSON.stringify(error);
            const isSafetyError = /safety|blocked|policy|content|SAFETY|harmful/i.test(errorMsg) || error.status === 400;
            if (isSafetyError && attempt < MAX_RETRY - 1) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            throw error;
          }
        }

        throw lastError || new Error('이미지 생성 실패');
      }

      // ── 캐릭터 이미지 분석 (Vision) ──
      case 'describeCharacter': {
        const { images } = params; // base64 이미지 배열 ("image/png:base64data" 형식)
        if (!images?.length) return res.status(400).json({ error: 'images required' });

        const parts: any[] = [];
        for (const img of images) {
          let imageData: string;
          let mimeType = 'image/jpeg';
          if (img.startsWith('image/')) {
            const colonIdx = img.indexOf(':');
            mimeType = img.slice(0, colonIdx);
            imageData = img.slice(colonIdx + 1);
          } else {
            imageData = img;
          }
          parts.push({ inlineData: { data: imageData, mimeType } });
        }

        parts.push({
          text: `Describe this character's visual appearance in detail so an illustrator can recreate it.

CRITICAL RULE: Do NOT mention the character's name, franchise, studio, or any trademarked/copyrighted names. Only describe what you SEE visually using generic descriptive terms.

Include:
- Species/type (e.g. "anthropomorphic mouse", not a brand name)
- Body shape, proportions, and size
- Colors: skin/fur color, clothing colors, accessory colors
- Distinctive features: ears, tail, hat, shoes, gloves, etc.
- Clothing: what they wear, style, colors
- Art style if apparent (cartoon, realistic, anime, etc.)

Keep it under 100 words. Be specific and visual. Write in English.
Example: Instead of naming the character, write "A small anthropomorphic mouse with large round black ears, white face, red shorts with white buttons, yellow shoes, and white gloves in classic cartoon style."`,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts },
        });

        const description = response.text || '';
        return res.json({ description: description.trim() });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-image]', error.message || error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
