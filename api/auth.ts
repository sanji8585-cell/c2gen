import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  getSupabase, hashPassword, generateSalt, verifyPassword,
  getKSTDateStr, validateAdminSession,
  SESSION_TTL, ADMIN_SESSION_TTL,
  type SessionData,
} from './lib/authUtils';

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    const supabase = getSupabase();

    switch (action) {
      // ── 회원가입 ──
      case 'register': {
        const { name, email, password, termsAgreedAt, marketingAgreed, referralCode } = params;
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

        // 추천인 코드 검증
        let referredByEmail: string | null = null;
        if (referralCode) {
          const { data: referrer } = await supabase
            .from('c2gen_users')
            .select('email')
            .eq('referral_code', referralCode.toUpperCase().trim())
            .single();
          if (referrer && referrer.email !== normalizedEmail) {
            referredByEmail = referrer.email;
          }
        }

        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);

        // 추천 코드 자동 생성
        const autoCode = normalizedEmail.split('@')[0].slice(0, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

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
          referral_code: autoCode,
          referred_by: referredByEmail,
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
          .select('name, referred_by')
          .eq('email', email)
          .single();

        if (!user) return res.status(404).json({ success: false, message: '해당 유저를 찾을 수 없습니다.' });

        await supabase.from('c2gen_users').update({ status: 'approved' }).eq('email', email);

        // 가입 보너스 크레딧 지급 (100크레딧)
        try {
          await supabase.rpc('add_credits', {
            p_email: email,
            p_amount: 100,
            p_type: 'bonus',
            p_description: '가입 승인 보너스',
          });
        } catch (e) {
          console.error('[api/auth] 보너스 크레딧 지급 실패:', e);
        }

        // ── 추천인 보상 지급 (다단계) ──
        if (user.referred_by) {
          try {
            const { data: refSettings } = await supabase
              .from('c2gen_referral_settings')
              .select('*')
              .eq('id', 'default')
              .single();

            if (refSettings?.enabled && refSettings.reward_trigger === 'approved') {
              const maxTiers = refSettings.max_tiers || 3;
              const tierRewards = [
                refSettings.tier1_reward || 0,
                refSettings.tier2_reward || 0,
                refSettings.tier3_reward || 0,
                refSettings.tier4_reward || 0,
                refSettings.tier5_reward || 0,
              ];

              // 신규 가입자 보너스
              if (refSettings.signup_bonus > 0) {
                await supabase.rpc('add_credits', {
                  p_email: email,
                  p_amount: refSettings.signup_bonus,
                  p_type: 'referral',
                  p_description: '추천 가입 보너스',
                });
              }

              // 다단계 추천인 트리 순회
              let currentReferrer = user.referred_by;
              for (let tier = 0; tier < maxTiers && currentReferrer; tier++) {
                const reward = tierRewards[tier];
                if (reward <= 0) break;

                // 보상 지급
                await supabase.rpc('add_credits', {
                  p_email: currentReferrer,
                  p_amount: reward,
                  p_type: 'referral',
                  p_description: `${tier + 1}단계 추천 보상 (${email})`,
                });

                // 보상 이력 기록
                await supabase.from('c2gen_referral_rewards').insert({
                  referrer_email: currentReferrer,
                  referred_email: email,
                  tier: tier + 1,
                  credits: reward,
                  status: 'paid',
                  paid_at: new Date().toISOString(),
                });

                // 다음 단계 추천인 조회
                const { data: nextRef } = await supabase
                  .from('c2gen_users')
                  .select('referred_by')
                  .eq('email', currentReferrer)
                  .single();
                currentReferrer = nextRef?.referred_by || null;
              }
            }
          } catch (e) {
            console.error('[api/auth] 추천 보상 지급 실패:', e);
          }
        }

        return res.json({ success: true, message: `${user.name} 님을 승인했습니다. (100 크레딧 지급)` });
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


      // ══════════════════════════════════════
      // ── 추천인 제도 (Referral System) ──
      // ══════════════════════════════════════

      // ── 내 추천 정보 조회 ──
      case 'referral-getMyInfo': {
        const refToken = params.token;
        if (!refToken) return res.status(401).json({ error: '로그인 필요' });
        const { data: refSession } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', refToken)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!refSession) return res.status(401).json({ error: '세션 만료' });
        const email = refSession.email;

        // 추천 코드가 없으면 생성
        const { data: user } = await supabase
          .from('c2gen_users')
          .select('referral_code, referred_by')
          .eq('email', email)
          .single();

        let referralCode = user?.referral_code;
        if (!referralCode) {
          referralCode = email.split('@')[0].slice(0, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
          await supabase.from('c2gen_users').update({ referral_code: referralCode }).eq('email', email);
        }

        // 내가 추천한 사람들 (1단계)
        const { data: directReferrals } = await supabase
          .from('c2gen_users')
          .select('email, name, status, created_at')
          .eq('referred_by', email)
          .order('created_at', { ascending: false });

        // 보상 이력
        const { data: rewards } = await supabase
          .from('c2gen_referral_rewards')
          .select('*')
          .eq('referrer_email', email)
          .order('created_at', { ascending: false })
          .limit(50);

        // 단계별 추천 수 집계
        const tierCounts: Record<number, number> = {};
        let totalEarned = 0;
        for (const r of (rewards || [])) {
          if (r.status === 'paid') {
            tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
            totalEarned += r.credits;
          }
        }

        return res.json({
          success: true,
          referralCode,
          referredBy: user?.referred_by || null,
          directReferrals: (directReferrals || []).map(r => ({
            email: r.email,
            name: r.name,
            status: r.status,
            createdAt: r.created_at,
          })),
          tierCounts,
          totalEarned,
          rewards: (rewards || []).slice(0, 20),
        });
      }

      // ── 추천 설정 조회 (관리자) ──
      case 'referral-getSettings': {
        const { data: settings } = await supabase
          .from('c2gen_referral_settings')
          .select('*')
          .eq('id', 'default')
          .single();
        return res.json({ success: true, settings: settings || {} });
      }

      // ── 추천 설정 업데이트 (관리자) ──
      case 'referral-updateSettings': {
        if (!(await validateAdminSession(supabase, params.token || params.adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });
        const { settings: newSettings } = params;
        if (!newSettings) return res.status(400).json({ error: 'settings 필요' });

        await supabase
          .from('c2gen_referral_settings')
          .update({ ...newSettings, updated_at: new Date().toISOString() })
          .eq('id', 'default');

        return res.json({ success: true });
      }

      // ── 추천 통계 (관리자) ──
      case 'referral-adminStats': {
        if (!(await validateAdminSession(supabase, params.token || params.adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        // 전체 추천 가입자 수
        const { count: totalReferred } = await supabase
          .from('c2gen_users')
          .select('*', { count: 'exact', head: true })
          .not('referred_by', 'is', null);

        // 총 지급 보상
        const { data: allRewards } = await supabase
          .from('c2gen_referral_rewards')
          .select('credits, status');
        const totalPaid = (allRewards || []).filter(r => r.status === 'paid').reduce((s, r) => s + r.credits, 0);
        const totalPending = (allRewards || []).filter(r => r.status === 'pending').reduce((s, r) => s + r.credits, 0);

        // Top 추천인 (지급 완료 기준)
        const { data: topReferrers } = await supabase
          .from('c2gen_referral_rewards')
          .select('referrer_email')
          .eq('status', 'paid');

        const referrerMap: Record<string, number> = {};
        for (const r of (topReferrers || [])) {
          referrerMap[r.referrer_email] = (referrerMap[r.referrer_email] || 0) + 1;
        }
        const topList = Object.entries(referrerMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([email, count]) => ({ email, count }));

        return res.json({
          success: true,
          totalReferred: totalReferred || 0,
          totalPaid,
          totalPending,
          topReferrers: topList,
        });
      }

      // ── 추천 코드 유효성 검증 (회원가입 시) ──
      case 'referral-validateCode': {
        const { code } = params;
        if (!code) return res.json({ valid: false });

        const { data: referrer } = await supabase
          .from('c2gen_users')
          .select('email, name')
          .eq('referral_code', code.toUpperCase().trim())
          .single();

        return res.json({
          valid: !!referrer,
          referrerName: referrer?.name || null,
        });
      }

      // ── 프리셋 목록 조회 ──
      case 'preset-list': {
        const { token } = params;
        if (!token) return res.status(401).json({ error: 'Token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { data: presets, error: listErr } = await supabase
          .from('c2gen_presets')
          .select('id, name, settings, created_at, updated_at')
          .eq('email', session.email)
          .order('updated_at', { ascending: false });

        if (listErr) throw listErr;
        return res.json({ presets: presets || [] });
      }

      // ── 프리셋 저장 (생성 or 업데이트) ──
      case 'preset-save': {
        const { token, preset } = params;
        if (!token) return res.status(401).json({ error: 'Token required' });
        if (!preset?.name || !preset?.settings) return res.status(400).json({ error: 'name and settings required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        // 업데이트 (id가 있는 경우)
        if (preset.id) {
          const { data: updated, error: upErr } = await supabase
            .from('c2gen_presets')
            .update({ name: preset.name, settings: preset.settings, updated_at: new Date().toISOString() })
            .eq('id', preset.id)
            .eq('email', session.email)
            .select('id, name, settings, created_at, updated_at')
            .single();
          if (upErr) throw upErr;
          return res.json({ preset: updated });
        }

        // 새로 생성 — 최대 20개 제한
        const { count } = await supabase
          .from('c2gen_presets')
          .select('id', { count: 'exact', head: true })
          .eq('email', session.email);

        if ((count ?? 0) >= 20) {
          return res.status(400).json({ error: '프리셋은 최대 20개까지 저장할 수 있습니다.' });
        }

        const { data: created, error: crErr } = await supabase
          .from('c2gen_presets')
          .insert({ email: session.email, name: preset.name, settings: preset.settings })
          .select('id, name, settings, created_at, updated_at')
          .single();
        if (crErr) throw crErr;
        return res.json({ preset: created });
      }

      // ── 프리셋 삭제 ──
      case 'preset-delete': {
        const { token, presetId } = params;
        if (!token || !presetId) return res.status(400).json({ error: 'token and presetId required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { error: delErr } = await supabase
          .from('c2gen_presets')
          .delete()
          .eq('id', presetId)
          .eq('email', session.email);

        if (delErr) throw delErr;
        return res.json({ success: true });
      }

      // ── 즐겨찾기 음성 목록 ──
      case 'favorite-voice-list': {
        const { token } = params;
        if (!token) return res.status(401).json({ error: 'Token required' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { data: favorites } = await supabase
          .from('c2gen_favorite_voices')
          .select('voice_id, voice_name, voice_meta, created_at')
          .eq('email', session.email)
          .order('created_at', { ascending: false });

        return res.json({ favorites: favorites || [] });
      }

      // ── 즐겨찾기 음성 추가 ──
      case 'favorite-voice-add': {
        const { token, voiceId, voiceName, voiceMeta } = params;
        if (!token || !voiceId || !voiceName) return res.status(400).json({ error: 'token, voiceId, voiceName required' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        // 최대 50개 제한
        const { count } = await supabase.from('c2gen_favorite_voices').select('id', { count: 'exact', head: true }).eq('email', session.email);
        if ((count ?? 0) >= 50) return res.status(400).json({ error: 'Maximum 50 favorites' });

        await supabase.from('c2gen_favorite_voices').upsert({
          email: session.email,
          voice_id: voiceId,
          voice_name: voiceName,
          voice_meta: voiceMeta || {},
        }, { onConflict: 'email,voice_id' });

        return res.json({ success: true });
      }

      // ── 즐겨찾기 음성 제거 ──
      case 'favorite-voice-remove': {
        const { token, voiceId } = params;
        if (!token || !voiceId) return res.status(400).json({ error: 'token and voiceId required' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        await supabase.from('c2gen_favorite_voices').delete().eq('email', session.email).eq('voice_id', voiceId);
        return res.json({ success: true });
      }

      // ══════════════════════════════════════
      // ── 1:1 문의 시스템 ──
      // ══════════════════════════════════════

      case 'submitInquiry': {
        if (!token) return res.status(401).json({ error: '로그인 필요' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { category = 'general', subject, content: inquiryContent } = params;
        if (!subject?.trim() || !inquiryContent?.trim()) return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
        if (subject.trim().length > 100) return res.status(400).json({ error: '제목은 100자 이내' });
        if (inquiryContent.trim().length > 1000) return res.status(400).json({ error: '내용은 1000자 이내' });

        const { data: user } = await supabase.from('c2gen_users').select('name').eq('email', session.email).single();

        const { data: inquiry, error: insErr } = await supabase.from('c2gen_inquiries').insert({
          email: session.email,
          author_name: user?.name || 'Unknown',
          category: ['bug', 'payment', 'account', 'playground', 'general'].includes(category) ? category : 'general',
          subject: subject.trim(),
          content: inquiryContent.trim(),
        }).select().single();

        if (insErr) return res.status(500).json({ error: insErr.message });
        return res.json({ success: true, inquiry });
      }

      case 'getMyInquiries': {
        if (!token) return res.status(401).json({ error: '로그인 필요' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { data: inquiries } = await supabase.from('c2gen_inquiries')
          .select('id, category, subject, content, status, admin_reply, admin_replied_at, read_by_user, created_at')
          .eq('email', session.email)
          .order('created_at', { ascending: false })
          .limit(20);

        const unreadCount = (inquiries || []).filter(i => i.status === 'replied' && !i.read_by_user).length;
        return res.json({ success: true, inquiries: inquiries || [], unreadCount });
      }

      case 'markInquiryRead': {
        if (!token) return res.status(401).json({ error: '로그인 필요' });
        const { data: session } = await supabase.from('c2gen_sessions').select('email').eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'Invalid session' });

        const { inquiryId } = params;
        if (!inquiryId) return res.status(400).json({ error: 'inquiryId 필요' });

        await supabase.from('c2gen_inquiries')
          .update({ read_by_user: true })
          .eq('id', inquiryId)
          .eq('email', session.email);
        return res.json({ success: true });
      }

      case 'admin-inquiryStats': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const [totalRes, openRes, repliedRes, closedRes] = await Promise.all([
          supabase.from('c2gen_inquiries').select('*', { count: 'exact', head: true }),
          supabase.from('c2gen_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('c2gen_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'replied'),
          supabase.from('c2gen_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
        ]);

        return res.json({
          success: true,
          total: totalRes.count || 0,
          open: openRes.count || 0,
          replied: repliedRes.count || 0,
          closed: closedRes.count || 0,
        });
      }

      case 'admin-listInquiries': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { page = 0, limit: ilimit = 20, status: iStatus, category: iCategory, search: iSearch } = params;
        const lim = Math.min(Number(ilimit) || 20, 50);
        const offset = (Number(page) || 0) * lim;

        let query = supabase.from('c2gen_inquiries')
          .select('id, email, author_name, category, subject, content, status, admin_reply, admin_replied_at, created_at', { count: 'exact' });

        if (iStatus && iStatus !== 'all') query = query.eq('status', iStatus);
        if (iCategory && iCategory !== 'all') query = query.eq('category', iCategory);
        if (iSearch) query = query.or(`subject.ilike.%${iSearch}%,content.ilike.%${iSearch}%,email.ilike.%${iSearch}%`);

        query = query.order('created_at', { ascending: false }).range(offset, offset + lim - 1);
        const { data: inquiries, count } = await query;

        return res.json({ success: true, inquiries: inquiries || [], total: count || 0 });
      }

      case 'admin-replyInquiry': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { inquiryId, reply } = params;
        if (!inquiryId || !reply?.trim()) return res.status(400).json({ error: '답변을 입력해주세요.' });

        await supabase.from('c2gen_inquiries').update({
          admin_reply: reply.trim(),
          admin_replied_at: new Date().toISOString(),
          status: 'replied',
          read_by_user: false,
        }).eq('id', inquiryId);

        return res.json({ success: true });
      }

      case 'admin-closeInquiry': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { inquiryId } = params;
        if (!inquiryId) return res.status(400).json({ error: 'inquiryId 필요' });

        await supabase.from('c2gen_inquiries').update({ status: 'closed' }).eq('id', inquiryId);
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/auth] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
