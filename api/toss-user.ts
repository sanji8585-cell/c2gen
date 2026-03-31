import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── 크레딧 매핑 (sku → 컷 수) ──
const SKU_CREDITS: Record<string, number> = {
  cuts_4: 4,
  cuts_12: 12,
  cuts_30: 30,
  cuts_60: 60,
  credits_5: 5,
  credits_15: 15,
  credits_50: 50,
};

// ── 세션 → userKey ──
async function getUserKey(req: VercelRequest): Promise<string | null> {
  const token = req.headers['x-session-token'] as string;
  if (!token) return null;

  const { data } = await supabase
    .from('toss_sessions')
    .select('user_key')
    .eq('token', token)
    .single();

  return data?.user_key || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — 앱인토스 미니앱 origin 화이트리스트
  const { handleCors } = await import('./_cors');
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userKey = await getUserKey(req);
  if (!userKey) return res.status(401).json({ error: 'Invalid session' });

  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      // ── 프로필 조회 ──
      case 'getProfile':
      case 'getCredits': {
        const { data: user } = await supabase
          .from('toss_users')
          .select('credits, is_premium, name')
          .eq('user_key', userKey)
          .single();

        if (!user) return res.status(404).json({ error: 'User not found' });

        return res.json({
          credits: user.credits,
          isPremium: user.is_premium,
          freeToday: 0,
          name: user.name,
          canGenerate: user.is_premium || user.credits > 0,
        });
      }

      // ── 생성 소비 (RPC — atomic) ──
      case 'consumeGeneration': {
        const sceneCount = Math.max(1, Math.min(10, Math.floor(Number(params.sceneCount) || 4)));

        // Rate Limiting: 1분당 최대 5회
        const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recentCount } = await supabase
          .from('toss_generations')
          .select('id', { count: 'exact', head: true })
          .eq('user_key', userKey)
          .gte('created_at', oneMinAgo);
        if ((recentCount ?? 0) >= 5) {
          return res.status(429).json({ error: '너무 빠르게 생성하고 있어요. 1분 후 다시 시도해주세요.' });
        }

        const { data, error } = await supabase.rpc('consume_generation', {
          p_user_key: userKey,
          p_scene_count: sceneCount,
        });

        if (error) throw error;
        if (!data) return res.status(500).json({ error: 'RPC returned no data' });
        return res.json(data);
      }

      // ── IAP 구매 (RPC — atomic) ──
      case 'grantPurchase': {
        const { orderId, sku } = params;
        if (!orderId || !sku) return res.status(400).json({ error: 'orderId and sku required' });

        const creditsToGrant = SKU_CREDITS[sku];
        if (!creditsToGrant) return res.status(400).json({ error: `Unknown sku: ${sku}` });

        const { data, error } = await supabase.rpc('grant_purchase', {
          p_user_key: userKey,
          p_order_id: orderId,
          p_sku: sku,
          p_credits_to_grant: creditsToGrant,
        });

        if (error) throw error;
        if (!data) return res.status(500).json({ error: 'RPC returned no data' });
        return res.json(data);
      }

      // ── 생성 실패 환불 (RPC — atomic) ──
      case 'refundGeneration': {
        const sceneCount = Math.max(1, Math.min(10, Math.floor(Number(params.sceneCount) || 4)));

        const { data, error } = await supabase.rpc('refund_generation', {
          p_user_key: userKey,
          p_scene_count: sceneCount,
        });

        if (error) throw error;
        if (!data) return res.status(500).json({ error: 'RPC returned no data' });
        if (!data.ok) return res.status(400).json({ error: data.error });
        return res.json(data);
      }

      // ── 공유 보너스 (RPC — atomic) ──
      case 'grantShareReward': {
        const { data, error } = await supabase.rpc('grant_share_reward', {
          p_user_key: userKey,
        });

        if (error) throw error;
        if (!data) return res.status(500).json({ error: 'RPC returned no data' });
        if (!data.ok) return res.status(400).json({ error: data.error });
        return res.json(data);
      }

      // ── 크레딧 내역 조회 ──
      case 'getHistory': {
        const { data: generations } = await supabase
          .from('toss_generations')
          .select('cost_type, scene_count, credits_used, created_at')
          .eq('user_key', userKey)
          .order('created_at', { ascending: false })
          .limit(20);

        const { data: purchases } = await supabase
          .from('toss_purchases')
          .select('sku, credits_granted, created_at')
          .eq('user_key', userKey)
          .order('created_at', { ascending: false })
          .limit(20);

        const history = [
          ...(generations || []).map((g: any) => ({
            type: g.cost_type as string,
            amount: g.cost_type === 'refund' || g.cost_type === 'share_reward'
              ? Math.abs(g.credits_used ?? 0)
              : -(g.credits_used != null ? g.credits_used : (g.scene_count ?? 0)),
            desc: g.cost_type === 'credit' ? `동화 생성 (${g.scene_count}컷)`
              : g.cost_type === 'refund' ? `생성 실패 환불 (${g.scene_count}컷)`
              : g.cost_type === 'share_reward' ? '공유 보너스'
              : g.cost_type === 'premium' ? `프리미엄 생성 (${g.scene_count}컷)`
              : `생성 (${g.scene_count}컷)`,
            date: g.created_at,
          })),
          ...(purchases || []).map((p: any) => ({
            type: 'purchase',
            amount: p.credits_granted,
            desc: `${SKU_CREDITS[p.sku] ? p.sku.replace('cuts_', '') + '컷 팩' : p.sku} 구매`,
            date: p.created_at,
          })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30);

        return res.json({ history });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-user]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
