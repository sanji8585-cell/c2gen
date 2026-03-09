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

async function verifyCampaignOwnership(
  supabase: ReturnType<typeof getSupabase>,
  campaignId: string,
  email: string
): Promise<boolean> {
  const { data } = await supabase
    .from('c2gen_campaigns')
    .select('user_email')
    .eq('id', campaignId)
    .single();
  return data?.user_email === email;
}

async function getItemWithOwnership(
  supabase: ReturnType<typeof getSupabase>,
  itemId: string,
  email: string
): Promise<{ item: Record<string, unknown> | null; owned: boolean }> {
  const { data: item } = await supabase
    .from('c2gen_approval_queue')
    .select('*')
    .eq('id', itemId)
    .single();

  if (!item) return { item: null, owned: false };

  const owned = await verifyCampaignOwnership(supabase, item.campaign_id as string, email);
  return { item: item as Record<string, unknown>, owned };
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
      // ── 승인 대기 목록 ──
      case 'approval-list': {
        const { campaign_id } = params;

        // __direct__: 캠페인 없이 직접 생성한 콘텐츠 조회
        if (campaign_id === '__direct__') {
          const { data, error } = await supabase
            .from('c2gen_approval_queue')
            .select('*')
            .is('campaign_id', null)
            .order('created_at', { ascending: false });

          if (error) throw error;
          return res.json({ success: true, items: data || [] });
        }

        if (!campaign_id) {
          return res.status(400).json({ success: false, message: 'campaign_id is required' });
        }

        // Verify campaign ownership
        const isOwner = await verifyCampaignOwnership(supabase, campaign_id, email);
        if (!isOwner) {
          return res.status(403).json({ success: false, message: 'Campaign not found or access denied' });
        }

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .select('*')
          .eq('campaign_id', campaign_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, items: data || [] });
      }

      // ── 단건 승인 ──
      case 'approval-approve': {
        const { id } = params;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        const { item, owned } = await getItemWithOwnership(supabase, id, email);
        if (!item || !owned) {
          return res.status(403).json({ success: false, message: 'Item not found or access denied' });
        }

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .update({
            status: 'approved',
            reviewer_email: email,
            approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, item: data });
      }

      // ── 거부 ──
      case 'approval-reject': {
        const { id, review_notes } = params;
        if (!id || !review_notes) {
          return res.status(400).json({ success: false, message: 'id and review_notes are required' });
        }

        const { item, owned } = await getItemWithOwnership(supabase, id, email);
        if (!item || !owned) {
          return res.status(403).json({ success: false, message: 'Item not found or access denied' });
        }

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .update({
            status: 'rejected',
            reviewer_email: email,
            review_notes,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, item: data });
      }

      // ── 일괄 승인 ──
      case 'approval-bulk-approve': {
        const { ids } = params;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ success: false, message: 'ids (array) is required' });
        }

        // Verify ownership for all items by checking their campaigns
        const { data: items, error: fetchErr } = await supabase
          .from('c2gen_approval_queue')
          .select('id, campaign_id')
          .in('id', ids);

        if (fetchErr) throw fetchErr;
        if (!items || items.length === 0) {
          return res.status(404).json({ success: false, message: 'No items found' });
        }

        // Get unique campaign IDs and verify ownership
        const campaignIds = Array.from(new Set(items.map((i) => i.campaign_id)));
        const { data: campaigns } = await supabase
          .from('c2gen_campaigns')
          .select('id, user_email')
          .in('id', campaignIds);

        const ownedCampaignIds = new Set(
          (campaigns || []).filter((c) => c.user_email === email).map((c) => c.id)
        );

        const authorizedIds = items
          .filter((i) => ownedCampaignIds.has(i.campaign_id))
          .map((i) => i.id);

        if (authorizedIds.length === 0) {
          return res.status(403).json({ success: false, message: 'No authorized items found' });
        }

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .update({
            status: 'approved',
            reviewer_email: email,
            approved_at: new Date().toISOString(),
          })
          .in('id', authorizedIds)
          .select();

        if (error) throw error;
        return res.json({ success: true, approved: data?.length || 0, items: data || [] });
      }

      // ── 단건 조회 ──
      case 'approval-get': {
        const { id } = params;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        const { item, owned } = await getItemWithOwnership(supabase, id, email);
        if (!item || !owned) {
          return res.status(404).json({ success: false, message: 'Item not found or access denied' });
        }

        return res.json({ success: true, item });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ success: false, message });
  }
}
