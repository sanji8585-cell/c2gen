/**
 * 앱인토스 미니앱 CORS 유틸
 * QR 테스트 중에는 모든 origin 허용, 출시 후 제한
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** CORS 헤더 설정. OPTIONS 프리플라이트이면 true 반환 */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
