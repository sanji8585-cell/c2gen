import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── 크레딧 매핑 (sku → 생성 횟수) ──
const SKU_CREDITS: Record<string, number> = {
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

// ── 무료 횟수 리셋 체크 ──
async function checkFreeReset(userKey: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('toss_users')
    .select('free_reset_date')
    .eq('user_key', userKey)
    .single();

  if (data && data.free_reset_date !== today) {
    await supabase.from('toss_users')
      .update({ free_today: 8, free_reset_date: today })
      .eq('user_key', userKey);
  }
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
        await checkFreeReset(userKey);

        const { data: user } = await supabase
          .from('toss_users')
          .select('credits, is_premium, free_today, name')
          .eq('user_key', userKey)
          .single();

        if (!user) return res.status(404).json({ error: 'User not found' });

        return res.json({
          credits: user.credits,
          isPremium: user.is_premium,
          freeToday: user.free_today,
          name: user.name,
          canGenerate: user.is_premium || user.free_today > 0 || user.credits > 0,
        });
      }

      // ── 생성 소비 (컷당 과금: sceneCount만큼 차감) ──
      case 'consumeGeneration': {
        const sceneCount = params.sceneCount || 4;
        await checkFreeReset(userKey);

        const { data: user } = await supabase
          .from('toss_users')
          .select('credits, is_premium, free_today')
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
            freeToday: user.free_today,
            canGenerate: true,
          });
        }

        // 무료 컷 남음? (free_today = 남은 무료 컷 수)
        if (user.free_today >= sceneCount) {
          await supabase.from('toss_users')
            .update({ free_today: user.free_today - sceneCount })
            .eq('user_key', userKey);

          await supabase.from('toss_generations').insert({
            user_key: userKey,
            cost_type: 'free',
            scene_count: sceneCount,
            created_at: new Date().toISOString(),
          });

          return res.json({
            credits: user.credits,
            isPremium: false,
            freeToday: user.free_today - sceneCount,
            canGenerate: true,
          });
        }

        // 무료 + 크레딧 혼합 사용
        const freeUsed = user.free_today; // 남은 무료 전부 사용
        const creditNeeded = sceneCount - freeUsed;

        if (creditNeeded > 0 && user.credits >= creditNeeded) {
          await supabase.from('toss_users')
            .update({ free_today: 0, credits: user.credits - creditNeeded })
            .eq('user_key', userKey);

          await supabase.from('toss_generations').insert({
            user_key: userKey,
            cost_type: freeUsed > 0 ? 'mixed' : 'credit',
            scene_count: sceneCount,
            free_used: freeUsed,
            credits_used: creditNeeded,
            created_at: new Date().toISOString(),
          });

          return res.json({
            credits: user.credits - creditNeeded,
            isPremium: false,
            freeToday: 0,
            canGenerate: true,
          });
        }

        // 부족 — 총 가용 컷 수 알려주기
        const totalAvailable = user.free_today + user.credits;
        return res.json({
          credits: user.credits,
          isPremium: false,
          freeToday: user.free_today,
          canGenerate: false,
          available: totalAvailable,
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

      // ── 광고 시청 보상 (무료 생성 1회) ──
      case 'grantAdReward': {
        await checkFreeReset(userKey);

        const { data: user } = await supabase
          .from('toss_users')
          .select('free_today')
          .eq('user_key', userKey)
          .single();

        // 광고 1회 시청 → 4컷 보상 (하루 최대 20컷: 무료 8컷 + 광고 3회×4컷 = 최대 20컷)
        const currentFree = user?.free_today ?? 0;
        if (currentFree >= 20) {
          return res.status(400).json({ error: '오늘 광고 보상은 최대 3회까지예요' });
        }

        await supabase.from('toss_users')
          .update({ free_today: currentFree + 4 })
          .eq('user_key', userKey);

        const { data: updated } = await supabase
          .from('toss_users')
          .select('credits, is_premium, free_today')
          .eq('user_key', userKey)
          .single();

        return res.json({
          credits: updated?.credits ?? 0,
          isPremium: updated?.is_premium ?? false,
          freeToday: updated?.free_today ?? 0,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-user]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
