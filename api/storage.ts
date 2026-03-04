import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'project-assets';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

async function validateSession(supabase: ReturnType<typeof getSupabase>, token: string) {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email, name')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data || null;
}

// 버킷 자동 생성 (최초 1회)
let bucketChecked = false;
async function ensureBucket(supabase: ReturnType<typeof getSupabase>) {
  if (bucketChecked) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true });
    console.log(`[storage] 버킷 생성됨: ${BUCKET}`);
  }
  bucketChecked = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const session = await validateSession(supabase, token);
    if (!session) return res.status(401).json({ error: '인증이 필요합니다.' });

    const email = session.email;
    await ensureBucket(supabase);

    switch (action) {
      // ── 단일 파일 업로드 ──
      case 'upload': {
        const { projectId, sceneIndex, type, data } = params;
        if (!projectId || sceneIndex == null || !type || !data) {
          return res.status(400).json({ error: 'projectId, sceneIndex, type, data 필요' });
        }

        const ext = type === 'image' ? 'jpg' : 'mp3';
        const contentType = type === 'image' ? 'image/jpeg' : 'audio/mpeg';
        const path = `${email}/${projectId}/${type}_${sceneIndex}.${ext}`;

        // base64 → Buffer
        const buffer = Buffer.from(data, 'base64');

        // 기존 파일 덮어쓰기 (upsert)
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, buffer, { contentType, upsert: true });

        if (error) {
          console.error('[storage] upload error:', error);
          return res.status(500).json({ error: error.message });
        }

        // Public URL 생성
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        return res.json({ url: urlData.publicUrl });
      }

      // ── 프로젝트 전체 파일 삭제 ──
      case 'delete-project': {
        const { projectId } = params;
        if (!projectId) return res.status(400).json({ error: 'projectId 필요' });

        const folder = `${email}/${projectId}`;
        const { data: files } = await supabase.storage.from(BUCKET).list(folder);

        if (files && files.length > 0) {
          const paths = files.map(f => `${folder}/${f.name}`);
          const { error } = await supabase.storage.from(BUCKET).remove(paths);
          if (error) {
            console.error('[storage] delete error:', error);
            return res.status(500).json({ error: error.message });
          }
        }

        return res.json({ success: true, deleted: files?.length || 0 });
      }

      // ── 관리자: 프로젝트 파일 삭제 (이메일 직접 지정) ──
      case 'admin-delete-project': {
        const { projectId, ownerEmail, adminToken } = params;
        if (!adminToken || !projectId || !ownerEmail) {
          return res.status(400).json({ error: 'adminToken, projectId, ownerEmail 필요' });
        }

        // 관리자 인증
        const { data: adminSession } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', adminToken)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (adminSession?.email !== 'admin') {
          return res.status(401).json({ error: '관리자 인증 필요' });
        }

        const folder = `${ownerEmail}/${projectId}`;
        const { data: files } = await supabase.storage.from(BUCKET).list(folder);

        if (files && files.length > 0) {
          const paths = files.map(f => `${folder}/${f.name}`);
          await supabase.storage.from(BUCKET).remove(paths);
        }

        return res.json({ success: true, deleted: files?.length || 0 });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[storage] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
