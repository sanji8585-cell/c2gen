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
    // storage.objects 테이블 직접 조회 (재귀 폴더 구조 대응)
    const { data: objects, error } = await sb
      .schema('storage' as any)
      .from('objects')
      .select('name')
      .eq('bucket_id', 'toss-videos')
      .lt('created_at', cutoff)
      .limit(1000);

    if (error) throw error;
    if (!objects || objects.length === 0) {
      return res.json({ ok: true, deleted: 0, cutoff });
    }

    const paths = objects.map((o: any) => o.name);
    const { error: delErr } = await sb.storage.from('toss-videos').remove(paths);
    if (delErr) throw delErr;

    console.log(`[storage-cleanup] Deleted ${paths.length} files older than ${TTL_HOURS}h`);
    return res.json({ ok: true, deleted: paths.length, cutoff });
  } catch (error: any) {
    console.error('[storage-cleanup]', error);
    return res.status(500).json({ error: error.message || 'Cleanup failed' });
  }
}
