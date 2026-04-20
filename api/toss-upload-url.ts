import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });

  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sUrl || !sKey) return res.status(500).json({ error: 'Server configuration error' });

  const sb = createClient(sUrl, sKey);
  const { data: sess } = await sb
    .from('toss_sessions')
    .select('user_key')
    .eq('token', sessionToken)
    .single();
  if (!sess?.user_key) return res.status(401).json({ error: 'Invalid session' });

  const { fileName } = (req.body || {}) as { fileName?: string };
  const safeName = (fileName || 'shorts').replace(/[^a-zA-Z0-9가-힣._-]/g, '_').slice(0, 60);
  const path = `${sess.user_key}/${Date.now()}_${safeName}.mp4`;

  try {
    const { data, error } = await sb.storage.from('toss-videos').createSignedUploadUrl(path);
    if (error) throw error;

    const { data: pub } = sb.storage.from('toss-videos').getPublicUrl(path);

    return res.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: pub.publicUrl,
    });
  } catch (error: any) {
    console.error('[toss-upload-url]', error);
    return res.status(500).json({ error: error.message || 'Failed to create upload URL' });
  }
}
