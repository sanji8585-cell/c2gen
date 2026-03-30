import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE config missing');
  return createClient(url, key);
}

async function getEmail(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email || null;
}

const TABLE = 'c2gen_deep_scripts';
const MAX_SAVED = 50; // 사용자당 최대 50개

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = req.headers['x-session-token'] as string;

  try {
    const supabase = getSupabase();
    const email = await getEmail(supabase, token);
    if (!email) return res.status(401).json({ error: '로그인이 필요합니다' });

    switch (action) {
      // ── 저장 ──
      case 'save': {
        const { topic, style, durationSec, mode, script, analysis, sceneCount, charCount } = params;
        if (!script || !topic) return res.status(400).json({ error: 'script and topic required' });

        // 최대 개수 제한 — 초과 시 가장 오래된 것 삭제
        const { count } = await supabase
          .from(TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('email', email);

        if (count && count >= MAX_SAVED) {
          const { data: oldest } = await supabase
            .from(TABLE)
            .select('id')
            .eq('email', email)
            .order('created_at', { ascending: true })
            .limit(count - MAX_SAVED + 1);

          if (oldest?.length) {
            await supabase
              .from(TABLE)
              .delete()
              .in('id', oldest.map(o => o.id));
          }
        }

        const { data, error } = await supabase
          .from(TABLE)
          .insert({
            email,
            topic,
            style: style || 'auto',
            duration_sec: durationSec || 180,
            mode: mode || 'deep',
            script,
            analysis: analysis || null,
            scene_count: sceneCount || 0,
            char_count: charCount || script.length,
            created_at: new Date().toISOString(),
          })
          .select('id, created_at')
          .single();

        if (error) throw error;
        return res.json({ success: true, id: data.id, created_at: data.created_at });
      }

      // ── 목록 조회 ──
      case 'list': {
        const { data, error } = await supabase
          .from(TABLE)
          .select('id, topic, style, duration_sec, mode, scene_count, char_count, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        return res.json({ scripts: data || [] });
      }

      // ── 상세 조회 (대본 전체 + 분석) ──
      case 'load': {
        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id required' });

        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .eq('id', id)
          .eq('email', email)
          .single();

        if (error || !data) return res.status(404).json({ error: '대본을 찾을 수 없습니다' });
        return res.json(data);
      }

      // ── 삭제 ──
      case 'delete': {
        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id required' });

        const { error } = await supabase
          .from(TABLE)
          .delete()
          .eq('id', id)
          .eq('email', email);

        if (error) throw error;
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[api/deep-script-save]', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
