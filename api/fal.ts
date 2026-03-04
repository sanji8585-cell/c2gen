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

async function logError(action: string, errorMessage: string) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from('c2gen_error_logs').insert({
      service: 'fal', action, error_message: errorMessage,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || process.env.FAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { action, ...params } = req.body;

  try {
    switch (action) {
      // ── 이미지 업로드 (data URL 직접 사용 - PixVerse 지원) ──
      case 'uploadImage': {
        const { imageBase64 } = params;
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
        // PixVerse는 data URL을 직접 지원하므로 별도 스토리지 업로드 불필요
        return res.json({ url: `data:image/jpeg;base64,${imageBase64}` });
      }

      // ── 비디오 생성 제출 (비동기 큐) ──
      case 'submitVideo': {
        const { imageUrl, motionPrompt, duration = 5, aspectRatio = '16:9', resolution = '720p' } = params;
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

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
          return res.status(response.status).json({ error: errorText });
        }

        const result = await response.json();
        logUsage(req, 'video', 0.15);
        return res.json({ requestId: result.request_id, statusUrl: result.status_url });
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
        logUsage(req, 'image', 0.003);
        return res.json(result);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/fal] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
