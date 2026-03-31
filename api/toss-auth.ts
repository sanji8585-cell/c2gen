import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import https from 'https';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// 토스 API 베이스
const TOSS_API_HOST = 'apps-in-toss-api.toss.im';

// ── 세션 토큰 생성 ──
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── mTLS 인증서로 토스 API 호출 ──
function tossApiRequest(
  path: string,
  options: { method?: string; body?: object; headers?: Record<string, string> },
): Promise<any> {
  // Vercel 환경변수에서 줄바꿈 복원 (리터럴 \n, 이스케이프된 \\n 모두 처리)
  const rawCert = process.env.TOSS_MTLS_CERT || '';
  const rawKey = process.env.TOSS_MTLS_KEY || '';
  const cert = rawCert.replace(/\\n/g, '\n').replace(/\\r/g, '');
  const key = rawKey.replace(/\\n/g, '\n').replace(/\\r/g, '');

  return new Promise((resolve, reject) => {
    const data = options.body ? JSON.stringify(options.body) : '';
    const method = options.method || 'POST';

    const reqOptions: https.RequestOptions = {
      hostname: TOSS_API_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'Content-Length': Buffer.byteLength(data).toString() } : {}),
        ...options.headers,
      },
      ...(cert && key ? { cert, key } : {}),
      rejectUnauthorized: true,
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Toss API ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        }
      });
    });

    req.on('error', (err) => reject(new Error(`mTLS request failed: ${err.message}`)));
    if (data && method === 'POST') req.write(data);
    req.end();
  });
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
  // CORS (OPTIONS 포함 — BUG-9 fix)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      // ── 로그인 (토큰 교환 + 유저 생성) ──
      case 'login': {
        const { code, referrer } = params;
        if (!code) return res.status(400).json({ error: 'code required' });

        let userKey: string;
        let userName: string | undefined;

        const isDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX === 'true';
        if (isDev && (referrer === 'SANDBOX' || code === 'dev-test-code')) {
          // 샌드박스/개발용: 가상 유저 (프로덕션에서는 비활성)
          userKey = `dev_${Date.now()}`;
          userName = '테스트 유저';
        } else {
          // 프로덕션: mTLS 인증서로 토스 API 호출
          const hasMtls = !!(process.env.TOSS_MTLS_CERT && process.env.TOSS_MTLS_KEY);
          if (!hasMtls) {
            console.warn('[toss-auth] mTLS 인증서 미설정! 프로덕션 로그인 불가');
          }

          // 1. 토큰 교환
          const tokenData = await tossApiRequest(
            '/api-partner/v1/apps-in-toss/user/oauth2/generate-token',
            { method: 'POST', body: { authorizationCode: code, referrer } },
          );

          if (!tokenData?.accessToken) {
            return res.status(401).json({ error: 'Token exchange failed', detail: tokenData });
          }

          // 2. 사용자 정보 조회
          const meData = await tossApiRequest(
            '/api-partner/v1/apps-in-toss/user/oauth2/login-me',
            { method: 'GET', headers: { Authorization: `Bearer ${tokenData.accessToken}` } },
          );

          if (!meData?.userKey) {
            return res.status(401).json({ error: 'User info fetch failed', detail: meData });
          }

          userKey = meData.userKey;
          // 개인정보는 AES-256-GCM으로 암호화되어 옴 (복호화 키 필요)
        }

        // 3. DB에 유저 upsert
        const { data: existingUser } = await supabase
          .from('toss_users')
          .select('user_key, credits, is_premium')
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
          .select('credits, is_premium, name')
          .eq('user_key', userKey)
          .single();

        return res.json({
          userKey,
          sessionToken,
          name: user?.name || userName,
          credits: user?.credits ?? 4,
          isPremium: user?.is_premium ?? false,
          freeToday: 0,
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
