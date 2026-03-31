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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
        const sceneCount = params.sceneCount || 4;

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

      // ── 생성 실패 환불 ──
      case 'refundGeneration': {
        const sceneCount = params.sceneCount || 4;

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

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-user]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
