import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Supabase 클라이언트 ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

// ── 세션 검증 (Supabase) ──

interface SessionData {
  email: string;
  name: string;
}

async function validateSession(supabase: ReturnType<typeof getSupabase>, token: string): Promise<SessionData | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email, name')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data || null;
}

// ── 관리자 세션 검증 ──

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

// ── 테이블명 ──
const TABLE = 'c2gen_projects';

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();

    // 관리자 액션은 별도 인증
    const isAdminAction = action?.startsWith('admin-');

    // 일반 유저 인증 (관리자 액션 제외)
    let email = '';
    if (!isAdminAction) {
      const session = await validateSession(supabase, token);
      if (!session) return res.status(401).json({ error: '인증이 필요합니다.' });
      email = session.email;
    }

    switch (action) {
      // ── 프로젝트 저장 (첫 청크 + 메타) ──
      case 'save': {
        const { meta, assets } = params;
        if (!meta?.id || !assets) {
          return res.status(400).json({ success: false, message: '프로젝트 데이터가 올바르지 않습니다.' });
        }

        // storageVersion은 settings JSON 안에 포함
        const settings = { ...(meta.settings || {}), storageVersion: meta.storageVersion || undefined };

        const { error } = await supabase.from(TABLE).upsert({
          id: meta.id,
          email,
          name: meta.name,
          topic: meta.topic || '',
          thumbnail: meta.thumbnail || null,
          settings,
          cost: meta.cost || null,
          scene_count: meta.sceneCount || 0,
          assets,
          created_at: meta.createdAt || Date.now(),
        });

        if (error) {
          console.error('[api/projects] save error:', error);
          return res.status(500).json({ success: false, message: error.message });
        }

        return res.json({ success: true, id: meta.id });
      }

      // ── 에셋 청크 추가 (분할 저장용) ──
      case 'append-assets': {
        const { projectId, newAssets } = params;
        if (!projectId || !newAssets) {
          return res.status(400).json({ error: 'projectId와 newAssets가 필요합니다.' });
        }

        // 기존 assets 조회
        const { data, error: readError } = await supabase
          .from(TABLE)
          .select('assets')
          .eq('id', projectId)
          .eq('email', email)
          .single();

        if (readError || !data) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        // 병합 후 업데이트
        const merged = [...(data.assets || []), ...newAssets];
        const { error } = await supabase
          .from(TABLE)
          .update({ assets: merged, scene_count: merged.length })
          .eq('id', projectId)
          .eq('email', email);

        if (error) {
          console.error('[api/projects] append-assets error:', error);
          return res.status(500).json({ success: false, message: error.message });
        }

        return res.json({ success: true });
      }

      // ── 프로젝트 목록 (메타데이터만, assets 제외) ──
      case 'list': {
        const { data, error } = await supabase
          .from(TABLE)
          .select('id, name, topic, thumbnail, settings, cost, scene_count, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[api/projects] list error:', error);
          return res.status(500).json({ error: error.message });
        }

        // snake_case → camelCase 변환
        const projects = (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          topic: row.topic,
          thumbnail: row.thumbnail,
          settings: row.settings,
          cost: row.cost,
          sceneCount: row.scene_count,
          createdAt: row.created_at,
        }));

        return res.json({ projects });
      }

      // ── 프로젝트 메타 불러오기 (assets 제외) ──
      case 'load': {
        const { projectId } = params;
        if (!projectId) return res.status(400).json({ error: 'projectId가 필요합니다.' });

        const { data, error } = await supabase
          .from(TABLE)
          .select('id, name, topic, thumbnail, settings, cost, scene_count, created_at')
          .eq('id', projectId)
          .eq('email', email)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        return res.json({
          project: {
            id: data.id,
            name: data.name,
            topic: data.topic,
            thumbnail: data.thumbnail,
            settings: data.settings,
            cost: data.cost,
            sceneCount: data.scene_count,
            createdAt: data.created_at,
          },
        });
      }

      // ── 프로젝트 전체 로드 (Storage v2용 - 에셋이 경량이므로 단일 응답) ──
      case 'load-full': {
        const { projectId } = params;
        if (!projectId) return res.status(400).json({ error: 'projectId가 필요합니다.' });

        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .eq('id', projectId)
          .eq('email', email)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        return res.json({
          project: {
            id: data.id,
            name: data.name,
            topic: data.topic,
            thumbnail: data.thumbnail,
            settings: data.settings,
            cost: data.cost,
            sceneCount: data.scene_count,
            createdAt: data.created_at,
            storageVersion: data.settings?.storageVersion || undefined,
            assets: data.assets || [],
          },
        });
      }

      // ── 에셋 청크 로드 (분할 로드용 - 레거시) ──
      case 'load-assets': {
        const { projectId, offset = 0, limit = 5 } = params;
        if (!projectId) return res.status(400).json({ error: 'projectId가 필요합니다.' });

        const { data, error } = await supabase
          .from(TABLE)
          .select('assets')
          .eq('id', projectId)
          .eq('email', email)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        const allAssets = data.assets || [];
        const chunk = allAssets.slice(offset, offset + limit);

        return res.json({
          assets: chunk,
          total: allAssets.length,
          hasMore: offset + limit < allAssets.length,
        });
      }

      // ── 프로젝트 삭제 ──
      case 'delete': {
        const { projectId } = params;
        if (!projectId) return res.status(400).json({ error: 'projectId가 필요합니다.' });

        // Storage v2 프로젝트만 Storage 파일 삭제
        try {
          const { data: proj } = await supabase.from(TABLE).select('settings').eq('id', projectId).eq('email', email).single();
          if (proj?.settings?.storageVersion === 2) {
            const folder = `${email}/${projectId}`;
            const { data: files } = await supabase.storage.from('project-assets').list(folder);
            if (files && files.length > 0) {
              await supabase.storage.from('project-assets').remove(files.map(f => `${folder}/${f.name}`));
            }
          }
        } catch (e) {
          console.warn('[api/projects] Storage 삭제 스킵:', e);
        }

        const { error } = await supabase
          .from(TABLE)
          .delete()
          .eq('id', projectId)
          .eq('email', email);

        if (error) {
          console.error('[api/projects] delete error:', error);
          return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true });
      }

      // ── 프로젝트 이름 변경 ──
      case 'rename': {
        const { projectId, newName } = params;
        if (!projectId || !newName) {
          return res.status(400).json({ error: 'projectId와 newName이 필요합니다.' });
        }

        const { error } = await supabase
          .from(TABLE)
          .update({ name: newName })
          .eq('id', projectId)
          .eq('email', email);

        if (error) {
          console.error('[api/projects] rename error:', error);
          return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true });
      }

      // ══════════════════════════════════════
      // ── 관리자 전용 액션 (adminToken 인증) ──
      // ══════════════════════════════════════

      // ── 관리자: 프로젝트 메타 + 첫 청크 로드 ──
      case 'admin-load-project': {
        const { adminToken, projectId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data: meta, error: metaError } = await supabase
          .from(TABLE)
          .select('id, email, name, topic, thumbnail, settings, cost, scene_count, created_at')
          .eq('id', projectId)
          .single();

        if (metaError || !meta) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        // 첫 청크 로드
        const { data: assetsData } = await supabase
          .from(TABLE)
          .select('assets')
          .eq('id', projectId)
          .single();

        const allAssets = assetsData?.assets || [];
        const CHUNK = 5;
        const firstChunk = allAssets.slice(0, CHUNK);

        return res.json({
          project: {
            id: meta.id,
            email: meta.email,
            name: meta.name,
            topic: meta.topic,
            thumbnail: meta.thumbnail,
            settings: meta.settings,
            cost: meta.cost,
            sceneCount: meta.scene_count,
            createdAt: meta.created_at,
          },
          assets: firstChunk,
          total: allAssets.length,
          hasMore: allAssets.length > CHUNK,
        });
      }

      // ── 관리자: 에셋 청크 추가 로드 ──
      case 'admin-load-assets': {
        const { adminToken, projectId, offset = 0, limit = 5 } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        const { data, error: loadErr } = await supabase
          .from(TABLE)
          .select('assets')
          .eq('id', projectId)
          .single();

        if (loadErr || !data) {
          return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
        }

        const assets = data.assets || [];
        const chunk = assets.slice(offset, offset + limit);

        return res.json({
          assets: chunk,
          total: assets.length,
          hasMore: offset + limit < assets.length,
        });
      }

      // ── 관리자: 프로젝트 삭제 ──
      case 'admin-delete-project': {
        const { adminToken, projectId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }

        // 프로젝트 소유자 이메일 조회 → Storage 삭제
        try {
          const { data: proj } = await supabase.from(TABLE).select('email').eq('id', projectId).single();
          if (proj?.email) {
            const folder = `${proj.email}/${projectId}`;
            const { data: files } = await supabase.storage.from('project-assets').list(folder);
            if (files && files.length > 0) {
              await supabase.storage.from('project-assets').remove(files.map(f => `${folder}/${f.name}`));
            }
          }
        } catch (e) {
          console.warn('[api/projects] admin Storage 삭제 스킵:', e);
        }

        const { error: delErr } = await supabase
          .from(TABLE)
          .delete()
          .eq('id', projectId);

        if (delErr) {
          return res.status(500).json({ error: delErr.message });
        }

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/projects] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
