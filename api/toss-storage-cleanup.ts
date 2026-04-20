import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

// toss-videos 버킷에서 TTL_HOURS 이상 된 mp4 파일을 자동 삭제
// Vercel Cron이 매시간 호출 (vercel.json crons)
const TTL_HOURS = 1;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron은 Authorization: Bearer $CRON_SECRET 자동 전달
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server configuration error' });

  const sb = createClient(url, key);
  const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString();

  try {
    // RPC: public.list_old_toss_videos(ttl_hours) SECURITY DEFINER로
    // storage.objects 조회 (service_role grant). PostgREST 기본 schema 제약 우회.
    const { data, error } = await sb.rpc('list_old_toss_videos', { ttl_hours: TTL_HOURS });
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.json({ ok: true, deleted: 0, cutoff });
    }

    const paths = (data as { name: string }[]).map((o) => o.name);
    const { error: delErr } = await sb.storage.from('toss-videos').remove(paths);
    if (delErr) throw delErr;

    console.log(`[storage-cleanup] Deleted ${paths.length} files older than ${TTL_HOURS}h`);
    return res.json({ ok: true, deleted: paths.length, cutoff });
  } catch (error: any) {
    console.error('[storage-cleanup]', error);
    return res.status(500).json({ error: error.message || 'Cleanup failed' });
  }
}
