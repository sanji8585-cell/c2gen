import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
    console.error('[api/fal] logUsage error:', e);
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
      service: 'fal', action, error_message: errorMessage,
      severity: options?.severity || 'error',
      stack_trace: options?.stack?.slice(0, 4000),
      email: options?.email,
      request_context: options?.context,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

// ── 크레딧 차감 ──

async function checkAndDeductCredits(req: VercelRequest, creditAmount: number, description: string): Promise<{ ok: boolean; error?: string; balance?: number; email?: string }> {
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
    if (userRow?.plan === 'operator') return { ok: true, email: session.email };

    const { data } = await supabase.rpc('deduct_credits', {
      p_email: session.email,
      p_amount: creditAmount,
      p_description: description,
    });
    if (!data?.success) return { ok: false, error: data?.error, balance: data?.current };
    return { ok: true, balance: data.balance, email: session.email };
  } catch (e) {
    console.error('[api/fal] checkAndDeductCredits error:', e);
    return { ok: true };
  }
}

// ── 크레딧 환불 ──

async function refundCredits(email: string | undefined, creditAmount: number, description: string): Promise<void> {
  if (!email) return;
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);

    // 운영자는 차감 안 했으므로 환불도 불필요
    const { data: userRow } = await supabase
      .from('c2gen_users').select('plan').eq('email', email).single();
    if (userRow?.plan === 'operator') return;

    await supabase.rpc('add_credits', {
      p_email: email,
      p_amount: creditAmount,
      p_type: 'refund',
      p_description: description,
    });
    console.log(`[api/fal] 크레딧 환불: ${email} +${creditAmount} (${description})`);
  } catch (e) {
    console.error('[api/fal] refundCredits error:', e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || process.env.FAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { action, ...params } = req.body;

  try {
    switch (action) {
      // ── 이미지 업로드 (fal.ai 스토리지에 실제 업로드) ──
      case 'uploadImage': {
        const { imageBase64 } = params;
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

        // base64 → Buffer
        const buffer = Buffer.from(imageBase64, 'base64');
        const contentType = 'image/jpeg';

        // fal.ai 스토리지에 업로드
        const uploadRes = await fetch('https://fal.run/fal-ai/fal-storage/upload', {
          method: 'PUT',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': contentType,
          },
          body: buffer,
        });

        if (!uploadRes.ok) {
          // 업로드 실패 시 data URL 폴백
          console.warn('[api/fal] 스토리지 업로드 실패, data URL 폴백 사용');
          return res.json({ url: `data:image/jpeg;base64,${imageBase64}` });
        }

        const uploadData = await uploadRes.json();
        return res.json({ url: uploadData.url || uploadData.access_url });
      }

      // ── 비디오 생성 제출 (비동기 큐) ──
      case 'submitVideo': {
        const { imageUrl, motionPrompt, duration = 5, aspectRatio = '16:9', resolution = '720p' } = params;
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

        // 크레딧 차감을 API 호출 전에 수행 (영상: 73크레딧)
        const creditResult = await checkAndDeductCredits(req, 73, '영상 생성 (PixVerse)');
        if (!creditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 73)`,
            balance: creditResult.balance,
          });
        }

        const requestBody = {
          prompt: motionPrompt || 'Gentle subtle motion, slow zoom in.',
          image_url: imageUrl,
          duration,
          aspect_ratio: aspectRatio,
          resolution,
          negative_prompt: 'blurry, low quality, low resolution, pixelated, noisy, grainy, distorted, static',
        };

        // 비동기 큐 API 사용 (즉시 request_id 반환)
        const response = await fetch('https://queue.fal.run/fal-ai/pixverse/v5.5/image-to-video', {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[api/fal] Submit error:', response.status, errorText);
          // 제출 실패 → 크레딧 환불
          await refundCredits(creditResult.email, 73, '영상 생성 실패 환불 (제출 오류)');
          return res.status(response.status).json({ error: errorText, refunded: true });
        }

        const result = await response.json();

        logUsage(req, 'video', 0.15);
        return res.json({ requestId: result.request_id, statusUrl: result.status_url, creditBalance: creditResult.balance, email: creditResult.email });
      }

      // ── Flux 이미지 생성 (동기) ──
      case 'generateFluxImage': {
        const { prompt: fluxPrompt } = params;
        if (!fluxPrompt) return res.status(400).json({ error: 'prompt required' });

        const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: fluxPrompt,
            image_size: 'landscape_16_9',
            num_inference_steps: 4,
            num_images: 1,
            enable_safety_checker: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({ error: errorText });
        }

        const result = await response.json();

        // 크레딧 차감 (Flux 이미지: 16크레딧)
        const fluxCreditResult = await checkAndDeductCredits(req, 16, '이미지 생성 (Flux)');
        if (!fluxCreditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${fluxCreditResult.balance ?? 0}, 필요: 16)`,
            balance: fluxCreditResult.balance,
          });
        }

        logUsage(req, 'image', 0.003);
        return res.json({ ...result, creditBalance: fluxCreditResult.balance });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/fal] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error', { stack: error.stack });
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
