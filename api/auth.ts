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
        const { name, email, password, termsAgreedAt, marketingAgreed } = params;
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
          terms_agreed_at: termsAgreedAt || null,
          marketing_agreed: marketingAgreed || false,
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

      // ── OAuth 설정 조회 (프론트엔드용 공개 키만) ──
      case 'getOAuthConfig': {
        return res.json({
          googleClientId: process.env.GOOGLE_CLIENT_ID || null,
          kakaoJsKey: process.env.KAKAO_JS_KEY || null,
        });
      }

      // ── 소셜 로그인 (Google / Kakao) ──
      case 'oauthLogin': {
        const { provider, token: oauthToken } = params;
        if (!provider || !oauthToken) {
          return res.status(400).json({ success: false, message: '인증 정보가 필요합니다.' });
        }

        let oauthId: string;
        let oauthEmail: string;
        let oauthName: string;

        if (provider === 'google') {
          // Google ID 토큰 검증
          const googleResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${oauthToken}`);
          if (!googleResp.ok) {
            return res.status(401).json({ success: false, message: 'Google 인증에 실패했습니다.' });
          }
          const googleData = await googleResp.json();
          // aud (client_id) 검증
          const googleClientId = process.env.GOOGLE_CLIENT_ID;
          if (googleClientId && googleData.aud !== googleClientId) {
            return res.status(401).json({ success: false, message: 'Google 클라이언트 ID가 일치하지 않습니다.' });
          }
          oauthId = googleData.sub;
          oauthEmail = googleData.email?.toLowerCase().trim();
          oauthName = googleData.name || googleData.email?.split('@')[0] || 'Google User';
        } else if (provider === 'kakao') {
          // Kakao 액세스 토큰으로 사용자 정보 조회
          const kakaoResp = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { 'Authorization': `Bearer ${oauthToken}` },
          });
          if (!kakaoResp.ok) {
            return res.status(401).json({ success: false, message: 'Kakao 인증에 실패했습니다.' });
          }
          const kakaoData = await kakaoResp.json();
          oauthId = String(kakaoData.id);
          oauthEmail = (kakaoData.kakao_account?.email || `kakao_${kakaoData.id}@kakao.com`).toLowerCase().trim();
          oauthName = kakaoData.kakao_account?.profile?.nickname || kakaoData.properties?.nickname || 'Kakao User';
        } else {
          return res.status(400).json({ success: false, message: `지원하지 않는 소셜 로그인: ${provider}` });
        }

        // 기존 사용자 조회 (oauth_provider + oauth_id)
        let { data: user } = await supabase
          .from('c2gen_users')
          .select('*')
          .eq('oauth_provider', provider)
          .eq('oauth_id', oauthId)
          .single();

        // OAuth로 없으면 이메일로도 확인 (기존 이메일 계정과 연결 방지)
        if (!user) {
          const { data: emailUser } = await supabase
            .from('c2gen_users')
            .select('*')
            .eq('email', oauthEmail)
            .single();

          if (emailUser) {
            // 기존 이메일 계정이 있으면 OAuth 정보 연결
            if (!emailUser.oauth_provider) {
              await supabase.from('c2gen_users')
                .update({ oauth_provider: provider, oauth_id: oauthId })
                .eq('email', oauthEmail);
              user = { ...emailUser, oauth_provider: provider, oauth_id: oauthId };
            } else {
              return res.status(400).json({
                success: false,
                message: `이미 ${emailUser.oauth_provider}로 가입된 이메일입니다.`,
              });
            }
          }
        }

        if (!user) {
          // 신규 사용자 생성 (pending 상태)
          const { error: insertErr } = await supabase.from('c2gen_users').insert({
            email: oauthEmail,
            name: oauthName,
            oauth_provider: provider,
            oauth_id: oauthId,
            password_hash: '',
            salt: '',
            status: 'pending',
            created_at: Date.now(),
          });

          if (insertErr) {
            return res.status(500).json({ success: false, message: '계정 생성에 실패했습니다.' });
          }

          return res.json({
            success: false,
            pending: true,
            message: '회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
          });
        }

        // 상태 확인
        if (user.status === 'pending') {
          return res.status(403).json({
            success: false,
            pending: true,
            message: '관리자 승인 대기 중입니다. 잠시 후 다시 시도해주세요.',
          });
        }
        if (user.status === 'rejected') {
          return res.status(403).json({ success: false, message: '가입이 거부되었습니다.' });
        }

        // 세션 생성
        const oauthSessionToken = crypto.randomUUID();
        const oauthExpiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();

        await supabase.from('c2gen_sessions').insert({
          token: oauthSessionToken,
          email: user.email,
          name: user.name,
          expires_at: oauthExpiresAt,
        });

        await supabase.from('c2gen_users').update({ last_login_at: Date.now() }).eq('email', user.email);

        return res.json({ success: true, token: oauthSessionToken, name: user.name });
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

        // 크레딧 + 게이미피케이션 데이터 함께 반환
        const { data: userInfo } = await supabase
          .from('c2gen_users')
          .select('credits, plan, xp, level, total_generations, streak_count, streak_last_date, gacha_count')
          .eq('email', session.email)
          .single();

        return res.json({
          valid: true,
          name: session.name,
          email: session.email,
          credits: userInfo?.credits ?? 0,
          plan: userInfo?.plan ?? 'free',
          xp: userInfo?.xp ?? 0,
          level: userInfo?.level ?? 1,
          totalGenerations: userInfo?.total_generations ?? 0,
          streakCount: userInfo?.streak_count ?? 0,
          streakLastDate: userInfo?.streak_last_date ?? null,
          gachaCount: userInfo?.gacha_count ?? 0,
        });
      }

      // ── 로그아웃 ──
      case 'logout': {
        const { token } = params;
        if (token) {
          await supabase.from('c2gen_sessions').delete().eq('token', token);
        }
        return res.json({ success: true });
      }

      // ── 게이미피케이션 업데이트 ──
      case 'updateGamification': {
        const { token, xp: newXp, totalGenerations, streakCount, streakLastDate, gachaCount } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        // 레벨 서버 재계산 (무결성)
        const THRESHOLDS = [0, 50, 120, 200, 350, 500, 750, 1000, 1500, 2500];
        let computedLevel = 1;
        for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
          if ((newXp || 0) >= THRESHOLDS[i]) { computedLevel = i + 1; break; }
        }

        const { error } = await supabase
          .from('c2gen_users')
          .update({
            xp: newXp || 0,
            level: computedLevel,
            total_generations: totalGenerations || 0,
            streak_count: streakCount || 0,
            streak_last_date: streakLastDate || null,
            gacha_count: gachaCount || 0,
          })
          .eq('email', session.email);

        if (error) {
          console.error('[api/auth] updateGamification error:', error);
          return res.status(500).json({ error: error.message });
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
          .select('email, name, password_plain, status, created_at, last_login_at, oauth_provider, plan, credits, xp, level, total_generations, streak_count')
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
          oauthProvider: u.oauth_provider || null,
          plan: u.plan || 'free',
          credits: u.credits || 0,
          xp: u.xp || 0,
          level: u.level || 1,
          totalGenerations: u.total_generations || 0,
          streakCount: u.streak_count || 0,
        }));

        return res.json({ users });
      }

      // ── 운영자 지정/해제 ──
      case 'setOperator': {
        const { adminToken, email, isOperator } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name, plan')
          .eq('email', email)
          .single();
        if (!user) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        const newPlan = isOperator ? 'operator' : 'free';
        await supabase.from('c2gen_users').update({ plan: newPlan }).eq('email', email);

        return res.json({
          success: true,
          message: isOperator
            ? `${user.name} 님을 운영자로 지정했습니다.`
            : `${user.name} 님의 운영자 권한을 해제했습니다.`,
        });
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

        // 게임 프로필
        const { data: userRow } = await supabase
          .from('c2gen_users')
          .select('xp, level, streak_count, max_combo, gacha_tickets, total_gacha_pulls, total_generations, total_images, total_audio, total_videos, login_days, prestige_level')
          .eq('email', email)
          .single();

        const gameProfile = userRow ? {
          xp: userRow.xp || 0,
          level: userRow.level || 0,
          streakCount: userRow.streak_count || 0,
          maxCombo: userRow.max_combo || 0,
          gachaTickets: userRow.gacha_tickets || 0,
          totalPulls: userRow.total_gacha_pulls || 0,
          totalGenerations: userRow.total_generations || 0,
          totalImages: userRow.total_images || 0,
          totalAudio: userRow.total_audio || 0,
          totalVideos: userRow.total_videos || 0,
          loginDays: userRow.login_days || 0,
          prestigeLevel: userRow.prestige_level || 0,
        } : null;

        // 장착 정보
        let equipped = { title: null, titleEmoji: null, badges: [] as string[], frame: null };
        try {
          const { data: eq } = await supabase.from('c2gen_user_equipped').select('*').eq('email', email).single();
          if (eq) {
            equipped = {
              title: eq.equipped_title || null,
              titleEmoji: eq.equipped_title_emoji || null,
              badges: (eq.equipped_badges || []),
              frame: eq.equipped_frame || null,
            };
          }
        } catch {}

        // 업적 요약
        let achievementSummary = { unlocked: 0, total: 0 };
        try {
          const { data: achUnlocked } = await supabase.from('c2gen_user_achievements').select('id').eq('email', email).eq('unlocked', true);
          const { data: achTotal } = await supabase.from('c2gen_achievements').select('id');
          achievementSummary = { unlocked: achUnlocked?.length ?? 0, total: achTotal?.length ?? 0 };
        } catch {}

        return res.json({
          breakdown,
          recentUsage: (usageData || []).slice(0, 50),
          activeSessions,
          gameProfile,
          equipped,
          achievementSummary,
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

        // 게이미피케이션 집계
        const { data: gameAgg } = await supabase
          .from('c2gen_users')
          .select('level, streak_count, total_gacha_pulls')
          .eq('status', 'approved');

        const approvedList = gameAgg || [];
        const avgLevel = approvedList.length > 0
          ? approvedList.reduce((s: number, u: any) => s + (u.level || 0), 0) / approvedList.length
          : 0;
        const activeStreaks = approvedList.filter((u: any) => (u.streak_count || 0) >= 2).length;
        const totalGachaPulls = approvedList.reduce((s: number, u: any) => s + (u.total_gacha_pulls || 0), 0);

        let activeEventsCount = 0;
        try {
          const now = new Date().toISOString();
          const { data: evts } = await supabase
            .from('c2gen_events')
            .select('id')
            .eq('is_active', true)
            .lte('start_at', now)
            .gte('end_at', now);
          activeEventsCount = evts?.length ?? 0;
        } catch {}

        return res.json({
          // Supabase count returns in headers, use length as fallback
          totalUsers: usersCount?.length ?? 0,
          approvedUsers: approvedCount?.length ?? 0,
          pendingUsers: pendingCount?.length ?? 0,
          totalCostUsd,
          todayCostUsd,
          totalProjects: projectsCount?.length ?? 0,
          activeSessions: activeSessions?.length ?? 0,
          avgLevel: Math.round(avgLevel * 10) / 10,
          activeStreaks,
          totalGachaPulls,
          activeEvents: activeEventsCount,
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

        // 가입 보너스 크레딧 지급 (50크레딧)
        try {
          await supabase.rpc('add_credits', {
            p_email: email,
            p_amount: 50,
            p_type: 'bonus',
            p_description: '가입 승인 보너스',
          });
        } catch (e) {
          console.error('[api/auth] 보너스 크레딧 지급 실패:', e);
        }

        return res.json({ success: true, message: `${user.name} 님을 승인했습니다. (50 크레딧 지급)` });
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
        if (params.severity) logQuery = logQuery.eq('severity', params.severity);
        if (params.resolved !== undefined) logQuery = logQuery.eq('resolved', params.resolved);
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

      // ── 에러 해결 마킹 (관리자) ──
      case 'resolveError': {
        const { adminToken, errorId, resolved: isResolved = true } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        await supabase.from('c2gen_error_logs').update({ resolved: isResolved }).eq('id', errorId);
        return res.json({ success: true });
      }

      // ── 에러 통계 (관리자) ──
      case 'getErrorStats': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: recent24h } = await supabase
          .from('c2gen_error_logs')
          .select('service, severity, created_at')
          .gte('created_at', last24h)
          .order('created_at', { ascending: true });

        const { data: recent7d } = await supabase
          .from('c2gen_error_logs')
          .select('service, severity')
          .gte('created_at', last7d);

        const { data: unresolvedCount } = await supabase
          .from('c2gen_error_logs')
          .select('id', { count: 'exact', head: true })
          .eq('resolved', false);

        // 서비스별 24시간 카운트
        const byService: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        const hourly: Record<string, number> = {};

        (recent24h || []).forEach((e: any) => {
          byService[e.service] = (byService[e.service] || 0) + 1;
          bySeverity[e.severity || 'error'] = (bySeverity[e.severity || 'error'] || 0) + 1;
          const hour = new Date(e.created_at).toISOString().slice(0, 13);
          hourly[hour] = (hourly[hour] || 0) + 1;
        });

        // 7일간 서비스별 카운트
        const weeklyByService: Record<string, number> = {};
        (recent7d || []).forEach((e: any) => {
          weeklyByService[e.service] = (weeklyByService[e.service] || 0) + 1;
        });

        return res.json({
          last24h: { total: (recent24h || []).length, byService, bySeverity, hourly },
          last7d: { total: (recent7d || []).length, byService: weeklyByService },
          unresolved: unresolvedCount || 0,
        });
      }

      // ── 클라이언트 에러 로깅 ──
      case 'logClientError': {
        const { message, stack, url: errorUrl, userAgent, componentStack } = params;
        const sessionToken = params.token;
        let email: string | undefined;
        if (sessionToken) {
          const { data: sess } = await supabase.from('c2gen_sessions')
            .select('email').eq('token', sessionToken)
            .gt('expires_at', new Date().toISOString()).single();
          email = sess?.email;
        }

        await supabase.from('c2gen_error_logs').insert({
          service: 'frontend',
          action: 'client_error',
          error_message: (message || 'Unknown client error').slice(0, 2000),
          severity: 'error',
          stack_trace: (stack || componentStack || '').slice(0, 4000),
          email,
          request_context: { url: errorUrl, userAgent },
          created_at: new Date().toISOString(),
        });
        return res.json({ success: true });
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

        // OpenAI
        const oKey = process.env.OPENAI_API_KEY;
        const oKey2 = process.env.OPENAI_API_KEY_2;
        keyStatus.openai = { configured: !!oKey, keyCount: [oKey, oKey2].filter(Boolean).length };

        return res.json({ status: keyStatus, checkedAt: new Date().toISOString() });
      }

      // ══════════════════════════════════════════
      // 크레딧 시스템
      // ══════════════════════════════════════════

      // ── 크레딧 잔액 조회 ──
      case 'getCredits': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('credits, plan')
          .eq('email', session.email)
          .single();

        return res.json({
          credits: user?.credits ?? 0,
          plan: user?.plan ?? 'free',
          email: session.email,
        });
      }

      // ── 크레딧 트랜잭션 내역 ──
      case 'getCreditHistory': {
        const { token, limit = 50, offset = 0 } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: transactions, count } = await supabase
          .from('c2gen_credit_transactions')
          .select('*', { count: 'exact' })
          .eq('email', session.email)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        return res.json({ transactions: transactions || [], total: count || 0 });
      }

      // ── 예상 크레딧 비용 계산 ──
      case 'estimateCost': {
        const { sceneCount, imageModel, avgCharsPerScene = 200, includeVideo = false } = params;
        // 크레딧 비용 계산 (서버 측에서 config와 동일한 로직)
        const imageCosts: Record<string, number> = { 'gemini-2.5-flash-image': 5, 'gpt-image-1': 7 };
        const imgCreditPerScene = imageCosts[imageModel] || 5;
        const ttsCreditPerScene = Math.ceil(avgCharsPerScene / 1000) * 5;
        const videoCreditPerScene = includeVideo ? 22 : 0;

        const totalPerScene = imgCreditPerScene + ttsCreditPerScene + videoCreditPerScene;
        const totalCredits = totalPerScene * (sceneCount || 1);

        return res.json({
          perScene: { image: imgCreditPerScene, tts: ttsCreditPerScene, video: videoCreditPerScene, total: totalPerScene },
          totalCredits,
          sceneCount: sceneCount || 1,
        });
      }

      // ── 관리자: 크레딧 수동 조정 ──
      case 'admin-adjustCredits': {
        const { adminToken, email, amount, description } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        if (!email || typeof amount !== 'number' || amount === 0) {
          return res.status(400).json({ error: 'email과 amount(0이 아닌 정수) 필요' });
        }

        if (amount > 0) {
          const { data } = await supabase.rpc('add_credits', {
            p_email: email,
            p_amount: amount,
            p_type: 'admin',
            p_description: description || `관리자 수동 추가 (${amount})`,
          });
          if (!data?.success) return res.status(400).json({ error: data?.error || 'failed' });
          return res.json({ success: true, balance: data.balance, message: `${amount} 크레딧 추가 완료` });
        } else {
          const { data } = await supabase.rpc('deduct_credits', {
            p_email: email,
            p_amount: Math.abs(amount),
            p_description: description || `관리자 수동 차감 (${amount})`,
          });
          if (!data?.success) return res.status(400).json({ error: data?.error || 'failed', current: data?.current });
          return res.json({ success: true, balance: data.balance, message: `${Math.abs(amount)} 크레딧 차감 완료` });
        }
      }

      // ── 관리자: 크레딧 통계 ──
      case 'admin-creditStats': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // 전체 크레딧 잔액 합계
        const { data: users } = await supabase
          .from('c2gen_users')
          .select('email, credits, plan');

        const totalCredits = (users || []).reduce((sum: number, u: any) => sum + (u.credits || 0), 0);
        const planCounts = { free: 0, basic: 0, pro: 0, operator: 0 };
        (users || []).forEach((u: any) => {
          const p = u.plan || 'free';
          if (p in planCounts) planCounts[p as keyof typeof planCounts]++;
        });

        // 최근 결제 내역
        const { data: recentPayments } = await supabase
          .from('c2gen_payments')
          .select('*')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(20);

        // 오늘 총 매출
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todayPayments } = await supabase
          .from('c2gen_payments')
          .select('amount')
          .eq('status', 'completed')
          .gte('created_at', todayStart.toISOString());

        const todayRevenue = (todayPayments || []).reduce((sum: number, p: any) => sum + p.amount, 0);

        return res.json({
          totalCreditsInCirculation: totalCredits,
          planCounts,
          todayRevenue,
          recentPayments: recentPayments || [],
          userCount: (users || []).length,
        });
      }

      // ── 관리자: 활동 로그 조회 ──
      case 'admin-activityLogs': {
        const { adminToken, email: filterEmail, filterAction, limit = 100, offset = 0 } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        let query = supabase
          .from('c2gen_usage')
          .select('email, action, cost_usd, count, created_at', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (filterEmail) query = query.eq('email', filterEmail);
        if (filterAction) query = query.eq('action', filterAction);
        query = query.range(offset, offset + limit - 1);

        const { data: logs, count, error: logErr } = await query;
        if (logErr) return res.status(500).json({ error: logErr.message });

        return res.json({ logs: logs || [], total: count || 0 });
      }

      // ── 관리자: 유저 크레딧 거래 내역 ──
      case 'admin-creditHistory': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        if (!email) return res.status(400).json({ error: 'email 필요' });

        // 현재 잔액
        const { data: userData } = await supabase
          .from('c2gen_users')
          .select('credits, plan')
          .eq('email', email)
          .single();

        // 거래 내역
        const { data: transactions } = await supabase
          .from('c2gen_credit_transactions')
          .select('*')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(50);

        return res.json({
          credits: userData?.credits || 0,
          plan: userData?.plan || 'free',
          transactions: transactions || [],
        });
      }

      // ── 사용자 프로필 조회 ──
      case 'getProfile': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('email, name, plan, credits, created_at, oauth_provider, avatar_url')
          .eq('email', session.email)
          .single();

        if (!user) return res.status(404).json({ error: 'user not found' });

        return res.json({
          email: user.email,
          name: user.name,
          plan: user.plan || 'free',
          credits: user.credits || 0,
          createdAt: user.created_at,
          oauthProvider: user.oauth_provider || null,
          avatarUrl: user.avatar_url || null,
        });
      }

      // ── 프로필 수정 (닉네임, 아바타) ──
      case 'updateProfile': {
        const { token, name, avatar_url } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const updates: Record<string, any> = {};
        if (name && name.trim().length >= 1 && name.trim().length <= 30) {
          updates.name = name.trim();
        }
        if (avatar_url !== undefined) {
          updates.avatar_url = avatar_url || null;
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: '변경할 내용이 없습니다.' });
        }

        await supabase.from('c2gen_users').update(updates).eq('email', session.email);
        return res.json({ success: true, message: '프로필이 업데이트되었습니다.', ...updates });
      }

      // ── 비밀번호 변경 (이메일 가입자 전용) ──
      case 'changePassword': {
        const { token, currentPassword, newPassword } = params;
        if (!token) return res.status(400).json({ error: 'token required' });
        if (!currentPassword || !newPassword) return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
        if (newPassword.length < 4) return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: user } = await supabase
          .from('c2gen_users')
          .select('password_hash, salt, oauth_provider')
          .eq('email', session.email)
          .single();

        if (!user) return res.status(404).json({ error: 'user not found' });
        if (user.oauth_provider) return res.status(400).json({ error: 'OAuth 계정은 비밀번호를 변경할 수 없습니다.' });

        if (!verifyPassword(currentPassword, user.password_hash, user.salt)) {
          return res.status(400).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
        }

        const newSalt = generateSalt();
        const newHash = hashPassword(newPassword, newSalt);

        await supabase.from('c2gen_users').update({
          password_hash: newHash,
          salt: newSalt,
          password_plain: newPassword,
        }).eq('email', session.email);

        return res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
      }

      // ── DB 마이그레이션: avatar_url 칼럼 추가 ──
      case 'migrate-avatar-column': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // avatar_url 칼럼이 없으면 추가 (이미 있으면 무시)
        const { error } = await supabase.rpc('exec_sql', {
          query: 'ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;'
        }).single();

        if (error) {
          // RPC 함수가 없을 수 있으므로 직접 update로 테스트
          const { error: testError } = await supabase
            .from('c2gen_users')
            .update({ avatar_url: null })
            .eq('email', '__test_nonexistent__');

          if (testError && testError.message.includes('avatar_url')) {
            return res.json({
              success: false,
              message: 'avatar_url 칼럼이 없습니다. Supabase Dashboard → SQL Editor에서 실행해주세요: ALTER TABLE c2gen_users ADD COLUMN avatar_url TEXT DEFAULT NULL;',
            });
          }
          return res.json({ success: true, message: 'avatar_url 칼럼이 이미 존재합니다.' });
        }

        return res.json({ success: true, message: 'avatar_url 칼럼이 추가되었습니다.' });
      }

      // ══════════════════════════════════════════
      // RPG 게이미피케이션 시스템
      // ══════════════════════════════════════════

      // ── 게임 설정 로드 (공개) ──
      case 'game-getConfig': {
        const { data: configRows } = await supabase
          .from('c2gen_game_config')
          .select('key, value');

        if (!configRows || configRows.length === 0) {
          return res.json({ config: null, message: 'No game config found' });
        }

        const configMap: Record<string, any> = {};
        for (const row of configRows) configMap[row.key] = row.value;

        return res.json({
          config: {
            levels: configMap.levels || null,
            xpRates: configMap.xp_rates || null,
            gachaSettings: configMap.gacha_settings || null,
            streakSettings: configMap.streak_settings || null,
            milestoneSettings: configMap.milestone_settings || null,
            prestigeSettings: configMap.prestige_settings || null,
          },
        });
      }

      // ── 게임 설정 수정 (관리자) ──
      case 'game-updateConfig': {
        const { adminToken, key: cfgKey, value: cfgValue } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        if (!cfgKey || cfgValue === undefined) {
          return res.status(400).json({ error: 'key와 value가 필요합니다.' });
        }

        const { error: cfgErr } = await supabase
          .from('c2gen_game_config')
          .upsert({
            key: cfgKey,
            value: cfgValue,
            updated_at: new Date().toISOString(),
            updated_by: 'admin',
          });

        if (cfgErr) return res.status(500).json({ error: cfgErr.message });
        return res.json({ success: true });
      }

      // ── 게임 상태 동기화 (로그인 시) ──
      case 'game-syncState': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const email = session.email;

        // 1) 설정 로드
        const { data: configRows } = await supabase.from('c2gen_game_config').select('key, value');
        const configMap: Record<string, any> = {};
        for (const row of (configRows || [])) configMap[row.key] = row.value;

        const config = {
          levels: configMap.levels || null,
          xpRates: configMap.xp_rates || null,
          gachaSettings: configMap.gacha_settings || null,
          streakSettings: configMap.streak_settings || null,
          milestoneSettings: configMap.milestone_settings || null,
          prestigeSettings: configMap.prestige_settings || null,
        };

        // 2) 유저 데이터
        const { data: usr } = await supabase
          .from('c2gen_users')
          .select('xp, level, total_generations, total_images, total_audio, total_videos, streak_count, streak_last_date, gacha_count, gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, max_combo, prestige_level, prestige_xp_bonus, login_days, sound_enabled')
          .eq('email', email).single();

        const user = {
          xp: usr?.xp ?? 0,
          level: usr?.level ?? 1,
          totalGenerations: usr?.total_generations ?? 0,
          totalImages: usr?.total_images ?? 0,
          totalAudio: usr?.total_audio ?? 0,
          totalVideos: usr?.total_videos ?? 0,
          streakCount: usr?.streak_count ?? 0,
          streakLastDate: usr?.streak_last_date ?? null,
          gachaTickets: usr?.gacha_tickets ?? 0,
          gachaPityEpic: usr?.gacha_pity_epic ?? 0,
          gachaPityLegendary: usr?.gacha_pity_legendary ?? 0,
          totalGachaPulls: usr?.total_gacha_pulls ?? 0,
          maxCombo: usr?.max_combo ?? 0,
          prestigeLevel: usr?.prestige_level ?? 0,
          prestigeXpBonus: usr?.prestige_xp_bonus ?? 0,
          loginDays: usr?.login_days ?? 0,
          soundEnabled: usr?.sound_enabled ?? false,
        };

        // 3) 장착 정보
        const { data: eqData } = await supabase
          .from('c2gen_user_equipped').select('equipped_title, equipped_badges, equipped_frame')
          .eq('email', email).single();

        let equipped = { title: null as any, badges: [] as any[], frame: null as any };
        if (eqData) {
          if (eqData.equipped_title) {
            const { data: ti } = await supabase.from('c2gen_gacha_pool').select('id, name, emoji').eq('id', eqData.equipped_title).single();
            if (ti) equipped.title = ti;
          }
          if (eqData.equipped_frame) {
            const { data: fi } = await supabase.from('c2gen_gacha_pool').select('id, name, emoji').eq('id', eqData.equipped_frame).single();
            if (fi) equipped.frame = fi;
          }
          const badgeIds = eqData.equipped_badges || [];
          if (badgeIds.length > 0) {
            const { data: bi } = await supabase.from('c2gen_gacha_pool').select('id, name, emoji').in('id', badgeIds);
            equipped.badges = bi || [];
          }
        } else {
          // 첫 접속: equipped 행 생성
          await supabase.from('c2gen_user_equipped').upsert({ email, equipped_title: null, equipped_badges: [], equipped_frame: null }, { onConflict: 'email' });
        }

        // 4) 업적
        const { data: achDefs } = await supabase.from('c2gen_achievements').select('*').eq('is_active', true).order('sort_order');
        const { data: achProgress } = await supabase.from('c2gen_user_achievements').select('*').eq('email', email);

        const progressMap: Record<string, any> = {};
        const newlyUnlocked: string[] = [];
        for (const ap of (achProgress || [])) {
          progressMap[ap.achievement_id] = {
            achievementId: ap.achievement_id,
            progress: ap.progress,
            unlocked: ap.unlocked,
            unlockedAt: ap.unlocked_at,
            notified: ap.notified,
          };
          if (ap.unlocked && !ap.notified) newlyUnlocked.push(ap.achievement_id);
        }

        const definitions = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, description: a.description, icon: a.icon,
          category: a.category, conditionType: a.condition_type, conditionTarget: a.condition_target,
          rewardXp: a.reward_xp, rewardCredits: a.reward_credits,
          rewardTitle: a.reward_title, rewardBadge: a.reward_badge,
          rewardGachaTickets: a.reward_gacha_tickets || 0,
          isHidden: a.is_hidden, isActive: a.is_active, sortOrder: a.sort_order,
        }));

        // 5) 오늘 퀘스트
        const todayStr = new Date().toISOString().slice(0, 10);
        let { data: todayQuests } = await supabase
          .from('c2gen_user_quests')
          .select('quest_id, progress, completed, reward_claimed')
          .eq('email', email).eq('assigned_date', todayStr);

        // 퀘스트 미배정 시 자동 배정
        if (!todayQuests || todayQuests.length === 0) {
          const { data: pool } = await supabase.from('c2gen_quest_pool')
            .select('*').eq('is_active', true)
            .lte('min_level', user.level);

          const eligible = (pool || []).filter((q: any) => !q.max_level || q.max_level >= user.level);
          if (eligible.length > 0) {
            // 가중치 기반 랜덤 선택 3개
            const selected: any[] = [];
            const remaining = [...eligible];
            for (let i = 0; i < Math.min(3, remaining.length); i++) {
              const totalWeight = remaining.reduce((s: number, q: any) => s + (q.weight || 10), 0);
              let r = Math.random() * totalWeight;
              let pick = remaining[0];
              for (const q of remaining) {
                r -= (q.weight || 10);
                if (r <= 0) { pick = q; break; }
              }
              selected.push(pick);
              remaining.splice(remaining.indexOf(pick), 1);
            }

            for (const q of selected) {
              await supabase.from('c2gen_user_quests').upsert({
                email, quest_id: q.id, assigned_date: todayStr,
                progress: 0, completed: false, reward_claimed: false,
              }, { onConflict: 'email,quest_id,assigned_date' });
            }

            todayQuests = selected.map((q: any) => ({
              quest_id: q.id, progress: 0, completed: false, reward_claimed: false,
            }));
          }
        }

        // 퀘스트 풀 조회해서 이름 등 매핑
        const questIds = (todayQuests || []).map((q: any) => q.quest_id);
        const { data: questDefs } = questIds.length > 0
          ? await supabase.from('c2gen_quest_pool').select('*').in('id', questIds)
          : { data: [] };
        const questDefMap: Record<string, any> = {};
        for (const qd of (questDefs || [])) questDefMap[qd.id] = qd;

        const quests = (todayQuests || []).map((q: any) => {
          const def = questDefMap[q.quest_id];
          return {
            questId: q.quest_id,
            name: def?.name || q.quest_id,
            description: def?.description || '',
            icon: def?.icon || '📋',
            questType: def?.quest_type || 'generate_content',
            target: def?.target || 1,
            progress: q.progress,
            completed: q.completed,
            rewardClaimed: q.reward_claimed,
            rewardXp: def?.reward_xp || 10,
            rewardCredits: def?.reward_credits || 5,
          };
        });

        // 6) 활성 이벤트
        const now = new Date().toISOString();
        const { data: events } = await supabase.from('c2gen_events').select('*')
          .eq('is_active', true).lte('start_at', now).gte('end_at', now);

        const activeEvents = (events || []).map((e: any) => ({
          id: e.id, name: e.name, description: e.description, icon: e.icon,
          startAt: e.start_at, endAt: e.end_at,
          xpMultiplier: e.xp_multiplier, dropRateMultiplier: e.drop_rate_multiplier,
          specialGachaItems: e.special_gacha_items || [], isActive: e.is_active,
        }));

        // 7) 인벤토리
        const { data: invData } = await supabase
          .from('c2gen_user_inventory')
          .select('id, item_id, quantity, obtained_via, is_equipped, is_active, active_until')
          .eq('email', email);

        const itemIds = [...new Set((invData || []).map((i: any) => i.item_id))];
        const { data: itemDefs } = itemIds.length > 0
          ? await supabase.from('c2gen_gacha_pool').select('*').in('id', itemIds)
          : { data: [] };
        const itemDefMap: Record<string, any> = {};
        for (const id of (itemDefs || [])) itemDefMap[id.id] = id;

        const inventory = { titles: [] as any[], badges: [] as any[], frames: [] as any[], consumables: [] as any[] };
        for (const inv of (invData || [])) {
          const def = itemDefMap[inv.item_id];
          if (!def) continue;
          const item = {
            inventoryId: inv.id, itemId: inv.item_id,
            name: def.name, emoji: def.emoji, itemType: def.item_type,
            rarity: def.rarity, quantity: inv.quantity,
            isEquipped: inv.is_equipped, isActive: inv.is_active,
            activeUntil: inv.active_until, obtainedVia: inv.obtained_via,
            effectValue: def.effect_value,
          };
          if (def.item_type === 'title') inventory.titles.push(item);
          else if (def.item_type === 'badge') inventory.badges.push(item);
          else if (def.item_type === 'avatar_frame') inventory.frames.push(item);
          else inventory.consumables.push(item);
        }

        return res.json({
          config, user, equipped,
          achievements: { definitions, progress: progressMap, newlyUnlocked },
          quests, activeEvents, inventory,
        });
      }

      // ── 액션 기록 (서버 사이드 XP 계산) ──
      case 'game-recordAction': {
        const { token, actionType, count: actionCount = 1, metadata = {} } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const email = session.email;

        // 설정 로드
        const { data: cfgRows } = await supabase.from('c2gen_game_config').select('key, value');
        const cfg: Record<string, any> = {};
        for (const r of (cfgRows || [])) cfg[r.key] = r.value;

        const xpRates = cfg.xp_rates || { script: 10, image_per: 5, audio_per: 3, video_per: 8, daily_bonus: 5, streak_multiplier: 0.1, combo_multiplier: 0.05, max_combo_multiplier: 2.0 };
        const levelsConfig = cfg.levels || { thresholds: [0,50,120,200,350,500,750,1000,1500,2500] };
        const gachaSettings = cfg.gacha_settings || { pull_interval: 5, pity: { epic_guarantee: 30, legendary_guarantee: 100 } };
        const milestoneSettings = cfg.milestone_settings || { generation_milestones: [] };
        const streakSettings = cfg.streak_settings || { milestones: [], milestone_rewards: [] };

        // 유저 현재 데이터 (컬럼이 없으면 폴백)
        let usr: Record<string, any> | null = null;
        {
          const { data: d1, error: e1 } = await supabase.from('c2gen_users')
            .select('xp, level, total_generations, total_images, total_audio, total_videos, streak_count, streak_last_date, gacha_count, gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, max_combo, prestige_level, prestige_xp_bonus, credits')
            .eq('email', email).single();
          if (d1) {
            usr = d1;
          } else {
            // 컬럼 누락 시 최소 컬럼으로 폴백
            const { data: d2 } = await supabase.from('c2gen_users')
              .select('xp, level, total_generations, streak_count, streak_last_date, gacha_count, credits')
              .eq('email', email).single();
            if (d2) usr = d2;
          }
        }
        if (!usr) return res.status(404).json({ error: 'user not found' });

        const { imageCount = 0, audioCount = 0, videoCount = 0, sessionCombo = 0 } = metadata;

        // 1) 기본 XP 계산
        let baseXp = 0;
        if (actionType === 'generation_complete') {
          baseXp = xpRates.script + (imageCount * xpRates.image_per) + (audioCount * xpRates.audio_per) + (videoCount * xpRates.video_per);
        } else if (actionType === 'image_created') {
          baseXp = actionCount * xpRates.image_per;
        } else if (actionType === 'audio_created') {
          baseXp = actionCount * xpRates.audio_per;
        } else if (actionType === 'video_created') {
          baseXp = actionCount * xpRates.video_per;
        }

        // 2) 스트릭 업데이트 + 배율
        const today = new Date().toISOString().slice(0, 10);
        let newStreak = usr.streak_count || 0;
        let streakBonus = 0;
        let streakMilestoneReward = null;
        if (usr.streak_last_date !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          if (usr.streak_last_date === yesterday) {
            newStreak = (usr.streak_count || 0) + 1;
          } else if (!usr.streak_last_date) {
            newStreak = 1;
          } else {
            newStreak = 1;
          }
          // 스트릭 마일스톤 체크
          const sm = streakSettings.milestones || [];
          const smr = streakSettings.milestone_rewards || [];
          for (let i = 0; i < sm.length; i++) {
            if (newStreak === sm[i] && smr[i]) {
              streakMilestoneReward = smr[i];
              baseXp += smr[i].xp || 0;
              break;
            }
          }
        }

        const streakMultiplier = 1 + (xpRates.streak_multiplier || 0.1) * Math.min(newStreak, 30);
        const comboMultiplier = 1 + (xpRates.combo_multiplier || 0.05) * Math.min(sessionCombo, xpRates.max_combo_multiplier / (xpRates.combo_multiplier || 0.05));
        const prestigeMultiplier = 1 + (usr.prestige_xp_bonus || 0);

        // 이벤트 배율
        const nowISO = new Date().toISOString();
        const { data: activeEvts } = await supabase.from('c2gen_events').select('xp_multiplier')
          .eq('is_active', true).lte('start_at', nowISO).gte('end_at', nowISO);
        let eventMultiplier = 1;
        for (const e of (activeEvts || [])) eventMultiplier *= (e.xp_multiplier || 1);

        // XP 부스터 체크
        const { data: activeBoosters } = await supabase.from('c2gen_user_inventory')
          .select('id, item_id').eq('email', email).eq('is_active', true)
          .gt('active_until', nowISO);
        let boosterMultiplier = 1;
        if (activeBoosters && activeBoosters.length > 0) {
          const boosterItemIds = activeBoosters.map((b: any) => b.item_id);
          const { data: boosterDefs } = await supabase.from('c2gen_gacha_pool').select('effect_value').in('id', boosterItemIds);
          for (const bd of (boosterDefs || [])) {
            if (bd.effect_value?.xp_multiplier) boosterMultiplier *= bd.effect_value.xp_multiplier;
          }
        }

        const xpGained = Math.round(baseXp * streakMultiplier * comboMultiplier * prestigeMultiplier * eventMultiplier * boosterMultiplier);
        const newXp = (usr.xp || 0) + xpGained;

        // 3) 레벨 계산
        const thresholds = levelsConfig.thresholds || [0];
        const oldLevel = usr.level || 1;
        let newLevel = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) {
          if (newXp >= thresholds[i]) { newLevel = i + 1; break; }
        }
        const leveledUp = newLevel > oldLevel;

        // 레벨업 보상
        let levelReward = null;
        let rewardCredits = 0;
        let rewardTickets = 0;
        if (leveledUp && levelsConfig.rewards && levelsConfig.rewards[newLevel - 1]) {
          levelReward = levelsConfig.rewards[newLevel - 1];
          rewardCredits = levelReward.credits || 0;
          rewardTickets = levelReward.gacha_tickets || 0;
        }

        // 4) 통계 업데이트
        const newTotalGen = (usr.total_generations || 0) + (actionType === 'generation_complete' ? 1 : 0);
        const newTotalImages = (usr.total_images || 0) + imageCount;
        const newTotalAudio = (usr.total_audio || 0) + audioCount;
        const newTotalVideos = (usr.total_videos || 0) + videoCount;
        const newMaxCombo = Math.max(usr.max_combo || 0, sessionCombo);
        const newGachaCount = (usr.gacha_count || 0) + (actionType === 'generation_complete' ? 1 : 0);

        // 5) 마일스톤 체크
        let milestoneReached = null;
        const milestones = milestoneSettings.generation_milestones || [];
        for (const m of milestones) {
          if (newTotalGen === m.count) {
            milestoneReached = m;
            break;
          }
        }

        // 6) 뽑기 자격 체크
        let gachaResult = null;
        let newPityEpic = usr.gacha_pity_epic || 0;
        let newPityLegendary = usr.gacha_pity_legendary || 0;
        let newGachaPulls = usr.total_gacha_pulls || 0;
        let newGachaTickets = (usr.gacha_tickets || 0) + rewardTickets;

        const pullInterval = gachaSettings.pull_interval || 5;
        if (actionType === 'generation_complete' && newGachaCount % pullInterval === 0) {
          // 자동 뽑기
          newPityEpic++;
          newPityLegendary++;
          newGachaPulls++;

          // 등급 결정
          const rarities = gachaSettings.rarities || {};
          let targetRarity = 'common';
          const epicGuarantee = gachaSettings.pity?.epic_guarantee || 30;
          const legendaryGuarantee = gachaSettings.pity?.legendary_guarantee || 100;

          if (newPityLegendary >= legendaryGuarantee) {
            targetRarity = 'legendary';
            newPityLegendary = 0;
            newPityEpic = 0;
          } else if (newPityEpic >= epicGuarantee) {
            targetRarity = 'epic';
            newPityEpic = 0;
          } else {
            const roll = Math.random();
            let cumulative = 0;
            for (const [rarity, info] of Object.entries(rarities)) {
              cumulative += (info as any).rate || 0;
              if (roll < cumulative) { targetRarity = rarity; break; }
            }
          }

          // 해당 등급 아이템 랜덤 선택
          const { data: poolItems } = await supabase.from('c2gen_gacha_pool')
            .select('*').eq('rarity', targetRarity).eq('is_active', true);

          if (poolItems && poolItems.length > 0) {
            const picked = poolItems[Math.floor(Math.random() * poolItems.length)];

            // 인벤토리에 추가/수량 증가 (중복 행 대비 .single() 미사용)
            const { data: existingRows1 } = await supabase.from('c2gen_user_inventory')
              .select('id, quantity').eq('email', email).eq('item_id', picked.id).order('quantity', { ascending: false }).limit(1);
            const existing = existingRows1?.[0] ?? null;

            let isNew = false;
            if (existing) {
              await supabase.from('c2gen_user_inventory')
                .update({ quantity: existing.quantity + 1, obtained_at: new Date().toISOString() })
                .eq('id', existing.id);
            } else {
              isNew = true;
              await supabase.from('c2gen_user_inventory').insert({
                email, item_id: picked.id, quantity: 1,
                obtained_via: 'gacha', obtained_at: new Date().toISOString(),
                is_active: false, is_equipped: false,
              });
            }

            // 소모품 자동 처리 (credit_voucher)
            if (picked.item_type === 'credit_voucher' && picked.effect_value?.credits) {
              rewardCredits += picked.effect_value.credits;
            }

            gachaResult = {
              item: {
                id: picked.id, name: picked.name, description: picked.description,
                itemType: picked.item_type, rarity: picked.rarity, emoji: picked.emoji,
                effectValue: picked.effect_value, isActive: picked.is_active, sortOrder: picked.sort_order,
              },
              isNew,
            };

            if (targetRarity !== 'legendary') newPityLegendary = newPityLegendary;
            if (targetRarity !== 'epic' && targetRarity !== 'legendary') newPityEpic = newPityEpic;
          }
        }

        // 7) DB 업데이트
        const updates: Record<string, any> = {
          xp: newXp,
          level: newLevel,
          total_generations: newTotalGen,
          total_images: newTotalImages,
          total_audio: newTotalAudio,
          total_videos: newTotalVideos,
          streak_count: newStreak,
          streak_last_date: today,
          gacha_count: newGachaCount,
          gacha_tickets: newGachaTickets,
          gacha_pity_epic: newPityEpic,
          gacha_pity_legendary: newPityLegendary,
          total_gacha_pulls: newGachaPulls,
          max_combo: newMaxCombo,
        };

        if (rewardCredits > 0) {
          updates.credits = (usr.credits || 0) + rewardCredits;
        }

        await supabase.from('c2gen_users').update(updates).eq('email', email);

        // 8) 업적 진행률 업데이트 (배치 처리 — N번 쿼리 → 2번으로 최적화)
        const achievementsUnlocked: any[] = [];
        const [{ data: achDefs }, { data: achProgress }] = await Promise.all([
          supabase.from('c2gen_achievements').select('*').eq('is_active', true),
          supabase.from('c2gen_user_achievements').select('achievement_id, progress, unlocked').eq('email', email),
        ]);

        // 기존 진행률 맵
        const achProgressMap: Record<string, any> = {};
        for (const ap of (achProgress || [])) achProgressMap[ap.achievement_id] = ap;

        const nowISO2 = new Date().toISOString();
        const upsertRows: any[] = [];
        let bonusCredits = 0;
        let bonusTickets = 0;

        for (const ach of (achDefs || [])) {
          let currentValue = 0;
          switch (ach.condition_type) {
            case 'total_generations': currentValue = newTotalGen; break;
            case 'total_images': currentValue = newTotalImages; break;
            case 'total_audio': currentValue = newTotalAudio; break;
            case 'total_videos': currentValue = newTotalVideos; break;
            case 'streak_days': currentValue = newStreak; break;
            case 'level_reached': currentValue = newLevel; break;
            case 'combo_count': currentValue = sessionCombo; break;
            case 'gacha_pulls': currentValue = newGachaPulls; break;
            case 'total_xp': currentValue = newXp; break;
            case 'special_konami': currentValue = (actionType === 'special_konami') ? 1 : 0; break;
            case 'special_logo_click': currentValue = (actionType === 'special_logo_click') ? 1 : 0; break;
            default: continue;
          }

          const prev = achProgressMap[ach.id];
          if (prev?.unlocked) continue;

          const newProgress = Math.min(currentValue, ach.condition_target);
          if (prev && newProgress <= (prev.progress || 0)) continue; // 진행 없으면 스킵

          const justUnlocked = newProgress >= ach.condition_target;
          upsertRows.push({
            email, achievement_id: ach.id,
            progress: newProgress,
            unlocked: justUnlocked,
            unlocked_at: justUnlocked ? nowISO2 : null,
            notified: false,
          });

          if (justUnlocked) {
            achievementsUnlocked.push({
              id: ach.id, name: ach.name, description: ach.description, icon: ach.icon,
              category: ach.category, rewardXp: ach.reward_xp, rewardCredits: ach.reward_credits,
              progress: newProgress,
            });
            bonusCredits += ach.reward_credits || 0;
            bonusTickets += ach.reward_gacha_tickets || 0;
          }
        }

        // 변경된 업적만 한 번에 upsert
        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabase.from('c2gen_user_achievements')
            .upsert(upsertRows, { onConflict: 'email,achievement_id' });
          if (upsertErr) console.error('[ach] batch upsert error:', upsertErr.message);
        }
        // 보상 지급 (한 번에)
        if (bonusCredits > 0 || bonusTickets > 0) {
          await supabase.from('c2gen_users').update({
            ...(bonusCredits > 0 ? { credits: (usr.credits || 0) + rewardCredits + bonusCredits } : {}),
            ...(bonusTickets > 0 ? { gacha_tickets: newGachaTickets + bonusTickets } : {}),
          }).eq('email', email);
        }

        // 9) 퀘스트 진행률 업데이트
        const questProgress: any[] = [];
        const todayQ = new Date().toISOString().slice(0, 10);
        const { data: userQuests } = await supabase.from('c2gen_user_quests')
          .select('id, quest_id, progress, completed, reward_claimed')
          .eq('email', email).eq('assigned_date', todayQ);

        if (userQuests && userQuests.length > 0) {
          const qIds = userQuests.map((q: any) => q.quest_id);
          const { data: qDefs } = await supabase.from('c2gen_quest_pool').select('*').in('id', qIds);
          const qDefMap: Record<string, any> = {};
          for (const qd of (qDefs || [])) qDefMap[qd.id] = qd;

          for (const uq of userQuests) {
            if (uq.completed) {
              questProgress.push({
                questId: uq.quest_id, progress: uq.progress,
                target: qDefMap[uq.quest_id]?.target || 1,
                justCompleted: false,
              });
              continue;
            }

            const def = qDefMap[uq.quest_id];
            if (!def) continue;

            let increment = 0;
            if (def.quest_type === 'generate_content' && actionType === 'generation_complete') increment = 1;
            else if (def.quest_type === 'generate_images') increment = imageCount;
            else if (def.quest_type === 'generate_audio') increment = audioCount;
            else if (def.quest_type === 'create_video') increment = videoCount;
            else if (def.quest_type === 'combo_reach' && sessionCombo >= def.target) increment = def.target;

            if (increment > 0) {
              const newQProgress = Math.min(uq.progress + increment, def.target);
              const justCompleted = newQProgress >= def.target;
              await supabase.from('c2gen_user_quests').update({
                progress: newQProgress,
                completed: justCompleted,
                completed_at: justCompleted ? new Date().toISOString() : null,
              }).eq('id', uq.id);

              questProgress.push({
                questId: uq.quest_id, progress: newQProgress,
                target: def.target, justCompleted,
              });
            } else {
              // 변화 없어도 포함 → 클라이언트 상태가 DB와 항상 일치
              questProgress.push({
                questId: uq.quest_id, progress: uq.progress,
                target: def.target, justCompleted: false,
              });
            }
          }
        }

        const titles = levelsConfig.titles || [];
        const emojis = levelsConfig.emojis || [];
        const colors = levelsConfig.colors || [];

        return res.json({
          xpGained,
          totalXp: newXp,
          newLevel: leveledUp ? newLevel : null,
          oldLevel,
          levelTitle: titles[newLevel - 1] || `Lv.${newLevel}`,
          levelEmoji: emojis[newLevel - 1] || '🌱',
          levelColor: colors[newLevel - 1] || '#94a3b8',
          levelReward,
          achievementsUnlocked,
          questProgress,
          milestoneReached,
          streakUpdated: { count: newStreak, bonus: Math.round(baseXp * (streakMultiplier - 1)), milestoneReward: streakMilestoneReward },
          gachaResult,
          comboCount: sessionCombo,
        });
      }

      // ── 퀘스트 보상 수령 ──
      case 'game-claimQuestReward': {
        const { token, questId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: uq } = await supabase.from('c2gen_user_quests')
          .select('id, completed, reward_claimed')
          .eq('email', session.email).eq('quest_id', questId).eq('assigned_date', todayStr).single();

        if (!uq) return res.status(404).json({ error: 'quest not found' });
        if (!uq.completed) return res.status(400).json({ error: 'quest not completed' });
        if (uq.reward_claimed) return res.status(400).json({ error: 'reward already claimed' });

        const { data: qDef } = await supabase.from('c2gen_quest_pool').select('reward_xp, reward_credits').eq('id', questId).single();
        const rewardXp = qDef?.reward_xp || 10;
        const rewardCr = qDef?.reward_credits || 5;

        // 보상 지급
        const { data: usr } = await supabase.from('c2gen_users').select('xp, credits').eq('email', session.email).single();
        await supabase.from('c2gen_users').update({
          xp: (usr?.xp || 0) + rewardXp,
          credits: (usr?.credits || 0) + rewardCr,
        }).eq('email', session.email);

        await supabase.from('c2gen_user_quests').update({ reward_claimed: true }).eq('id', uq.id);

        return res.json({ success: true, rewardXp, rewardCredits: rewardCr });
      }

      // ── 뽑기 (티켓 사용) ──
      case 'game-pullGacha': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: usr } = await supabase.from('c2gen_users')
          .select('gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, credits')
          .eq('email', session.email).single();

        if (!usr || (usr.gacha_tickets || 0) < 1) {
          return res.status(400).json({ error: '뽑기 티켓이 부족합니다.' });
        }

        // 설정 로드 (DB format: rarity_rates: {common:50, uncommon:25, ...}, pity: {epic_threshold:30, legendary_threshold:100})
        const { data: cfgRow } = await supabase.from('c2gen_game_config').select('value').eq('key', 'gacha_settings').single();
        const gs = cfgRow?.value || { rarity_rates: { common: 50, uncommon: 25, rare: 15, epic: 8, legendary: 2 }, pity: { epic_threshold: 30, legendary_threshold: 100 } };

        let pityEpic = (usr.gacha_pity_epic || 0) + 1;
        let pityLegendary = (usr.gacha_pity_legendary || 0) + 1;

        let targetRarity = 'common';
        if (pityLegendary >= (gs.pity?.legendary_threshold || gs.pity?.epic_guarantee || 100)) {
          targetRarity = 'legendary'; pityLegendary = 0; pityEpic = 0;
        } else if (pityEpic >= (gs.pity?.epic_threshold || gs.pity?.epic_guarantee || 30)) {
          targetRarity = 'epic'; pityEpic = 0;
        } else {
          // rarity_rates는 퍼센트 (common:50, uncommon:25 등), 합계 100
          const rates = gs.rarity_rates || gs.rarities || { common: 100 };
          const total = (Object.values(rates) as any[]).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : (b?.rate || 0) * 100), 0);
          const roll = Math.random() * (total as number);
          let cum = 0;
          for (const [r, val] of Object.entries(rates)) {
            const rateNum = typeof val === 'number' ? val : ((val as any)?.rate || 0) * 100;
            cum += rateNum;
            if (roll < cum) { targetRarity = r; break; }
          }
        }

        const { data: poolItems } = await supabase.from('c2gen_gacha_pool')
          .select('*').eq('rarity', targetRarity).eq('is_active', true);

        if (!poolItems || poolItems.length === 0) {
          return res.status(500).json({ error: 'No gacha items available' });
        }

        const picked = poolItems[Math.floor(Math.random() * poolItems.length)];

        const { data: existingRows2 } = await supabase.from('c2gen_user_inventory')
          .select('id, quantity').eq('email', session.email).eq('item_id', picked.id).order('quantity', { ascending: false }).limit(1);
        const existing = existingRows2?.[0] ?? null;

        let isNew = false;
        if (existing) {
          await supabase.from('c2gen_user_inventory')
            .update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
        } else {
          isNew = true;
          await supabase.from('c2gen_user_inventory').insert({
            email: session.email, item_id: picked.id, quantity: 1, obtained_via: 'gacha',
            is_active: false, is_equipped: false,
          });
        }

        // 크레딧 바우처 자동 사용
        let bonusCredits = 0;
        if (picked.item_type === 'credit_voucher' && picked.effect_value?.credits) {
          bonusCredits = picked.effect_value.credits;
        }

        await supabase.from('c2gen_users').update({
          gacha_tickets: (usr.gacha_tickets || 0) - 1,
          gacha_pity_epic: pityEpic,
          gacha_pity_legendary: pityLegendary,
          total_gacha_pulls: (usr.total_gacha_pulls || 0) + 1,
          ...(bonusCredits > 0 ? { credits: (usr.credits || 0) + bonusCredits } : {}),
        }).eq('email', session.email);

        return res.json({
          result: {
            item: {
              id: picked.id, name: picked.name, description: picked.description,
              itemType: picked.item_type, rarity: picked.rarity, emoji: picked.emoji,
              effectValue: picked.effect_value, isActive: true, sortOrder: picked.sort_order,
            },
            isNew,
          },
        });
      }

      // ── 아이템 장착 ──
      case 'game-equipItem': {
        const { token, slot, inventoryItemId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const eEmail = session.email;

        // 인벤토리 조회 + 현재 장착 정보를 병렬 로드
        const [invResult, eqResult] = await Promise.all([
          inventoryItemId
            ? supabase.from('c2gen_user_inventory').select('id, item_id').eq('email', eEmail).eq('id', inventoryItemId).single()
            : Promise.resolve({ data: null }),
          supabase.from('c2gen_user_equipped').select('equipped_title, equipped_frame, equipped_badges').eq('email', eEmail).single(),
        ]);

        const gachaItemId = invResult.data?.item_id || null;
        if (inventoryItemId && !gachaItemId) return res.status(404).json({ error: '인벤토리에 해당 아이템이 없습니다.' });

        const prev = eqResult.data;
        const now = new Date().toISOString();
        const writes: Promise<any>[] = [];
        const q = (query: PromiseLike<any>) => Promise.resolve(query);

        if (slot === 'title') {
          if (prev?.equipped_title && prev.equipped_title !== gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', prev.equipped_title)));
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_title: gachaItemId, updated_at: now }, { onConflict: 'email' })));
          if (gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
          }
        } else if (slot === 'frame') {
          if (prev?.equipped_frame && prev.equipped_frame !== gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', prev.equipped_frame)));
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_frame: gachaItemId, updated_at: now }, { onConflict: 'email' })));
          if (gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
          }
        } else if (slot === 'badge') {
          let badges: string[] = prev?.equipped_badges || [];
          if (gachaItemId) {
            if (!badges.includes(gachaItemId) && badges.length < 3) {
              badges = [...badges, gachaItemId];
              writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
            }
          } else if (badges.length > 0) {
            const removedId = badges[badges.length - 1];
            badges = badges.slice(0, -1);
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', removedId)));
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_badges: badges, updated_at: now }, { onConflict: 'email' })));
        }

        await Promise.all(writes);
        return res.json({ success: true });
      }

      // ── 소모품 사용 ──
      case 'game-useConsumable': {
        const { token, inventoryItemId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        // email로 전체 인벤토리 조회 후 메모리에서 매칭 (UUID id 또는 item_id 둘 다 시도)
        const { data: allUserInv } = await supabase.from('c2gen_user_inventory')
          .select('id, item_id, quantity, is_active').eq('email', session.email);
        const inv = (allUserInv || []).find((r: any) => r.id === inventoryItemId || r.item_id === inventoryItemId) ?? null;

        if (!inv || inv.quantity < 1) {
          const dbStr = (allUserInv || []).map((r: any) => `id:${r.id} item_id:${r.item_id} qty:${r.quantity}`).join(' || ');
          console.error('[useConsumable] NOT FOUND sentId:', inventoryItemId, 'email:', session.email, 'db:', dbStr);
          return res.status(400).json({ error: '아이템이 없습니다.', _debug: `sent="${inventoryItemId}" || db=[${dbStr}]` });
        }

        const { data: itemDef } = await supabase.from('c2gen_gacha_pool').select('*').eq('id', inv.item_id).single();
        if (!itemDef) return res.status(404).json({ error: 'item def not found' });

        if (itemDef.item_type === 'xp_booster') {
          const hours = itemDef.effect_value?.duration_hours || 2;
          const until = new Date(Date.now() + hours * 3600000).toISOString();
          await supabase.from('c2gen_user_inventory').update({
            quantity: inv.quantity - 1, is_active: true, active_until: until,
          }).eq('id', inv.id);
          return res.json({ success: true, effect: { type: 'xp_booster', multiplier: itemDef.effect_value?.xp_multiplier, until } });
        }

        if (itemDef.item_type === 'credit_voucher') {
          const credits = itemDef.effect_value?.credits || 0;
          const { data: usr } = await supabase.from('c2gen_users').select('credits').eq('email', session.email).single();
          await supabase.from('c2gen_users').update({ credits: (usr?.credits || 0) + credits }).eq('email', session.email);
          await supabase.from('c2gen_user_inventory').update({ quantity: inv.quantity - 1 }).eq('id', inv.id);
          return res.json({ success: true, effect: { type: 'credit_voucher', credits } });
        }

        return res.status(400).json({ error: '사용할 수 없는 아이템입니다.' });
      }

      // ── 프레스티지 ──
      case 'game-prestige': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: cfgRow } = await supabase.from('c2gen_game_config').select('value').eq('key', 'prestige_settings').single();
        const ps = cfgRow?.value || { enabled: false, xp_multiplier_per_prestige: 0.1, max_prestige: 10 };

        if (!ps.enabled) return res.status(400).json({ error: '프레스티지 시스템이 비활성화 상태입니다.' });

        const { data: cfgLvl } = await supabase.from('c2gen_game_config').select('value').eq('key', 'levels').single();
        const maxLevel = (cfgLvl?.value?.thresholds?.length) || 10;

        const { data: usr } = await supabase.from('c2gen_users')
          .select('level, prestige_level, prestige_xp_bonus')
          .eq('email', session.email).single();

        if (!usr || usr.level < maxLevel) {
          return res.status(400).json({ error: `최대 레벨(Lv.${maxLevel})에 도달해야 프레스티지할 수 있습니다.` });
        }
        if ((usr.prestige_level || 0) >= ps.max_prestige) {
          return res.status(400).json({ error: '최대 프레스티지에 도달했습니다.' });
        }

        const newPrestige = (usr.prestige_level || 0) + 1;
        const newBonus = newPrestige * (ps.xp_multiplier_per_prestige || 0.1);

        await supabase.from('c2gen_users').update({
          xp: 0, level: 1, prestige_level: newPrestige, prestige_xp_bonus: newBonus,
        }).eq('email', session.email);

        return res.json({ success: true, newPrestigeLevel: newPrestige, xpBonus: newBonus });
      }

      // ══════════════════════════════════════════
      // 관리자 게이미피케이션 API
      // ══════════════════════════════════════════

      case 'game-admin-listAchievements': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_achievements').select('*').order('sort_order');
        return res.json({ achievements: data || [] });
      }

      case 'game-admin-upsertAchievement': {
        const { adminToken, achievement } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_achievements').upsert(achievement, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteAchievement': {
        const { adminToken, achievementId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_user_achievements').delete().eq('achievement_id', achievementId);
        await supabase.from('c2gen_achievements').delete().eq('id', achievementId);
        return res.json({ success: true });
      }

      case 'game-admin-listQuests': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_quest_pool').select('*').order('created_at');
        return res.json({ quests: data || [] });
      }

      case 'game-admin-upsertQuest': {
        const { adminToken, quest } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_quest_pool').upsert(quest, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteQuest': {
        const { adminToken, questId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_user_quests').delete().eq('quest_id', questId);
        await supabase.from('c2gen_quest_pool').delete().eq('id', questId);
        return res.json({ success: true });
      }

      case 'game-admin-listGachaPool': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_gacha_pool').select('*').order('sort_order');
        return res.json({ items: data || [] });
      }

      case 'game-admin-upsertGachaItem': {
        const { adminToken, item } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_gacha_pool').upsert(item, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteGachaItem': {
        const { adminToken, itemId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_gacha_pool').delete().eq('id', itemId);
        return res.json({ success: true });
      }

      case 'game-admin-grantXp': {
        const { adminToken, email, amount } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data: usr } = await supabase.from('c2gen_users').select('xp').eq('email', email).single();
        if (!usr) return res.status(404).json({ error: 'user not found' });
        const newXp = Math.max(0, (usr.xp || 0) + (amount || 0));

        // 레벨 재계산
        const { data: cfgRow } = await supabase.from('c2gen_game_config').select('value').eq('key', 'levels').single();
        const thresholds = cfgRow?.value?.thresholds || [0,50,120,200,350,500,750,1000,1500,2500];
        let lv = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) { if (newXp >= thresholds[i]) { lv = i + 1; break; } }

        await supabase.from('c2gen_users').update({ xp: newXp, level: lv }).eq('email', email);
        return res.json({ success: true, newXp, newLevel: lv });
      }

      case 'game-admin-grantTickets': {
        const { adminToken, email, amount } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data: tUser } = await supabase.from('c2gen_users').select('gacha_tickets').eq('email', email).single();
        if (!tUser) return res.status(404).json({ error: 'user not found' });
        const newTickets = Math.max(0, (tUser.gacha_tickets || 0) + (amount || 0));
        await supabase.from('c2gen_users').update({ gacha_tickets: newTickets }).eq('email', email);
        return res.json({ success: true, message: `뽑기티켓 ${amount}장 지급 완료 (총 ${newTickets}장)`, newTickets });
      }

      case 'game-admin-grantItem': {
        const { adminToken, email, itemId, quantity = 1 } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: existingRows3 } = await supabase.from('c2gen_user_inventory')
          .select('id, quantity').eq('email', email).eq('item_id', itemId).order('quantity', { ascending: false }).limit(1);
        const existing = existingRows3?.[0] ?? null;

        if (existing) {
          await supabase.from('c2gen_user_inventory').update({ quantity: existing.quantity + quantity }).eq('id', existing.id);
        } else {
          await supabase.from('c2gen_user_inventory').insert({
            email, item_id: itemId, quantity, obtained_via: 'admin',
          });
        }
        return res.json({ success: true });
      }

      case 'game-admin-grantAchievement': {
        const { adminToken, email, achievementId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: ach } = await supabase.from('c2gen_achievements').select('condition_target').eq('id', achievementId).single();
        await supabase.from('c2gen_user_achievements').upsert({
          email, achievement_id: achievementId,
          progress: ach?.condition_target || 1,
          unlocked: true, unlocked_at: new Date().toISOString(), notified: false,
        }, { onConflict: 'email,achievement_id' });
        return res.json({ success: true });
      }

      case 'game-admin-userGameData': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: usr } = await supabase.from('c2gen_users')
          .select('xp, level, prestige_level, total_generations, total_images, total_audio, total_videos, streak_count, max_combo, gacha_tickets, total_gacha_pulls, login_days')
          .eq('email', email).single();

        // 장착 정보 (칭호/이모지)
        let equippedTitle = '';
        let equippedTitleEmoji = '';
        try {
          const { data: eq } = await supabase.from('c2gen_user_equipped').select('equipped_title, equipped_title_emoji').eq('email', email).single();
          if (eq) {
            equippedTitle = eq.equipped_title || '';
            equippedTitleEmoji = eq.equipped_title_emoji || '';
          }
        } catch {}

        // profile 매핑 (프론트엔드 기대 형식)
        const profile = usr ? {
          xp: usr.xp || 0,
          level: usr.level || 0,
          prestige: usr.prestige_level || 0,
          total_generations: usr.total_generations || 0,
          total_images: usr.total_images || 0,
          total_audio: usr.total_audio || 0,
          total_videos: usr.total_videos || 0,
          streak_count: usr.streak_count || 0,
          max_combo: usr.max_combo || 0,
          gacha_tickets: usr.gacha_tickets || 0,
          total_pulls: usr.total_gacha_pulls || 0,
          login_days: usr.login_days || 0,
          last_login_date: null,
          title: equippedTitle,
          title_emoji: equippedTitleEmoji,
        } : null;

        // 유저 업적 + 업적 정의 조인
        const { data: achDefs } = await supabase.from('c2gen_achievements').select('id, name, icon, condition_type, condition_target').order('sort_order');
        const { data: userAchs } = await supabase.from('c2gen_user_achievements').select('achievement_id, progress, unlocked, unlocked_at').eq('email', email);
        const userAchMap: Record<string, any> = {};
        (userAchs || []).forEach((ua: any) => { userAchMap[ua.achievement_id] = ua; });
        const achievements = (achDefs || []).map((a: any) => {
          const ua = userAchMap[a.id];
          return {
            id: a.id, name: a.name, icon: a.icon,
            unlocked: ua?.unlocked || false,
            progress: ua?.progress || 0,
            target: a.condition_target || 1,
            unlocked_at: ua?.unlocked_at || null,
          };
        });

        // 유저 인벤토리 + 아이템 정의 조인
        const { data: invRaw } = await supabase.from('c2gen_user_inventory').select('item_id, quantity, obtained_at').eq('email', email);
        const { data: gachaItems } = await supabase.from('c2gen_gacha_pool').select('id, name, emoji, rarity, item_type').order('sort_order');
        const itemMap: Record<string, any> = {};
        (gachaItems || []).forEach((g: any) => { itemMap[g.id] = g; });
        const inventory = (invRaw || []).map((inv: any) => {
          const item = itemMap[inv.item_id];
          return {
            id: inv.item_id,
            name: item?.name || inv.item_id,
            emoji: item?.emoji || '❓',
            rarity: item?.rarity || 'common',
            count: inv.quantity || 1,
            effect_type: item?.item_type || '',
            obtained_at: inv.obtained_at || '',
          };
        });

        // 뽑기 아이템 풀 (관리자 아이템 지급용)
        const gachaPool = (gachaItems || []).map((g: any) => ({
          id: g.id, name: g.name, emoji: g.emoji, rarity: g.rarity,
        }));

        // 업적 옵션 (관리자 업적 부여용)
        const achievementOptions = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, icon: a.icon,
        }));

        return res.json({ profile, achievements, inventory, gachaPool, achievementOptions });
      }

      case 'game-admin-bulkAction': {
        const { adminToken, bulkAction, targets, actionParams } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        let emails: string[] = targets || [];
        if (actionParams?.targetAll) {
          const { data: all } = await supabase.from('c2gen_users').select('email').eq('status', 'approved');
          emails = (all || []).map((u: any) => u.email);
        }

        let affected = 0;
        for (const em of emails) {
          if (bulkAction === 'grantXp' && actionParams?.amount) {
            const { data: u } = await supabase.from('c2gen_users').select('xp').eq('email', em).single();
            if (u) {
              await supabase.from('c2gen_users').update({ xp: (u.xp || 0) + actionParams.amount }).eq('email', em);
              affected++;
            }
          } else if (bulkAction === 'grantItem' && actionParams?.itemId) {
            await supabase.from('c2gen_user_inventory').insert({
              email: em, item_id: actionParams.itemId, quantity: actionParams.quantity || 1, obtained_via: 'admin',
            });
            affected++;
          } else if (bulkAction === 'grantTickets' && actionParams?.amount) {
            const { data: u } = await supabase.from('c2gen_users').select('gacha_tickets').eq('email', em).single();
            if (u) {
              await supabase.from('c2gen_users').update({ gacha_tickets: (u.gacha_tickets || 0) + actionParams.amount }).eq('email', em);
              affected++;
            }
          }
        }
        return res.json({ success: true, affected });
      }

      case 'game-admin-listEvents': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_events').select('*').order('start_at', { ascending: false });
        return res.json({ events: data || [] });
      }

      case 'game-admin-upsertEvent': {
        const { adminToken, event } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_events').upsert(event, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteEvent': {
        const { adminToken, eventId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_events').delete().eq('id', eventId);
        return res.json({ success: true });
      }

      case 'game-admin-leaderboard': {
        const { adminToken, period = 'weekly', category = 'xp_earned' } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        // 실시간 계산
        let orderCol = 'xp';
        if (category === 'generations') orderCol = 'total_generations';
        else if (category === 'streak') orderCol = 'streak_count';
        else if (category === 'level') orderCol = 'level';

        const { data: top } = await supabase.from('c2gen_users')
          .select('email, name, xp, level, total_generations, streak_count')
          .eq('status', 'approved')
          .order(orderCol, { ascending: false })
          .limit(20);

        const rankings = (top || []).map((u: any, i: number) => ({
          rank: i + 1, email: u.email, name: u.name,
          value: u[orderCol] || 0,
        }));

        return res.json({ rankings, period, category });
      }

      case 'gamificationAnalytics': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        // 1. 레벨 분포
        const { data: allUsers } = await supabase.from('c2gen_users').select('level').eq('status', 'approved');
        const levelMap: Record<number, number> = {};
        (allUsers || []).forEach((u: any) => { const l = u.level || 0; levelMap[l] = (levelMap[l] || 0) + 1; });
        const levelDist = Object.entries(levelMap).map(([lv, cnt]) => ({ level: Number(lv), count: cnt })).sort((a, b) => a.level - b.level);

        // 2. 업적 달성률
        const approvedUserCount = allUsers?.length || 1;
        const { data: achDefs } = await supabase.from('c2gen_achievements').select('id, name, icon').order('sort_order');
        const { data: achUnlocked } = await supabase.from('c2gen_user_achievements').select('achievement_id').eq('unlocked', true);
        const achCountMap: Record<string, number> = {};
        (achUnlocked || []).forEach((a: any) => { achCountMap[a.achievement_id] = (achCountMap[a.achievement_id] || 0) + 1; });
        const achievementRates = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, icon: a.icon,
          unlocked: achCountMap[a.id] || 0,
          total: approvedUserCount,
        }));

        // 3. 뽑기 레어도 분포
        const { data: invItems } = await supabase.from('c2gen_user_inventory').select('item_id, quantity');
        const { data: gachaPool } = await supabase.from('c2gen_gacha_pool').select('id, rarity');
        const poolRarity: Record<string, string> = {};
        (gachaPool || []).forEach((g: any) => { poolRarity[g.id] = g.rarity; });
        const rarityMap: Record<string, number> = {};
        (invItems || []).forEach((inv: any) => {
          const r = poolRarity[inv.item_id] || 'common';
          rarityMap[r] = (rarityMap[r] || 0) + (inv.quantity || 1);
        });
        const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const gachaRarityDist = rarityOrder.map(r => ({ rarity: r, count: rarityMap[r] || 0 }));

        // 4. 퀘스트 완료율
        const { data: questDefs } = await supabase.from('c2gen_quest_pool').select('id, name, icon');
        const { data: uqAll } = await supabase.from('c2gen_user_quests').select('quest_id, completed');
        const qAssigned: Record<string, number> = {};
        const qCompleted: Record<string, number> = {};
        (uqAll || []).forEach((q: any) => {
          qAssigned[q.quest_id] = (qAssigned[q.quest_id] || 0) + 1;
          if (q.completed) qCompleted[q.quest_id] = (qCompleted[q.quest_id] || 0) + 1;
        });
        const questRates = (questDefs || []).map((q: any) => ({
          id: q.id, name: q.name, icon: q.icon,
          completed: qCompleted[q.id] || 0,
          assigned: qAssigned[q.id] || 0,
        }));

        return res.json({ success: true, levelDist, achievementRates, gachaRarityDist, questRates });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/auth] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
