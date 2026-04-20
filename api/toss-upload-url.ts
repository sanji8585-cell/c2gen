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

  // ★ Supabase Storage key는 S3 호환 — ASCII safe chars만 허용 (한글·유니코드 금지)
  // 한글 파일명은 사용자 다운로드 시 ?download= 쿼리로 전달
  const body = (req.body || {}) as { fileName?: string; downloadName?: string };
  const rawDownload = body.downloadName || body.fileName || 'shorts';
  const downloadName = rawDownload.replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 80).trim() || 'shorts';

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `${sess.user_key}/${timestamp}_${random}.mp4`;

  try {
    const { data, error } = await sb.storage.from('toss-videos').createSignedUploadUrl(path);
    if (error) throw error;

    const { data: pub } = sb.storage.from('toss-videos').getPublicUrl(path);
    // ?download=파일명 — 외부 브라우저에서 저장 시 이 이름으로 제안됨 (Supabase 공식 지원)
    const downloadUrl = `${pub.publicUrl}?download=${encodeURIComponent(downloadName)}.mp4`;

    return res.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: pub.publicUrl,
      downloadUrl,
    });
  } catch (error: any) {
    console.error('[toss-upload-url]', error);
    return res.status(500).json({ error: error.message || 'Failed to create upload URL' });
  }
}
