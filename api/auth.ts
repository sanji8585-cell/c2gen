import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// ── Upstash Redis 클라이언트 ──

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  return new Redis({ url, token });
}

// ── 비밀번호 해싱 (PBKDF2, Node.js 내장) ──

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

// ── 타입 ──

interface UserData {
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

interface SessionData {
  email: string;
  name: string;
}

// ── 세션 TTL ──
const SESSION_TTL = 7 * 24 * 60 * 60; // 7일 (초)
const ADMIN_SESSION_TTL = 4 * 60 * 60; // 4시간 (초)

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    const redis = getRedis();

    switch (action) {
      // ── 회원가입 ──
      case 'register': {
        const { name, email, password } = params;
        if (!name || !email || !password) {
          return res.status(400).json({ success: false, message: '모든 필드를 입력해주세요.' });
        }
        if (password.length < 4) {
          return res.status(400).json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 이미 가입된 이메일 확인
        const existing = await redis.get<UserData>(`user:${normalizedEmail}`);
        if (existing) {
          if (existing.status === 'rejected') {
            return res.status(400).json({ success: false, message: '가입이 거부된 이메일입니다. 관리자에게 문의하세요.' });
          }
          return res.status(400).json({ success: false, message: '이미 가입된 이메일입니다.' });
        }

        // 유저 생성 (대기 상태)
        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);
        const userData: UserData = {
          email: normalizedEmail,
          name: name.trim(),
          passwordHash,
          salt,
          status: 'pending',
          createdAt: Date.now(),
        };

        await redis.set(`user:${normalizedEmail}`, JSON.stringify(userData));

        // 전체 유저 목록에 추가 (관리자 조회용)
        await redis.sadd('users:all', normalizedEmail);

        return res.json({ success: true, message: '회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
      }

      // ── 로그인 ──
      case 'login': {
        const { email, password } = params;
        if (!email || !password) {
          return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userData = await redis.get<UserData>(`user:${normalizedEmail}`);

        if (!userData) {
          return res.status(401).json({ success: false, message: '등록되지 않은 이메일입니다.' });
        }

        // KV에서 가져온 데이터가 문자열이면 파싱
        const user: UserData = typeof userData === 'string' ? JSON.parse(userData) : userData;

        if (!verifyPassword(password, user.passwordHash, user.salt)) {
          return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
        }

        if (user.status === 'pending') {
          return res.status(403).json({ success: false, message: '관리자 승인 대기 중입니다. 잠시 후 다시 시도해주세요.' });
        }

        if (user.status === 'rejected') {
          return res.status(403).json({ success: false, message: '가입이 거부되었습니다. 관리자에게 문의하세요.' });
        }

        // 세션 생성
        const token = crypto.randomUUID();
        const sessionData: SessionData = { email: normalizedEmail, name: user.name };
        await redis.set(`session:${token}`, JSON.stringify(sessionData), { ex: SESSION_TTL });

        return res.json({ success: true, token, name: user.name });
      }

      // ── 토큰 검증 ──
      case 'validate': {
        const { token } = params;
        if (!token) return res.json({ valid: false });

        const sessionData = await redis.get<SessionData>(`session:${token}`);
        if (!sessionData) return res.json({ valid: false });

        const session: SessionData = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
        return res.json({ valid: true, name: session.name, email: session.email });
      }

      // ── 로그아웃 ──
      case 'logout': {
        const { token } = params;
        if (token) await redis.del(`session:${token}`);
        return res.json({ success: true });
      }

      // ── 관리자 로그인 ──
      case 'adminLogin': {
        const { password } = params;
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) return res.status(500).json({ success: false, message: '관리자 비밀번호가 설정되지 않았습니다.' });

        if (password !== adminPassword) {
          return res.status(401).json({ success: false, message: '관리자 비밀번호가 올바르지 않습니다.' });
        }

        const adminToken = `admin_${crypto.randomUUID()}`;
        await redis.set(`session:${adminToken}`, JSON.stringify({ email: 'admin', name: '관리자' }), { ex: ADMIN_SESSION_TTL });

        return res.json({ success: true, token: adminToken });
      }

      // ── 유저 목록 (관리자용) ──
      case 'listUsers': {
        const { adminToken } = params;
        const adminSession = await redis.get<SessionData>(`session:${adminToken}`);
        if (!adminSession) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const admin: SessionData = typeof adminSession === 'string' ? JSON.parse(adminSession) : adminSession;
        if (admin.email !== 'admin') return res.status(401).json({ error: '관리자 권한이 없습니다.' });

        const emails = await redis.smembers('users:all');
        const users: Array<{ email: string; name: string; status: string; createdAt: number }> = [];

        for (const email of emails) {
          const userData = await redis.get<UserData>(`user:${email}`);
          if (userData) {
            const user: UserData = typeof userData === 'string' ? JSON.parse(userData) : userData;
            users.push({ email: user.email, name: user.name, status: user.status, createdAt: user.createdAt });
          }
        }

        // 최신순 정렬
        users.sort((a, b) => b.createdAt - a.createdAt);
        return res.json({ users });
      }

      // ── 유저 승인 ──
      case 'approveUser': {
        const { adminToken, email } = params;
        const adminSession = await redis.get<SessionData>(`session:${adminToken}`);
        if (!adminSession) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const admin: SessionData = typeof adminSession === 'string' ? JSON.parse(adminSession) : adminSession;
        if (admin.email !== 'admin') return res.status(401).json({ error: '관리자 권한이 없습니다.' });

        const userData = await redis.get<UserData>(`user:${email}`);
        if (!userData) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        const user: UserData = typeof userData === 'string' ? JSON.parse(userData) : userData;
        user.status = 'approved';
        await redis.set(`user:${email}`, JSON.stringify(user));

        return res.json({ success: true, message: `${user.name} 님을 승인했습니다.` });
      }

      // ── 유저 거부 ──
      case 'rejectUser': {
        const { adminToken, email } = params;
        const adminSession = await redis.get<SessionData>(`session:${adminToken}`);
        if (!adminSession) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const admin: SessionData = typeof adminSession === 'string' ? JSON.parse(adminSession) : adminSession;
        if (admin.email !== 'admin') return res.status(401).json({ error: '관리자 권한이 없습니다.' });

        const userData = await redis.get<UserData>(`user:${email}`);
        if (!userData) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        const user: UserData = typeof userData === 'string' ? JSON.parse(userData) : userData;
        user.status = 'rejected';
        await redis.set(`user:${email}`, JSON.stringify(user));

        return res.json({ success: true, message: `${user.name} 님을 거부했습니다.` });
      }

      // ── 유저 삭제 ──
      case 'deleteUser': {
        const { adminToken, email } = params;
        const adminSession = await redis.get<SessionData>(`session:${adminToken}`);
        if (!adminSession) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const admin: SessionData = typeof adminSession === 'string' ? JSON.parse(adminSession) : adminSession;
        if (admin.email !== 'admin') return res.status(401).json({ error: '관리자 권한이 없습니다.' });

        await redis.del(`user:${email}`);
        await redis.srem('users:all', email);

        return res.json({ success: true, message: '유저를 삭제했습니다.' });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/auth] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
