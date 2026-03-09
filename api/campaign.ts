import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

async function getSessionEmail(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions').select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString()).single();
  return data?.email || null;
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();

    const email = await getSessionEmail(supabase, token);
    if (!email) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    switch (action) {
      // ── 캠페인 목록 ──
      case 'campaign-list': {
        const { data, error } = await supabase
          .from('c2gen_campaigns')
          .select('*')
          .eq('user_email', email)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, campaigns: data || [] });
      }

      // ── 캠페인 생성 ──
      case 'campaign-create': {
        const { name } = params;
        if (!name) {
          return res.status(400).json({ success: false, message: 'name is required' });
        }

        const insertData: Record<string, unknown> = {
          user_email: email,
          name,
        };

        const optionalFields = [
          'channel_id', 'brand_preset_id', 'description', 'topic_strategy',
          'target_platforms', 'video_engine_mode', 'schedule', 'auto_approve',
          'max_daily_count', 'budget_limit_daily', 'budget_limit_monthly',
        ];
        for (const field of optionalFields) {
          if (params[field] !== undefined) {
            insertData[field] = params[field];
          }
        }

        const { data, error } = await supabase
          .from('c2gen_campaigns')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, campaign: data });
      }

      // ── 캠페인 수정 ──
      case 'campaign-update': {
        const { id } = params;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        // Verify ownership
        const { data: existing } = await supabase
          .from('c2gen_campaigns')
          .select('user_email')
          .eq('id', id)
          .single();

        if (!existing || existing.user_email !== email) {
          return res.status(403).json({ success: false, message: 'Campaign not found or access denied' });
        }

        const allowedFields = [
          'name', 'description', 'topic_strategy', 'emotion_curve_template',
          'target_platforms', 'video_engine_mode', 'schedule', 'auto_approve',
          'max_daily_count', 'status', 'budget_limit_daily', 'budget_limit_monthly',
        ];

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const field of allowedFields) {
          if (params[field] !== undefined) {
            updateData[field] = params[field];
          }
        }

        const { data, error } = await supabase
          .from('c2gen_campaigns')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, campaign: data });
      }

      // ── 캠페인 삭제 ──
      case 'campaign-delete': {
        const { id } = params;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        // Verify ownership
        const { data: existing } = await supabase
          .from('c2gen_campaigns')
          .select('user_email')
          .eq('id', id)
          .single();

        if (!existing || existing.user_email !== email) {
          return res.status(403).json({ success: false, message: 'Campaign not found or access denied' });
        }

        const { error } = await supabase
          .from('c2gen_campaigns')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
      }

      // ── 캠페인 단건 조회 (+ 승인 대기 건수) ──
      case 'campaign-get': {
        const { id } = params;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        const { data: campaign, error } = await supabase
          .from('c2gen_campaigns')
          .select('*')
          .eq('id', id)
          .eq('user_email', email)
          .single();

        if (error || !campaign) {
          return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        // Count pending approval items
        const { count } = await supabase
          .from('c2gen_approval_queue')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', id)
          .eq('status', 'pending');

        return res.json({ success: true, campaign, pendingCount: count || 0 });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ success: false, message });
  }
}
