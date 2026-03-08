import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabase, hashPassword, generateSalt, verifyPassword,
  validateAdminSession,
} from './lib/authUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = params.token;

  try {
    const supabase = getSupabase();

    switch (action) {

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

      default:
        return res.status(400).json({ error: `Unknown user action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/user] ${action} error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
