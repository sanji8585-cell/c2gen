/**
 * 앱인토스 미니앱 CORS 유틸
 * 실서비스 / QR테스트 / 로컬개발 origin 허용
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://toss-shorts-maker.apps.tossmini.com',        // 실서비스
  'https://toss-shorts-maker.private-apps.tossmini.com', // QR 테스트
];

function getAllowedOrigin(req: VercelRequest): string | null {
  const origin = req.headers.origin as string | undefined;
  if (!origin) return null;

  // 정확 매칭
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // 로컬 개발 환경
  if (origin.startsWith('http://localhost:')) return origin;

  return null;
}

/** CORS 헤더 설정. OPTIONS 프리플라이트이면 true 반환 (즉시 응답 완료) */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const allowed = getAllowedOrigin(req);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
