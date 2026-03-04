import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || process.env.FAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const requestId = req.query.requestId as string;
  if (!requestId) return res.status(400).json({ error: 'requestId query parameter required' });

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

    return res.json(statusData);
  } catch (error: any) {
    console.error('[api/fal-poll] 폴링 실패:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
