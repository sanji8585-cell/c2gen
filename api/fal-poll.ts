import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// 영상 생성 실패 시 크레딧 환불
async function refundCredits(email: string | undefined, creditAmount: number, description: string): Promise<void> {
  if (!email) return;
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const { data: userRow } = await supabase
      .from('c2gen_users').select('plan').eq('email', email).single();
    if (userRow?.plan === 'operator') return;

    await supabase.rpc('add_credits', {
      p_email: email,
      p_amount: creditAmount,
      p_type: 'refund',
      p_description: description,
    });
    console.log(`[api/fal-poll] 크레딧 환불: ${email} +${creditAmount}`);
  } catch (e) {
    console.error('[api/fal-poll] refundCredits error:', e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || process.env.FAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const requestId = req.query.requestId as string;
  if (!requestId) return res.status(400).json({ error: 'requestId query parameter required' });

  // 실패 시 환불용 이메일 (클라이언트에서 전달)
  const userEmail = req.query.email as string | undefined;

  try {
    const statusUrl = `https://queue.fal.run/fal-ai/pixverse/requests/${requestId}/status`;

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[api/fal-poll] Status error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const statusData = await response.json();

    // 완료된 경우 결과도 가져오기
    if (statusData.status === 'COMPLETED') {
      const resultUrl = `https://queue.fal.run/fal-ai/pixverse/requests/${requestId}`;
      const resultResponse = await fetch(resultUrl, {
        method: 'GET',
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (resultResponse.ok) {
        const resultData = await resultResponse.json();
        return res.json({ status: 'COMPLETED', result: resultData });
      }
    }

    // fal.ai 측 실패 → 크레딧 환불
    if (statusData.status === 'FAILED') {
      await refundCredits(userEmail, 73, '영상 생성 실패 환불 (fal.ai 오류)');
      return res.json({ ...statusData, refunded: true });
    }

    return res.json(statusData);
  } catch (error: any) {
    console.error('[api/fal-poll] 폴링 실패:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
