import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * 토스 로그인 연결 끊기 콜백
 *
 * 호출 시점:
 * - UNLINK: 토스 앱 설정에서 사용자가 직접 연결 끊기
 * - WITHDRAWAL_TERMS: 토스 앱에서 로그인 서비스 약관 동의 해제
 * - WITHDRAWAL_TOSS: 토스 계정 자체 삭제
 *
 * 페이로드:
 * - GET:  /api/toss-disconnect?userKey=...&referrer=UNLINK
 * - POST: { userKey, referrer }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Basic Auth 검증 (앱인토스 콘솔에 등록한 자격증명)
  // 토스 콘솔의 "Basic Auth 헤더" 필드 동작이 문서상 모호해서 여러 형식을 모두 허용:
  //   1) Authorization: Basic <base64(user:pass)>           ← 표준
  //   2) Authorization: <user:pass>                         ← 콘솔이 raw passthrough
  //   3) Authorization: Basic <base64(user:pass)>           ← 콘솔이 base64 인코딩
  //   4) Authorization: <base64(user:pass)>                 ← 콘솔이 base64만 인코딩
  const expectedUser = process.env.TOSS_DISCONNECT_USER;
  const expectedPass = process.env.TOSS_DISCONNECT_PASS;
  if (expectedUser && expectedPass) {
    const auth = req.headers.authorization || '';
    const userPass = `${expectedUser}:${expectedPass}`;
    const userPassB64 = Buffer.from(userPass).toString('base64');
    const candidates = [
      `Basic ${userPassB64}`,
      `basic ${userPassB64}`,
      userPassB64,
      userPass,
      `Basic ${userPass}`,
    ];
    // Authorization 헤더 자체가 콘솔 입력값을 base64한 케이스도 검사
    // (콘솔이 입력 문자열 전체를 base64한 뒤 전송)
    let decoded = '';
    try {
      const stripped = auth.startsWith('Basic ') ? auth.slice(6) : auth.startsWith('basic ') ? auth.slice(6) : auth;
      decoded = Buffer.from(stripped, 'base64').toString('utf-8');
    } catch { /* ignore */ }

    const ok =
      candidates.includes(auth) ||
      decoded === userPass ||
      decoded === `Basic ${userPassB64}`;

    if (!ok) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // userKey 추출 (GET / POST 모두 지원)
  const userKey =
    (req.query.userKey as string) ||
    (req.body && (req.body as any).userKey) ||
    null;
  const referrer =
    (req.query.referrer as string) ||
    (req.body && (req.body as any).referrer) ||
    'UNKNOWN';

  if (!userKey) {
    return res.status(400).json({ error: 'userKey required' });
  }

  try {
    const userKeyStr = String(userKey);

    // 1. 모든 세션 삭제
    await supabase
      .from('toss_sessions')
      .delete()
      .eq('user_key', userKeyStr);

    // 2. 유저 데이터 삭제 (외래키 cascade로 generations, purchases도 삭제됨)
    await supabase
      .from('toss_users')
      .delete()
      .eq('user_key', userKeyStr);

    console.log(`[toss-disconnect] User deleted: ${userKeyStr} (${referrer})`);

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[toss-disconnect]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
