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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = params.token;

  try {
    const supabase = getSupabase();

    switch (action) {

      // ══════════════════════════════════════════
      // 채널 워크스페이스 관리 (C2 PILOT Phase 1)
      // ══════════════════════════════════════════

      // ── 채널 목록 조회 ──
      case 'channel-list': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        // owner이거나 assigned_operators에 포함된 채널 조회
        const { data: ownedChannels, error: ownErr } = await supabase
          .from('c2gen_channels')
          .select('*')
          .eq('owner_email', email)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (ownErr) throw ownErr;

        const { data: assignedChannels, error: assignErr } = await supabase
          .from('c2gen_channels')
          .select('*')
          .contains('assigned_operators', [email])
          .neq('owner_email', email)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (assignErr) throw assignErr;

        const channels = [...(ownedChannels || []), ...(assignedChannels || [])];
        return res.json({ channels });
      }

      // ── 채널 생성 ──
      case 'channel-create': {
        const { name, description, platform_accounts, settings } = params;
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { data: channel, error: crErr } = await supabase
          .from('c2gen_channels')
          .insert({
            owner_email: email,
            name: name.trim(),
            description: description?.trim() || null,
            platform_accounts: platform_accounts || {},
            settings: settings || {},
          })
          .select()
          .single();

        if (crErr) throw crErr;
        return res.json({ channel });
      }

      // ── 채널 수정 ──
      case 'channel-update': {
        const { id, name, description, platform_accounts, settings, brand_preset_id, assigned_operators } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        // 소유권 확인
        const { data: existing, error: fetchErr } = await supabase
          .from('c2gen_channels')
          .select('owner_email')
          .eq('id', id)
          .single();

        if (fetchErr || !existing) return res.status(404).json({ error: 'Channel not found' });
        if (existing.owner_email !== email) return res.status(403).json({ error: 'Permission denied: not channel owner' });

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name.trim();
        if (description !== undefined) updates.description = description?.trim() || null;
        if (platform_accounts !== undefined) updates.platform_accounts = platform_accounts;
        if (settings !== undefined) updates.settings = settings;
        if (brand_preset_id !== undefined) updates.brand_preset_id = brand_preset_id || null;
        if (assigned_operators !== undefined) updates.assigned_operators = assigned_operators;

        const { data: updated, error: upErr } = await supabase
          .from('c2gen_channels')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (upErr) throw upErr;
        return res.json({ channel: updated });
      }

      // ── 채널 삭제 ──
      case 'channel-delete': {
        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        // 소유권 확인
        const { data: existing, error: fetchErr } = await supabase
          .from('c2gen_channels')
          .select('owner_email')
          .eq('id', id)
          .single();

        if (fetchErr || !existing) return res.status(404).json({ error: 'Channel not found' });
        if (existing.owner_email !== email) return res.status(403).json({ error: 'Permission denied: not channel owner' });

        const { error: delErr } = await supabase
          .from('c2gen_channels')
          .delete()
          .eq('id', id);

        if (delErr) throw delErr;
        return res.json({ success: true });
      }

      // ── 채널 단건 조회 (브랜드 프리셋 조인) ──
      case 'channel-get': {
        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { data: channel, error: getErr } = await supabase
          .from('c2gen_channels')
          .select('*, c2gen_brand_presets(*)')
          .eq('id', id)
          .single();

        if (getErr || !channel) return res.status(404).json({ error: 'Channel not found' });

        // 소유자이거나 assigned_operators에 포함된 경우만 접근 허용
        const isOwner = channel.owner_email === email;
        const isOperator = Array.isArray(channel.assigned_operators) && channel.assigned_operators.includes(email);
        if (!isOwner && !isOperator) return res.status(403).json({ error: 'Permission denied' });

        return res.json({ channel });
      }

      default:
        return res.status(400).json({ error: `Unknown channel action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/channel] ${action} error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
