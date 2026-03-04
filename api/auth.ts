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

      // ── 사용량 시계열 (관리자) ──
      case 'usageTimeSeries': {
        const { adminToken, startDate, endDate } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        let query = supabase
          .from('c2gen_usage')
          .select('action, cost_usd, count, created_at, email')
          .order('created_at', { ascending: true });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data: tsData, error: tsError } = await query;
        if (tsError) return res.status(500).json({ error: tsError.message });

        const dailyMap: Record<string, Record<string, { cost: number; count: number }>> = {};
        const userMap: Record<string, { cost: number; count: number }> = {};

        (tsData || []).forEach((row: any) => {
          const date = new Date(row.created_at).toISOString().split('T')[0];
          if (!dailyMap[date]) dailyMap[date] = {};
          if (!dailyMap[date][row.action]) dailyMap[date][row.action] = { cost: 0, count: 0 };
          dailyMap[date][row.action].cost += Number(row.cost_usd);
          dailyMap[date][row.action].count += row.count;

          if (!userMap[row.email]) userMap[row.email] = { cost: 0, count: 0 };
          userMap[row.email].cost += Number(row.cost_usd);
          userMap[row.email].count += row.count;
        });

        const timeSeries = Object.entries(dailyMap).map(([date, actions]) => ({
          date,
          actions,
          totalCost: Object.values(actions).reduce((s, a) => s + a.cost, 0),
          totalCount: Object.values(actions).reduce((s, a) => s + a.count, 0),
        }));

        const userRanking = Object.entries(userMap)
          .map(([email, d]) => ({ email, ...d }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 20);

        return res.json({ timeSeries, userRanking });
      }

      // ── 전체 활성 세션 (관리자) ──
      case 'allSessions': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: sessData, error: sessError } = await supabase
          .from('c2gen_sessions')
          .select('token, email, name, expires_at')
          .gt('expires_at', new Date().toISOString())
          .neq('email', 'admin')
          .order('expires_at', { ascending: false });

        if (sessError) return res.status(500).json({ error: sessError.message });
        return res.json({ sessions: sessData || [] });
      }

      // ── 만료 세션 일괄 정리 (관리자) ──
      case 'bulkRevokeSessions': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: expired } = await supabase
          .from('c2gen_sessions')
          .select('token')
          .lt('expires_at', new Date().toISOString());

        const expiredCount = expired?.length || 0;
        if (expiredCount > 0) {
          await supabase.from('c2gen_sessions').delete().lt('expires_at', new Date().toISOString());
        }

        return res.json({ success: true, message: `만료된 세션 ${expiredCount}개를 정리했습니다.` });
      }

      // ── 특정 세션 강제 만료 (관리자) ──
      case 'revokeSessionByToken': {
        const { adminToken, sessionToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        await supabase.from('c2gen_sessions').delete().eq('token', sessionToken);
        return res.json({ success: true, message: '세션이 만료되었습니다.' });
      }

      // ── 전체 프로젝트 검색 (관리자) ──
      case 'searchProjects': {
        const { adminToken, query: searchQuery, email: searchEmail } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        let q = supabase
          .from('c2gen_projects')
          .select('id, name, topic, thumbnail, cost, scene_count, created_at, email')
          .order('created_at', { ascending: false })
          .limit(100);

        if (searchEmail) q = q.eq('email', searchEmail);
        if (searchQuery) q = q.or(`name.ilike.%${searchQuery}%,topic.ilike.%${searchQuery}%`);

        const { data: searchData, error: searchError } = await q;
        if (searchError) return res.status(500).json({ error: searchError.message });

        const projects = (searchData || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          topic: row.topic,
          thumbnail: row.thumbnail,
          cost: row.cost,
          sceneCount: row.scene_count,
          createdAt: row.created_at,
          email: row.email,
        }));

        return res.json({ projects });
      }

      // ── 공지사항 목록 (관리자) ──
      case 'listAnnouncements': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: annData, error: annError } = await supabase
          .from('c2gen_announcements')
          .select('*')
          .order('created_at', { ascending: false });

        if (annError) {
          if (annError.message?.includes('does not exist') || annError.code === '42P01') {
            return res.json({ announcements: [], tableNotFound: true });
          }
          return res.status(500).json({ error: annError.message });
        }
        return res.json({ announcements: annData || [] });
      }

      // ── 활성 공지사항 (공개 - 로그인 페이지용) ──
      case 'getActiveAnnouncements': {
        const { data: activeAnn } = await supabase
          .from('c2gen_announcements')
          .select('id, title, content, type, created_at')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(5);

        return res.json({ announcements: activeAnn || [] });
      }

      // ── 공지사항 등록 (관리자) ──
      case 'createAnnouncement': {
        const { adminToken, title, content: annContent, type: annType = 'info', active = true } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        if (!title || !annContent) {
          return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
        }

        const { error: createErr } = await supabase.from('c2gen_announcements').insert({
          title, content: annContent, type: annType, active,
          created_at: new Date().toISOString(),
        });

        if (createErr) {
          if (createErr.message?.includes('does not exist') || createErr.code === '42P01') {
            return res.status(500).json({
              error: 'c2gen_announcements 테이블이 없습니다. Supabase SQL Editor에서 테이블을 생성해주세요.',
              sql: `CREATE TABLE c2gen_announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  type text DEFAULT 'info',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);`,
            });
          }
          return res.status(500).json({ error: createErr.message });
        }
        return res.json({ success: true, message: '공지사항이 등록되었습니다.' });
      }

      // ── 공지사항 삭제 (관리자) ──
      case 'deleteAnnouncement': {
        const { adminToken, id: annId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        await supabase.from('c2gen_announcements').delete().eq('id', annId);
        return res.json({ success: true, message: '공지사항이 삭제되었습니다.' });
      }

      // ── 공지사항 활성/비활성 토글 (관리자) ──
      case 'toggleAnnouncement': {
        const { adminToken, id: toggleId, active: isActive } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        await supabase.from('c2gen_announcements').update({ active: isActive }).eq('id', toggleId);
        return res.json({ success: true });
      }

      // ── 에러 로그 조회 (관리자) ──
      case 'getErrorLogs': {
        const { adminToken, service, startDate: logStart, endDate: logEnd, limit: logLimit = 100 } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        let logQuery = supabase
          .from('c2gen_error_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(logLimit);

        if (service) logQuery = logQuery.eq('service', service);
        if (logStart) logQuery = logQuery.gte('created_at', logStart);
        if (logEnd) logQuery = logQuery.lte('created_at', logEnd);

        const { data: logData, error: logError } = await logQuery;
        if (logError) {
          if (logError.message?.includes('does not exist') || logError.code === '42P01') {
            return res.json({ logs: [], tableNotFound: true });
          }
          return res.status(500).json({ error: logError.message });
        }
        return res.json({ logs: logData || [] });
      }

      // ── API 키 상태 확인 (관리자) ──
      case 'apiKeyStatus': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const keyStatus: Record<string, any> = {};

        // ElevenLabs
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const elevenKey2 = process.env.ELEVENLABS_API_KEY_2;
        keyStatus.elevenlabs = { configured: !!elevenKey, keyCount: [elevenKey, elevenKey2].filter(Boolean).length };
        if (elevenKey) {
          try {
            const subResp = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
              headers: { 'xi-api-key': elevenKey },
            });
            if (subResp.ok) {
              const sub = await subResp.json();
              keyStatus.elevenlabs.subscription = {
                tier: sub.tier,
                characterCount: sub.character_count,
                characterLimit: sub.character_limit,
                remaining: sub.character_limit - sub.character_count,
              };
            }
          } catch {}
        }

        // Gemini
        const gKey = process.env.GEMINI_API_KEY;
        const gKey2 = process.env.GEMINI_API_KEY_2;
        keyStatus.gemini = { configured: !!gKey, keyCount: [gKey, gKey2].filter(Boolean).length };

        // fal.ai
        const fKey = process.env.FAL_API_KEY;
        keyStatus.fal = { configured: !!fKey, keyCount: fKey ? 1 : 0 };

        return res.json({ status: keyStatus, checkedAt: new Date().toISOString() });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/auth] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
