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
  // 하위 호환 (기존 SKU)
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
  // CORS (OPTIONS 먼저 — CRIT-5 fix)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

      // ── 생성 소비 (컷당 과금) ──
      case 'consumeGeneration': {
        const sceneCount = Math.max(1, Math.min(10, Math.floor(Number(params.sceneCount) || 4)));

        // Rate Limiting: 1분당 최대 5회 생성
        const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recentCount } = await supabase
          .from('toss_generations')
          .select('id', { count: 'exact', head: true })
          .eq('user_key', userKey)
          .gte('created_at', oneMinAgo);
        if ((recentCount ?? 0) >= 5) {
          return res.status(429).json({ error: '너무 빠르게 생성하고 있어요. 1분 후 다시 시도해주세요.' });
        }

        const { data: user } = await supabase
          .from('toss_users')
          .select('credits, is_premium')
          .eq('user_key', userKey)
          .single();

        if (!user) return res.status(404).json({ error: 'User not found' });

        // 프리미엄 → 무제한
        if (user.is_premium) {
          await supabase.from('toss_generations').insert({
            user_key: userKey,
            cost_type: 'premium',
            scene_count: sceneCount,
            created_at: new Date().toISOString(),
          });

          return res.json({
            credits: user.credits,
            isPremium: true,
            freeToday: 0,
            canGenerate: true,
          });
        }

        // 크레딧 차감
        if (user.credits >= sceneCount) {
          const newCredits = user.credits - sceneCount;
          await supabase.from('toss_users')
            .update({ credits: newCredits })
            .eq('user_key', userKey);

          await supabase.from('toss_generations').insert({
            user_key: userKey,
            cost_type: 'credit',
            scene_count: sceneCount,
            credits_used: sceneCount,
            created_at: new Date().toISOString(),
          });

          return res.json({
            credits: newCredits,
            isPremium: false,
            freeToday: 0,
            canGenerate: true,
          });
        }

        // 부족
        return res.json({
          credits: user.credits,
          isPremium: false,
          freeToday: 0,
          canGenerate: false,
          available: user.credits,
          needed: sceneCount,
        });
      }

      // ── IAP 구매 후 크레딧 부여 ──
      case 'grantPurchase': {
        const { orderId, sku } = params;
        if (!orderId || !sku) return res.status(400).json({ error: 'orderId and sku required' });

        const creditsToGrant = SKU_CREDITS[sku];
        if (!creditsToGrant) return res.status(400).json({ error: `Unknown sku: ${sku}` });

        // 중복 지급 방지
        const { data: existing } = await supabase
          .from('toss_purchases')
          .select('id')
          .eq('order_id', orderId)
          .single();

        if (existing) {
          return res.json({ ok: true, message: 'Already granted' });
        }

        // 크레딧 추가
        const { data: user } = await supabase
          .from('toss_users')
          .select('credits')
          .eq('user_key', userKey)
          .single();

        const newCredits = (user?.credits ?? 0) + creditsToGrant;
        await supabase.from('toss_users')
          .update({ credits: newCredits })
          .eq('user_key', userKey);

        // 구매 이력 기록
        await supabase.from('toss_purchases').insert({
          user_key: userKey,
          order_id: orderId,
          sku,
          credits_granted: creditsToGrant,
          created_at: new Date().toISOString(),
        });

        return res.json({ ok: true, credits: newCredits });
      }

      // ── 생성 실패 환불 (최근 미환불 건에 한해) ──
      case 'refundGeneration': {
        const sceneCount = Math.max(1, Math.min(10, Math.floor(Number(params.sceneCount) || 4)));

        // 최근 5분 내 미환불된 생성 건이 있는지 확인 (파밍 방지)
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: recentGen } = await supabase
          .from('toss_generations')
          .select('id')
          .eq('user_key', userKey)
          .eq('cost_type', 'credit')
          .eq('scene_count', sceneCount)
          .gte('created_at', fiveMinAgo)
          .limit(1)
          .single();

        // 이미 환불된 건이 있는지 확인
        const { data: recentRefund } = await supabase
          .from('toss_generations')
          .select('id')
          .eq('user_key', userKey)
          .eq('cost_type', 'refund')
          .eq('scene_count', sceneCount)
          .gte('created_at', fiveMinAgo)
          .limit(1)
          .single();

        if (!recentGen || recentRefund) {
          return res.status(400).json({ error: '환불 가능한 생성 내역이 없어요' });
        }

        const { data: user } = await supabase
          .from('toss_users')
          .select('credits')
          .eq('user_key', userKey)
          .single();

        if (!user) return res.status(404).json({ error: 'User not found' });

        const newCredits = user.credits + sceneCount;
        await supabase.from('toss_users')
          .update({ credits: newCredits })
          .eq('user_key', userKey);

        await supabase.from('toss_generations').insert({
          user_key: userKey,
          cost_type: 'refund',
          scene_count: sceneCount,
          credits_used: -sceneCount,
          created_at: new Date().toISOString(),
        });

        return res.json({ credits: newCredits, refunded: sceneCount });
      }

      // ── 공유 보너스 (+2컷) ──
      case 'grantShareReward': {
        // 하루 1회 제한
        const today = new Date().toISOString().split('T')[0];
        const { data: todayShare } = await supabase
          .from('toss_generations')
          .select('id')
          .eq('user_key', userKey)
          .eq('cost_type', 'share_reward')
          .gte('created_at', `${today}T00:00:00`)
          .limit(1)
          .single();

        if (todayShare) {
          return res.status(400).json({ error: '오늘 이미 공유 보너스를 받았어요' });
        }

        const { data: user } = await supabase
          .from('toss_users')
          .select('credits')
          .eq('user_key', userKey)
          .single();

        if (!user) return res.status(404).json({ error: 'User not found' });

        const bonus = 2;
        const newCredits = user.credits + bonus;
        await supabase.from('toss_users')
          .update({ credits: newCredits })
          .eq('user_key', userKey);

        await supabase.from('toss_generations').insert({
          user_key: userKey,
          cost_type: 'share_reward',
          scene_count: 0,
          credits_used: -bonus,
          created_at: new Date().toISOString(),
        });

        return res.json({ credits: newCredits, granted: bonus });
      }

      // ── 크레딧 내역 조회 ──
      case 'getHistory': {
        // 생성/환불/공유보너스 내역
        const { data: generations } = await supabase
          .from('toss_generations')
          .select('cost_type, scene_count, credits_used, created_at')
          .eq('user_key', userKey)
          .order('created_at', { ascending: false })
          .limit(20);

        // 구매 내역
        const { data: purchases } = await supabase
          .from('toss_purchases')
          .select('sku, credits_granted, created_at')
          .eq('user_key', userKey)
          .order('created_at', { ascending: false })
          .limit(20);

        // 통합 정렬
        const history = [
          ...(generations || []).map((g: any) => ({
            type: g.cost_type as string,
            amount: g.cost_type === 'refund' || g.cost_type === 'share_reward'
              ? Math.abs(g.credits_used || 0)
              : -(g.credits_used || g.scene_count || 0),
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
