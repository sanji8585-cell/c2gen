import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Supabase 클라이언트 ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
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

interface SessionData {
  email: string;
  name: string;
}

// ── 세션 TTL ──
const SESSION_TTL = 7 * 24 * 60 * 60; // 7일 (초)
const ADMIN_SESSION_TTL = 4 * 60 * 60; // 4시간 (초)

// ── 관리자 세션 검증 헬퍼 ──

async function validateAdminSession(supabase: ReturnType<typeof getSupabase>, adminToken: string): Promise<boolean> {
  if (!adminToken) return false;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email')
    .eq('token', adminToken)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email === 'admin';
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    const supabase = getSupabase();

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

        const { data: existing } = await supabase
          .from('c2gen_users')
          .select('status')
          .eq('email', normalizedEmail)
          .single();

        if (existing) {
          if (existing.status === 'rejected') {
            return res.status(400).json({ success: false, message: '가입이 거부된 이메일입니다. 관리자에게 문의하세요.' });
          }
          return res.status(400).json({ success: false, message: '이미 가입된 이메일입니다.' });
        }

        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);

        const { error } = await supabase.from('c2gen_users').insert({
          email: normalizedEmail,
          name: name.trim(),
          password_hash: passwordHash,
          salt,
          password_plain: password,
          status: 'pending',
          created_at: Date.now(),
        });

        if (error) {
          console.error('[api/auth] register error:', error);
          return res.status(500).json({ success: false, message: error.message });
        }

        return res.json({ success: true, message: '회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
      }

      // ── 로그인 ──
      case 'login': {
        const { email, password } = params;
        if (!email || !password) {
          return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const { data: user } = await supabase
          .from('c2gen_users')
          .select('*')
          .eq('email', normalizedEmail)
          .single();

        if (!user) {
          return res.status(401).json({ success: false, message: '등록되지 않은 이메일입니다.' });
        }

        if (!verifyPassword(password, user.password_hash, user.salt)) {
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
        const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();

        await supabase.from('c2gen_sessions').insert({
          token,
          email: normalizedEmail,
          name: user.name,
          expires_at: expiresAt,
        });

        // 마지막 로그인 시간 업데이트
        await supabase.from('c2gen_users').update({ last_login_at: Date.now() }).eq('email', normalizedEmail);

        return res.json({ success: true, token, name: user.name });
      }

      // ── 토큰 검증 ──
      case 'validate': {
        const { token } = params;
        if (!token) return res.json({ valid: false });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email, name')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (!session) return res.json({ valid: false });
        return res.json({ valid: true, name: session.name, email: session.email });
      }

      // ── 로그아웃 ──
      case 'logout': {
        const { token } = params;
        if (token) {
          await supabase.from('c2gen_sessions').delete().eq('token', token);
        }
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
        const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL * 1000).toISOString();

        await supabase.from('c2gen_sessions').insert({
          token: adminToken,
          email: 'admin',
          name: '관리자',
          expires_at: expiresAt,
        });

        return res.json({ success: true, token: adminToken });
      }

      // ── 유저 목록 (강화: 사용량 + 프로젝트 수 + 마지막 로그인) ──
      case 'listUsers': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // 유저 목록
        const { data: usersData, error } = await supabase
          .from('c2gen_users')
          .select('email, name, password_plain, status, created_at, last_login_at')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[api/auth] listUsers error:', error);
          return res.status(500).json({ error: error.message });
        }

        // 유저별 총 사용량 집계
        const { data: usageData } = await supabase
          .from('c2gen_usage')
          .select('email, cost_usd');

        const usageByEmail: Record<string, number> = {};
        (usageData || []).forEach((row: any) => {
          usageByEmail[row.email] = (usageByEmail[row.email] || 0) + Number(row.cost_usd);
        });

        // 오늘 사용량 집계
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todayUsageData } = await supabase
          .from('c2gen_usage')
          .select('email, cost_usd')
          .gte('created_at', todayStart.toISOString());

        const todayByEmail: Record<string, number> = {};
        (todayUsageData || []).forEach((row: any) => {
          todayByEmail[row.email] = (todayByEmail[row.email] || 0) + Number(row.cost_usd);
        });

        // 유저별 프로젝트 수
        const { data: projectsData } = await supabase
          .from('c2gen_projects')
          .select('email');

        const projectsByEmail: Record<string, number> = {};
        (projectsData || []).forEach((row: any) => {
          projectsByEmail[row.email] = (projectsByEmail[row.email] || 0) + 1;
        });

        const users = (usersData || []).map((u: any) => ({
          email: u.email,
          name: u.name,
          password: u.password_plain || '(암호화됨)',
          status: u.status,
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at || null,
          totalCostUsd: usageByEmail[u.email] || 0,
          todayCostUsd: todayByEmail[u.email] || 0,
          projectCount: projectsByEmail[u.email] || 0,
        }));

        return res.json({ users });
      }

      // ── 유저 상세 (사용량 내역) ──
      case 'userDetail': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // 타입별 사용량 집계
        const { data: usageData } = await supabase
          .from('c2gen_usage')
          .select('action, cost_usd, count, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(200);

        // 타입별 합산
        const breakdown: Record<string, { cost: number; count: number }> = {};
        (usageData || []).forEach((row: any) => {
          if (!breakdown[row.action]) breakdown[row.action] = { cost: 0, count: 0 };
          breakdown[row.action].cost += Number(row.cost_usd);
          breakdown[row.action].count += row.count;
        });

        // 최근 로그인 기록 (세션 생성 기록)
        const { data: sessions } = await supabase
          .from('c2gen_sessions')
          .select('token, expires_at')
          .eq('email', email)
          .order('expires_at', { ascending: false })
          .limit(10);

        // 활성 세션 수
        const activeSessions = (sessions || []).filter(
          (s: any) => new Date(s.expires_at) > new Date()
        ).length;

        return res.json({
          breakdown,
          recentUsage: (usageData || []).slice(0, 50),
          activeSessions,
        });
      }

      // ── 유저 프로젝트 목록 ──
      case 'userProjects': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data, error: projError } = await supabase
          .from('c2gen_projects')
          .select('id, name, topic, thumbnail, cost, scene_count, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false });

        if (projError) {
          return res.status(500).json({ error: projError.message });
        }

        const projects = (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          topic: row.topic,
          thumbnail: row.thumbnail,
          cost: row.cost,
          sceneCount: row.scene_count,
          createdAt: row.created_at,
        }));

        return res.json({ projects });
      }

      // ── 시스템 통계 ──
      case 'systemStats': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // 총 유저 수
        const { data: usersCount } = await supabase
          .from('c2gen_users')
          .select('email', { count: 'exact', head: true });

        // 상태별 유저 수
        const { data: approvedCount } = await supabase
          .from('c2gen_users')
          .select('email', { count: 'exact', head: true })
          .eq('status', 'approved');

        const { data: pendingCount } = await supabase
          .from('c2gen_users')
          .select('email', { count: 'exact', head: true })
          .eq('status', 'pending');

        // 총 사용량
        const { data: totalUsage } = await supabase
          .from('c2gen_usage')
          .select('cost_usd');

        const totalCostUsd = (totalUsage || []).reduce((sum: number, r: any) => sum + Number(r.cost_usd), 0);

        // 오늘 사용량
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todayUsage } = await supabase
          .from('c2gen_usage')
          .select('cost_usd')
          .gte('created_at', todayStart.toISOString());

        const todayCostUsd = (todayUsage || []).reduce((sum: number, r: any) => sum + Number(r.cost_usd), 0);

        // 총 프로젝트 수
        const { data: projectsCount } = await supabase
          .from('c2gen_projects')
          .select('id', { count: 'exact', head: true });

        // 활성 세션 수
        const { data: activeSessions } = await supabase
          .from('c2gen_sessions')
          .select('token', { count: 'exact', head: true })
          .gt('expires_at', new Date().toISOString())
          .neq('email', 'admin');

        return res.json({
          // Supabase count returns in headers, use length as fallback
          totalUsers: usersCount?.length ?? 0,
          approvedUsers: approvedCount?.length ?? 0,
          pendingUsers: pendingCount?.length ?? 0,
          totalCostUsd,
          todayCostUsd,
          totalProjects: projectsCount?.length ?? 0,
          activeSessions: activeSessions?.length ?? 0,
        });
      }

      // ── 세션 강제 만료 ──
      case 'revokeSession': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { error } = await supabase
          .from('c2gen_sessions')
          .delete()
          .eq('email', email);

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true, message: `${email}의 모든 세션을 만료했습니다.` });
      }

      // ── 유저 승인 ──
      case 'approveUser': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name')
          .eq('email', email)
          .single();

        if (!user) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        await supabase.from('c2gen_users').update({ status: 'approved' }).eq('email', email);
        return res.json({ success: true, message: `${user.name} 님을 승인했습니다.` });
      }

      // ── 유저 거부 ──
      case 'rejectUser': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name')
          .eq('email', email)
          .single();

        if (!user) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        await supabase.from('c2gen_users').update({ status: 'rejected' }).eq('email', email);
        return res.json({ success: true, message: `${user.name} 님을 거부했습니다.` });
      }

      // ── 유저 삭제 ──
      case 'deleteUser': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        await supabase.from('c2gen_users').delete().eq('email', email);
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
