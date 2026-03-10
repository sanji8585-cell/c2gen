import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getFinalVisualPrompt } from '../services/prompts.js';

// ── API 키 라운드 로빈 ──

function pickOpenAIKey(): string | undefined {
  const keys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
  ].filter(Boolean) as string[];
  if (keys.length === 0) return undefined;
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── 사용량 로깅 ──

async function logUsage(req: VercelRequest, action: string, costUsd: number) {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) return;
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
    console.error('[api/openai] logUsage error:', e);
  }
}

// ── 에러 로깅 ──

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
      service: 'openai', action, error_message: errorMessage,
      severity: options?.severity || 'error',
      stack_trace: options?.stack?.slice(0, 4000),
      email: options?.email,
      request_context: options?.context,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* ignore */ }
}

// ── 크레딧 차감 ──

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
    console.error('[api/openai] checkAndDeductCredits error:', e);
    return { ok: true };
  }
}

// ── 사이즈 매핑 ──

function getImageSize(orientation: string): string {
  return orientation === 'portrait' ? '1024x1536' : '1536x1024';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    switch (action) {
      case 'generateImage': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickOpenAIKey();
        if (!apiKey) {
          return res.json({ imageData: null, error: 'OpenAI API key not configured' });
        }

        const { scene, orientation, stylePrompt, isPreview, suppressKorean } = params;
        const size = getImageSize(orientation || 'landscape');

        // 프롬프트 구성 - stylePrompt를 artStylePrompt로 통합 (STYLE 섹션 교체)
        const prompt = getFinalVisualPrompt(scene, false, stylePrompt || undefined, suppressKorean, scene?.analysis?.directives);

        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt,
            n: 1,
            size,
            quality: 'medium',
            output_format: 'png',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[api/openai] Image error:', response.status, errorText);
          return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        const base64 = data?.data?.[0]?.b64_json;

        if (base64) {
          // 미리보기는 크레딧 차감 없이 허용
          if (!isPreview) {
            // 크레딧 차감 (GPT 이미지: 21크레딧)
            const creditResult = await checkAndDeductCredits(req, 21, '이미지 생성 (GPT Image-1)');
            if (!creditResult.ok) {
              return res.status(402).json({
                error: 'insufficient_credits',
                message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 21)`,
                balance: creditResult.balance,
              });
            }
            logUsage(req, 'image', 0.042);
            return res.json({ imageData: base64, creditBalance: creditResult.balance });
          }
          logUsage(req, 'preview', 0.042);
          return res.json({ imageData: base64 });
        }

        return res.json({ imageData: null });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/openai] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error', { stack: error.stack });
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
