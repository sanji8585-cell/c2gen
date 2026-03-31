import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// 토스 API 베이스 URL
const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

// ── 세션 토큰 생성 ──
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── 세션 검증 ──
async function validateSession(req: VercelRequest): Promise<string | null> {
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

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');

  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      // ── 로그인 (토큰 교환 + 유저 생성) ──
      case 'login': {
        const { code, referrer } = params;
        if (!code) return res.status(400).json({ error: 'code required' });

        // 1. 토스 API로 토큰 교환
        // 참고: 프로덕션에서는 mTLS 인증서가 필요함
        // 개발 중에는 sandbox 환경 사용
        let userKey: string;
        let userName: string | undefined;

        if (referrer === 'SANDBOX' || code === 'dev-test-code') {
          // 샌드박스/개발용: 가상 유저
          userKey = `dev_${Date.now()}`;
          userName = '테스트 유저';
        } else {
          // 프로덕션: 토스 API 호출
          const tokenRes = await fetch(
            `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ authorizationCode: code, referrer }),
            }
          );

          if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return res.status(401).json({ error: `Token exchange failed: ${err}` });
          }

          const tokenData = await tokenRes.json();

          // 2. 사용자 정보 조회
          const meRes = await fetch(
            `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${tokenData.accessToken}` },
            }
          );

          if (!meRes.ok) {
            return res.status(401).json({ error: 'User info fetch failed' });
          }

          const meData = await meRes.json();
          userKey = meData.userKey;
          // 개인정보는 AES-256-GCM으로 암호화되어 옴 (복호화 키 필요)
          // 여기서는 userKey만 사용
        }

        // 3. DB에 유저 upsert
        const { data: existingUser } = await supabase
          .from('toss_users')
          .select('user_key, credits, is_premium, free_today, free_reset_date')
          .eq('user_key', userKey)
          .single();

        const today = new Date().toISOString().split('T')[0];

        if (!existingUser) {
          // 신규 유저: 가입 보너스 4컷
          await supabase.from('toss_users').insert({
            user_key: userKey,
            name: userName,
            credits: 4,
            is_premium: false,
            free_today: 0,
            free_reset_date: today,
            created_at: new Date().toISOString(),
          });
        }
        // 일일 무료 리셋 삭제 — 크레딧 전용 과금

        // 4. 세션 생성
        const sessionToken = generateSessionToken();
        await supabase.from('toss_sessions').insert({
          token: sessionToken,
          user_key: userKey,
          created_at: new Date().toISOString(),
        });

        // 최신 유저 정보 조회
        const { data: user } = await supabase
          .from('toss_users')
          .select('credits, is_premium, free_today, name')
          .eq('user_key', userKey)
          .single();

        return res.json({
          userKey,
          sessionToken,
          name: user?.name || userName,
          credits: user?.credits ?? 0,
          isPremium: user?.is_premium ?? false,
          freeToday: user?.free_today ?? 2,
        });
      }

      // ── 로그아웃 ──
      case 'logout': {
        const token = req.headers['x-session-token'] as string;
        if (token) {
          await supabase.from('toss_sessions').delete().eq('token', token);
        }
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-auth]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
