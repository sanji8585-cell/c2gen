import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// ── 크레딧 차감 ──

async function checkAndDeductCredits(req: VercelRequest, creditAmount: number, description: string): Promise<{ ok: boolean; error?: string; balance?: number }> {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) return { ok: true };

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
    console.error('[toss-image] checkAndDeductCredits error:', e);
    return { ok: true };
  }
}

// ── 사용량 로깅 ──

async function logUsage(req: VercelRequest, action: string, costUsd: number) {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) return;

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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
              parts.push({
                text: '[CHARACTER REFERENCE] Match this character\'s appearance closely. Focus on: face, body shape, clothing, colors.',
              });
              for (const img of referenceImages.character) {
                const imageData = img.includes(',') ? img.split(',')[1] : img;
                parts.push({ inlineData: { data: imageData, mimeType: 'image/jpeg' } });
              }
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

            const model = imageModelId || 'gemini-3.1-flash-image-preview';
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
                logUsage(req, 'toss-image', 0.0315);
                return res.json({
                  imageData: part.inlineData.data,
                  creditBalance: creditResult.balance,
                });
              }
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

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-image]', error.message || error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
