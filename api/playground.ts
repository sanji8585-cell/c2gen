import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

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

// ── 장착 아이템 조회 헬퍼 ──
async function resolveEquippedItems(
  supabase: ReturnType<typeof getSupabase>,
  emails: string[]
): Promise<Record<string, { title: any; badges: any[]; frame: any }>> {
  if (emails.length === 0) return {};

  const { data: equippedRows } = await supabase
    .from('c2gen_user_equipped')
    .select('email, equipped_title, equipped_badges, equipped_frame')
    .in('email', emails);

  if (!equippedRows || equippedRows.length === 0) return {};

  // 모든 아이템 ID 수집
  const allItemIds: string[] = [];
  for (const eq of equippedRows) {
    if (eq.equipped_title) allItemIds.push(eq.equipped_title);
    if (eq.equipped_frame) allItemIds.push(eq.equipped_frame);
    if (Array.isArray(eq.equipped_badges)) allItemIds.push(...eq.equipped_badges);
  }
  const uniqueIds = [...new Set(allItemIds.filter(Boolean))];

  let itemMap: Record<string, { id: string; name: string; emoji: string; rarity: string }> = {};
  if (uniqueIds.length > 0) {
    const { data: items } = await supabase
      .from('c2gen_gacha_pool')
      .select('id, name, emoji, rarity')
      .in('id', uniqueIds);
    for (const it of (items || [])) {
      itemMap[it.id] = it;
    }
  }

  // email → equipped 맵 구축
  const result: Record<string, any> = {};
  for (const eq of equippedRows) {
    result[eq.email] = {
      title: eq.equipped_title ? itemMap[eq.equipped_title] || null : null,
      badges: (eq.equipped_badges || [])
        .map((bid: string) => itemMap[bid])
        .filter(Boolean),
      frame: eq.equipped_frame ? itemMap[eq.equipped_frame] || null : null,
    };
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();

    // feed와 detail은 인증 선택, 나머지는 필수
    const publicActions = ['feed', 'detail'];
    let email = '';
    let session: SessionData | null = null;

    if (token) {
      session = await validateSession(supabase, token);
      if (session) email = session.email;
    }

    if (!publicActions.includes(action) && !email) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    switch (action) {

      // ── 피드 조회 ──
      case 'feed': {
        const { sort = 'latest', cursor, limit = 12 } = params;
        const lim = Math.min(Number(limit) || 12, 50);

        let query = supabase
          .from('playground_posts')
          .select('id, email, project_id, author_name, author_avatar_url, caption, thumbnail, topic, scene_count, like_count, created_at, video_url');

        if (sort === 'popular') {
          if (cursor) {
            const sepIdx = cursor.lastIndexOf(':');
            const cursorLikes = Number(cursor.slice(0, sepIdx));
            const cursorDate = cursor.slice(sepIdx + 1);
            query = query.or(
              `like_count.lt.${cursorLikes},and(like_count.eq.${cursorLikes},created_at.lt.${cursorDate})`
            );
          }
          query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false });
        } else {
          if (cursor) {
            query = query.lt('created_at', cursor);
          }
          query = query.order('created_at', { ascending: false });
        }

        query = query.limit(lim + 1);

        const { data: posts, error } = await query;
        if (error) {
          if (error.message?.includes('does not exist') || error.code === '42P01') {
            return res.json({ posts: [], nextCursor: null, likedPostIds: [] });
          }
          return res.status(500).json({ error: error.message });
        }

        const hasMore = (posts || []).length > lim;
        const resultPosts = (posts || []).slice(0, lim);

        let nextCursor: string | null = null;
        if (hasMore && resultPosts.length > 0) {
          const last = resultPosts[resultPosts.length - 1];
          nextCursor = sort === 'popular'
            ? `${last.like_count}:${last.created_at}`
            : last.created_at;
        }

        // 로그인 유저의 좋아요 여부 조회
        let likedPostIds: string[] = [];
        if (email && resultPosts.length > 0) {
          const postIds = resultPosts.map((p: any) => p.id);
          const { data: likes } = await supabase
            .from('playground_likes')
            .select('post_id')
            .eq('email', email)
            .in('post_id', postIds);
          likedPostIds = (likes || []).map((l: any) => l.post_id);
        }

        // 작성자 장착 아이템 배치 조회
        const uniqueEmails = [...new Set(resultPosts.map((p: any) => p.email))] as string[];
        const equippedMap = await resolveEquippedItems(supabase, uniqueEmails);
        const enrichedPosts = resultPosts.map((p: any) => ({
          ...p,
          equipped: equippedMap[p.email] || { title: null, badges: [], frame: null },
        }));

        return res.json({ posts: enrichedPosts, nextCursor, likedPostIds });
      }

      // ── 프로젝트 공유 ──
      case 'share': {
        const { projectId, caption = '' } = params;
        if (!projectId) return res.status(400).json({ error: '프로젝트를 선택해주세요.' });

        // 프로젝트 존재 & 소유자 확인
        const { data: project } = await supabase
          .from('c2gen_projects')
          .select('id, name, topic, thumbnail, scene_count')
          .eq('id', projectId)
          .eq('email', email)
          .single();
        if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

        // 중복 공유 방지
        const { data: existing } = await supabase
          .from('playground_posts')
          .select('id')
          .eq('project_id', projectId)
          .eq('email', email)
          .maybeSingle();
        if (existing) return res.status(400).json({ error: '이미 공유된 프로젝트입니다.' });

        // 유저 정보
        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name, avatar_url')
          .eq('email', email)
          .single();

        const { data: inserted, error: insertErr } = await supabase
          .from('playground_posts')
          .insert({
            email,
            project_id: projectId,
            author_name: user?.name || 'Unknown',
            author_avatar_url: user?.avatar_url || null,
            caption: String(caption).slice(0, 200),
            thumbnail: project.thumbnail,
            topic: project.topic || '',
            scene_count: project.scene_count || 0,
          })
          .select()
          .single();

        if (insertErr) return res.status(500).json({ error: insertErr.message });
        return res.json({ success: true, post: inserted });
      }

      // ── 게시물 삭제 ──
      case 'delete': {
        const { postId } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        const { error: delErr } = await supabase
          .from('playground_posts')
          .delete()
          .eq('id', postId)
          .eq('email', email);

        if (delErr) return res.status(500).json({ error: delErr.message });
        return res.json({ success: true });
      }

      // ── 좋아요 토글 ──
      case 'like': {
        const { postId } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        // 기존 좋아요 확인
        const { data: existing } = await supabase
          .from('playground_likes')
          .select('post_id')
          .eq('post_id', postId)
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          // 좋아요 취소
          await supabase.from('playground_likes').delete()
            .eq('post_id', postId).eq('email', email);
          const { data: post } = await supabase
            .from('playground_posts')
            .select('like_count')
            .eq('id', postId)
            .single();
          const newCount = Math.max(0, (post?.like_count || 1) - 1);
          await supabase.from('playground_posts')
            .update({ like_count: newCount })
            .eq('id', postId);
          return res.json({ liked: false, likeCount: newCount });
        } else {
          // 좋아요 추가
          const { error: likeErr } = await supabase.from('playground_likes').insert({
            post_id: postId,
            email,
          });
          if (likeErr) return res.status(500).json({ error: likeErr.message });
          const { data: post } = await supabase
            .from('playground_posts')
            .select('like_count')
            .eq('id', postId)
            .single();
          const newCount = (post?.like_count || 0) + 1;
          await supabase.from('playground_posts')
            .update({ like_count: newCount })
            .eq('id', postId);
          return res.json({ liked: true, likeCount: newCount });
        }
      }

      // ── 게시물 상세 (프로젝트 에셋 포함) ──
      case 'detail': {
        const { postId } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        const { data: post, error: postErr } = await supabase
          .from('playground_posts')
          .select('*')
          .eq('id', postId)
          .single();
        if (postErr || !post) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });

        // 프로젝트에서 에셋 URL 로드
        const { data: project } = await supabase
          .from('c2gen_projects')
          .select('assets, settings')
          .eq('id', post.project_id)
          .single();

        let assets: any[] = [];
        if (project?.assets) {
          assets = (project.assets as any[]).map((a: any) => ({
            sceneNumber: a.sceneNumber,
            narration: a.narration || '',
            visualPrompt: a.visualPrompt || '',
            imageUrl: a.imageUrl || null,
            audioUrl: a.audioUrl || null,
            audioDuration: a.audioDuration || null,
            subtitleData: a.subtitleData || null,
            customDuration: a.customDuration || undefined,
            videoData: a.videoData || null,
            videoDuration: a.videoDuration || null,
            zoomEffect: a.zoomEffect || 'zoomIn',
            transition: a.transition || 'none',
          }));
        }

        const sceneGap = project?.settings?.sceneGap ?? 0.3;

        // 현재 유저 좋아요 여부
        let liked = false;
        if (email) {
          const { data: likeData } = await supabase
            .from('playground_likes')
            .select('post_id')
            .eq('post_id', postId)
            .eq('email', email)
            .maybeSingle();
          liked = !!likeData;
        }

        // 작성자 장착 아이템 조회
        const eqMap = await resolveEquippedItems(supabase, [post.email]);
        const equipped = eqMap[post.email] || { title: null, badges: [], frame: null };

        return res.json({ post, assets, liked, sceneGap, equipped });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/playground] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
