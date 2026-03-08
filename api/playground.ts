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

async function validateAdmin(supabase: ReturnType<typeof getSupabase>, token: string): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email === 'admin';
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

// ── 작성자 레벨 조회 헬퍼 ──
async function resolveLevels(
  supabase: ReturnType<typeof getSupabase>,
  emails: string[]
): Promise<Record<string, number>> {
  if (emails.length === 0) return {};
  const { data } = await supabase
    .from('c2gen_users')
    .select('email, level')
    .in('email', emails);
  const result: Record<string, number> = {};
  for (const u of (data || [])) {
    result[u.email] = u.level || 1;
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();

    // feed, detail, author-posts는 인증 선택, 나머지는 필수
    const publicActions = ['feed', 'detail', 'author-posts'];
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
        const { sort = 'latest', cursor, limit = 12, search, tag, authorEmail } = params;
        const lim = Math.min(Number(limit) || 12, 50);

        let query = supabase
          .from('playground_posts')
          .select('id, email, project_id, author_name, author_avatar_url, caption, thumbnail, topic, scene_count, like_count, view_count, comment_count, created_at, video_url, tags');

        // 검색 필터
        if (search) {
          query = query.or(`topic.ilike.%${search}%,caption.ilike.%${search}%,author_name.ilike.%${search}%`);
        }

        // 태그 필터
        if (tag) {
          query = query.contains('tags', [tag]);
        }

        // 작성자 필터
        if (authorEmail) {
          query = query.eq('email', authorEmail);
        }

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
            return res.json({ posts: [], nextCursor: null, likedPostIds: [], bookmarkedPostIds: [] });
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

        // 좋아요/북마크 + 장착 아이템 + 레벨 모두 병렬 조회
        const uniqueEmails = [...new Set(resultPosts.map((p: any) => p.email))] as string[];
        const postIds = resultPosts.map((p: any) => p.id);

        const parallelQueries: Promise<any>[] = [
          resolveEquippedItems(supabase, uniqueEmails),
          resolveLevels(supabase, uniqueEmails),
        ];
        if (email && postIds.length > 0) {
          parallelQueries.push(
            Promise.resolve(supabase.from('playground_likes').select('post_id').eq('email', email).in('post_id', postIds)),
            Promise.resolve(supabase.from('playground_bookmarks').select('post_id').eq('email', email).in('post_id', postIds)),
          );
        }

        const results = await Promise.all(parallelQueries);
        const equippedMap = results[0];
        const levelMap = results[1];
        let likedPostIds: string[] = [];
        let bookmarkedPostIds: string[] = [];
        if (email && postIds.length > 0) {
          likedPostIds = (results[2]?.data || []).map((l: any) => l.post_id);
          bookmarkedPostIds = (results[3]?.data || []).map((b: any) => b.post_id);
        }

        const enrichedPosts = resultPosts.map((p: any) => ({
          ...p,
          equipped: equippedMap[p.email] || { title: null, badges: [], frame: null },
          author_level: levelMap[p.email] || 1,
        }));

        // 비로그인 피드는 CDN 캐시 가능
        if (!email) {
          res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        }
        return res.json({ posts: enrichedPosts, nextCursor, likedPostIds, bookmarkedPostIds });
      }

      // ── 프로젝트 공유 ──
      case 'share': {
        const { projectId, caption = '', tags = [] } = params;
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

        // 태그 정제 (최대 5개, 각 20자)
        const cleanTags = (Array.isArray(tags) ? tags : [])
          .map((t: string) => String(t).trim().slice(0, 20))
          .filter((t: string) => t.length > 0)
          .slice(0, 5);

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
            tags: cleanTags,
            view_count: 0,
            comment_count: 0,
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
          // 알림: 게시물 작성자에게 좋아요 알림 (자기 자신 제외)
          const { data: likedPost } = await supabase.from('playground_posts').select('email, topic').eq('id', postId).single();
          if (likedPost && likedPost.email !== email) {
            Promise.resolve(supabase.from('playground_notifications').insert({
              recipient_email: likedPost.email,
              actor_email: email,
              actor_name: session?.name || 'Unknown',
              type: 'like',
              post_id: postId,
              message: `${session?.name || 'Unknown'}님이 "${(likedPost.topic || '').slice(0, 30)}" 게시물에 좋아요`,
            })).catch(() => {});
          }
          return res.json({ liked: true, likeCount: newCount });
        }
      }

      // ── 북마크 토글 ──
      case 'bookmark': {
        const { postId } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        const { data: existing } = await supabase
          .from('playground_bookmarks')
          .select('post_id')
          .eq('post_id', postId)
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          await supabase.from('playground_bookmarks').delete()
            .eq('post_id', postId).eq('email', email);
          return res.json({ bookmarked: false });
        } else {
          await supabase.from('playground_bookmarks').insert({ post_id: postId, email });
          return res.json({ bookmarked: true });
        }
      }

      // ── 조회수 증가 ──
      case 'view': {
        const { postId } = params;
        if (!postId) return res.json({ success: true });

        // 비로그인도 조회수 증가 허용 (IP 기반이 아니라 단순 증가)
        const { data: post } = await supabase
          .from('playground_posts')
          .select('view_count')
          .eq('id', postId)
          .single();

        if (post) {
          await supabase.from('playground_posts')
            .update({ view_count: (post.view_count || 0) + 1 })
            .eq('id', postId);
        }
        return res.json({ success: true });
      }

      // ── 신고 ──
      case 'report': {
        const { postId, reason } = params;
        if (!postId || !reason) return res.status(400).json({ error: 'postId와 reason 필요' });

        // 중복 신고 방지
        const { data: existing } = await supabase
          .from('playground_reports')
          .select('id')
          .eq('post_id', postId)
          .eq('email', email)
          .maybeSingle();
        if (existing) return res.status(400).json({ error: '이미 신고한 게시물입니다.' });

        await supabase.from('playground_reports').insert({
          post_id: postId,
          email,
          reason: String(reason).slice(0, 100),
        });

        // 신고 3건 이상이면 자동 flag
        const { count } = await supabase
          .from('playground_reports')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', postId);
        if ((count || 0) >= 3) {
          await supabase.from('playground_posts')
            .update({ flagged: true })
            .eq('id', postId);
        }

        return res.json({ success: true });
      }

      // ── 댓글 목록 조회 ──
      case 'comments': {
        const { postId, cursor: commentCursor, limit: commentLimit = 20 } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        const lim = Math.min(Number(commentLimit) || 20, 50);

        let query = supabase
          .from('playground_comments')
          .select('id, post_id, email, author_name, author_avatar_url, content, parent_id, like_count, created_at')
          .eq('post_id', postId)
          .is('parent_id', null) // 최상위 댓글만
          .order('created_at', { ascending: true });

        if (commentCursor) {
          query = query.gt('created_at', commentCursor);
        }
        query = query.limit(lim + 1);

        const { data: comments, error: commErr } = await query;
        if (commErr) {
          if (commErr.message?.includes('does not exist') || commErr.code === '42P01') {
            return res.json({ comments: [], replies: {}, nextCursor: null, likedCommentIds: [] });
          }
          return res.status(500).json({ error: commErr.message });
        }

        const hasMore = (comments || []).length > lim;
        const resultComments = (comments || []).slice(0, lim);

        let nextCursor: string | null = null;
        if (hasMore && resultComments.length > 0) {
          nextCursor = resultComments[resultComments.length - 1].created_at;
        }

        // 답글 조회 (각 댓글의 답글)
        const commentIds = resultComments.map((c: any) => c.id);
        let replies: Record<string, any[]> = {};
        if (commentIds.length > 0) {
          const { data: replyData } = await supabase
            .from('playground_comments')
            .select('id, post_id, email, author_name, author_avatar_url, content, parent_id, like_count, created_at')
            .in('parent_id', commentIds)
            .order('created_at', { ascending: true });
          for (const r of (replyData || [])) {
            if (!replies[r.parent_id]) replies[r.parent_id] = [];
            replies[r.parent_id].push(r);
          }
        }

        // 댓글 좋아요 여부
        let likedCommentIds: string[] = [];
        if (email) {
          const allIds = [...commentIds];
          Object.values(replies).forEach(arr => arr.forEach(r => allIds.push(r.id)));
          if (allIds.length > 0) {
            const { data: cl } = await supabase
              .from('playground_comment_likes')
              .select('comment_id')
              .eq('email', email)
              .in('comment_id', allIds);
            likedCommentIds = (cl || []).map((x: any) => x.comment_id);
          }
        }

        // 댓글 작성자 장착 아이템
        const allCommentEmails: string[] = [];
        resultComments.forEach((c: any) => allCommentEmails.push(c.email));
        Object.values(replies).forEach(arr => arr.forEach(r => allCommentEmails.push(r.email)));
        const uniqueCommentEmails = [...new Set(allCommentEmails)];
        const [commentEquipped, commentLevels] = await Promise.all([
          resolveEquippedItems(supabase, uniqueCommentEmails),
          resolveLevels(supabase, uniqueCommentEmails),
        ]);

        const enrichComments = resultComments.map((c: any) => ({
          ...c,
          equipped: commentEquipped[c.email] || { title: null, badges: [], frame: null },
          author_level: commentLevels[c.email] || 1,
        }));
        const enrichReplies: Record<string, any[]> = {};
        for (const [pid, arr] of Object.entries(replies)) {
          enrichReplies[pid] = arr.map((r: any) => ({
            ...r,
            equipped: commentEquipped[r.email] || { title: null, badges: [], frame: null },
            author_level: commentLevels[r.email] || 1,
          }));
        }

        return res.json({ comments: enrichComments, replies: enrichReplies, nextCursor, likedCommentIds });
      }

      // ── 댓글 작성 ──
      case 'addComment': {
        const { postId, content, parentId } = params;
        if (!postId || !content) return res.status(400).json({ error: 'postId와 content 필요' });

        const trimmed = String(content).trim().slice(0, 500);
        if (trimmed.length === 0) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });

        // 유저 정보
        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name, avatar_url')
          .eq('email', email)
          .single();

        const insertData: any = {
          post_id: postId,
          email,
          author_name: user?.name || 'Unknown',
          author_avatar_url: user?.avatar_url || null,
          content: trimmed,
          like_count: 0,
        };
        if (parentId) insertData.parent_id = parentId;

        const { data: inserted, error: insertErr } = await supabase
          .from('playground_comments')
          .insert(insertData)
          .select()
          .single();

        if (insertErr) return res.status(500).json({ error: insertErr.message });

        // comment_count 증가
        const { data: post } = await supabase
          .from('playground_posts')
          .select('comment_count')
          .eq('id', postId)
          .single();
        await supabase.from('playground_posts')
          .update({ comment_count: ((post?.comment_count) || 0) + 1 })
          .eq('id', postId);

        // 장착 아이템 조회
        const eqMap = await resolveEquippedItems(supabase, [email]);

        // 알림: 게시물 작성자 또는 부모 댓글 작성자에게 알림
        const actorName = user?.name || 'Unknown';
        if (parentId) {
          // 답글 -> 부모 댓글 작성자에게 알림
          const { data: parentComment } = await supabase.from('playground_comments').select('email').eq('id', parentId).single();
          if (parentComment && parentComment.email !== email) {
            Promise.resolve(supabase.from('playground_notifications').insert({
              recipient_email: parentComment.email,
              actor_email: email, actor_name: actorName, type: 'reply',
              post_id: postId, comment_id: inserted.id,
              message: `${actorName}님이 답글: "${trimmed.slice(0, 40)}"`,
            })).catch(() => {});
          }
        } else {
          // 댓글 -> 게시물 작성자에게 알림
          const { data: commentedPost } = await supabase.from('playground_posts').select('email').eq('id', postId).single();
          if (commentedPost && commentedPost.email !== email) {
            Promise.resolve(supabase.from('playground_notifications').insert({
              recipient_email: commentedPost.email,
              actor_email: email, actor_name: actorName, type: 'comment',
              post_id: postId, comment_id: inserted.id,
              message: `${actorName}님이 댓글: "${trimmed.slice(0, 40)}"`,
            })).catch(() => {});
          }
        }

        return res.json({
          success: true,
          comment: { ...inserted, equipped: eqMap[email] || { title: null, badges: [], frame: null } },
          commentCount: ((post?.comment_count) || 0) + 1,
        });
      }

      // ── 댓글 삭제 ──
      case 'deleteComment': {
        const { commentId } = params;
        if (!commentId) return res.status(400).json({ error: 'commentId 필요' });

        // 댓글 조회 (소유자 확인 + postId)
        const { data: comment } = await supabase
          .from('playground_comments')
          .select('post_id, email, parent_id')
          .eq('id', commentId)
          .single();
        if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        if (comment.email !== email) return res.status(403).json({ error: '본인 댓글만 삭제할 수 있습니다.' });

        // 답글도 함께 삭제
        await supabase.from('playground_comment_likes').delete().eq('comment_id', commentId);
        if (!comment.parent_id) {
          // 최상위 댓글이면 답글들도 삭제
          const { data: childComments } = await supabase
            .from('playground_comments')
            .select('id')
            .eq('parent_id', commentId);
          const childIds = (childComments || []).map((c: any) => c.id);
          if (childIds.length > 0) {
            await supabase.from('playground_comment_likes').delete().in('comment_id', childIds);
            await supabase.from('playground_comments').delete().in('id', childIds);
          }
        }
        await supabase.from('playground_comments').delete().eq('id', commentId);

        // comment_count 감소
        const { data: post } = await supabase
          .from('playground_posts')
          .select('comment_count')
          .eq('id', comment.post_id)
          .single();
        const newCommentCount = Math.max(0, ((post?.comment_count) || 0) - 1);
        await supabase.from('playground_posts')
          .update({ comment_count: newCommentCount })
          .eq('id', comment.post_id);

        return res.json({ success: true, commentCount: newCommentCount });
      }

      // ── 댓글 좋아요 토글 ──
      case 'likeComment': {
        const { commentId } = params;
        if (!commentId) return res.status(400).json({ error: 'commentId 필요' });

        const { data: existing } = await supabase
          .from('playground_comment_likes')
          .select('comment_id')
          .eq('comment_id', commentId)
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          await supabase.from('playground_comment_likes').delete()
            .eq('comment_id', commentId).eq('email', email);
          const { data: c } = await supabase.from('playground_comments')
            .select('like_count').eq('id', commentId).single();
          const newCount = Math.max(0, (c?.like_count || 1) - 1);
          await supabase.from('playground_comments')
            .update({ like_count: newCount }).eq('id', commentId);
          return res.json({ liked: false, likeCount: newCount });
        } else {
          await supabase.from('playground_comment_likes').insert({ comment_id: commentId, email });
          const { data: c } = await supabase.from('playground_comments')
            .select('like_count').eq('id', commentId).single();
          const newCount = (c?.like_count || 0) + 1;
          await supabase.from('playground_comments')
            .update({ like_count: newCount }).eq('id', commentId);
          return res.json({ liked: true, likeCount: newCount });
        }
      }

      // ── 작성자 프로필 조회 ──
      case 'author-posts': {
        const { authorEmail: ae } = params;
        if (!ae) return res.status(400).json({ error: 'authorEmail 필요' });

        // 유저 정보
        const { data: user } = await supabase
          .from('c2gen_users')
          .select('name, avatar_url, level')
          .eq('email', ae)
          .single();

        // 게시물 수, 총 좋아요
        const { data: posts } = await supabase
          .from('playground_posts')
          .select('like_count')
          .eq('email', ae);

        const postCount = (posts || []).length;
        const totalLikes = (posts || []).reduce((s: number, p: any) => s + (p.like_count || 0), 0);

        // 장착 아이템
        const eqMap = await resolveEquippedItems(supabase, [ae]);

        return res.json({
          success: true,
          author: {
            email: ae,
            name: user?.name || 'Unknown',
            avatarUrl: user?.avatar_url || null,
            level: user?.level || 1,
            postCount,
            totalLikes,
            equipped: eqMap[ae] || { title: null, badges: [], frame: null },
          },
        });
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

        // 현재 유저 좋아요/북마크 여부
        let liked = false;
        let bookmarked = false;
        if (email) {
          const [likeRes, bmRes] = await Promise.all([
            supabase.from('playground_likes').select('post_id').eq('post_id', postId).eq('email', email).maybeSingle(),
            supabase.from('playground_bookmarks').select('post_id').eq('post_id', postId).eq('email', email).maybeSingle(),
          ]);
          liked = !!likeRes.data;
          bookmarked = !!bmRes.data;
        }

        // 작성자 장착 아이템 + 레벨 조회
        const [eqMap, lvlMap] = await Promise.all([
          resolveEquippedItems(supabase, [post.email]),
          resolveLevels(supabase, [post.email]),
        ]);
        const equipped = eqMap[post.email] || { title: null, badges: [], frame: null };
        const authorLevel = lvlMap[post.email] || 1;

        return res.json({ post: { ...post, author_level: authorLevel }, assets, liked, bookmarked, sceneGap, equipped });
      }

      // ── 알림 목록 조회 ──
      case 'notifications': {
        const { limit: notifLimit = 30 } = params;
        const lim = Math.min(Number(notifLimit) || 30, 50);

        const [notifRes, countRes] = await Promise.all([
          supabase.from('playground_notifications')
            .select('id, actor_email, actor_name, type, post_id, comment_id, message, read, created_at')
            .eq('recipient_email', email)
            .order('created_at', { ascending: false })
            .limit(lim),
          supabase.from('playground_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_email', email)
            .eq('read', false),
        ]);

        return res.json({
          notifications: notifRes.data || [],
          unreadCount: countRes.count || 0,
        });
      }

      // ── 알림 읽음 처리 ──
      case 'markNotificationsRead': {
        const { ids } = params;
        if (ids && Array.isArray(ids) && ids.length > 0) {
          await supabase.from('playground_notifications')
            .update({ read: true })
            .in('id', ids)
            .eq('recipient_email', email);
        } else {
          await supabase.from('playground_notifications')
            .update({ read: true })
            .eq('recipient_email', email)
            .eq('read', false);
        }
        return res.json({ success: true });
      }

      // ══════════════════════════════════════
      // ── 관리자 전용 (Admin Actions) ──
      // ══════════════════════════════════════

      case 'admin-playgroundStats': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { count: totalPosts } = await supabase.from('playground_posts').select('*', { count: 'exact', head: true });
        const { count: flaggedPosts } = await supabase.from('playground_posts').select('*', { count: 'exact', head: true }).eq('flagged', true);
        const { data: authorData } = await supabase.from('playground_posts').select('email');
        const uniqueAuthors = new Set((authorData || []).map((p: any) => p.email)).size;
        const { data: likeData } = await supabase.from('playground_posts').select('like_count');
        const totalLikes = (likeData || []).reduce((s: number, p: any) => s + (p.like_count || 0), 0);
        const { count: totalComments } = await supabase.from('playground_comments').select('*', { count: 'exact', head: true });
        const { count: totalReports } = await supabase.from('playground_reports').select('*', { count: 'exact', head: true });

        // 추가 통계: 북마크, 조회수, 알림
        const [bmRes, viewRes, notifRes] = await Promise.all([
          supabase.from('playground_bookmarks').select('*', { count: 'exact', head: true }),
          supabase.from('playground_posts').select('view_count'),
          supabase.from('playground_notifications').select('*', { count: 'exact', head: true }),
        ]);
        const totalBookmarks = bmRes.count || 0;
        const totalViews = (viewRes.data || []).reduce((s: number, p: any) => s + (p.view_count || 0), 0);
        const totalNotifications = notifRes.count || 0;

        return res.json({
          success: true,
          totalPosts: totalPosts || 0,
          flaggedPosts: flaggedPosts || 0,
          uniqueAuthors,
          totalLikes,
          totalComments: totalComments || 0,
          totalReports: totalReports || 0,
          totalBookmarks,
          totalViews,
          totalNotifications,
        });
      }

      case 'admin-playgroundPosts': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { page = 0, limit = 20, search, filter, sort = 'latest' } = params;
        const lim = Math.min(Number(limit) || 20, 50);
        const offset = (Number(page) || 0) * lim;

        let query = supabase.from('playground_posts')
          .select('id, email, author_name, caption, thumbnail, topic, scene_count, like_count, view_count, comment_count, created_at, video_url, flagged, tags', { count: 'exact' });

        if (filter === 'flagged') query = query.eq('flagged', true);
        if (filter === 'reported') {
          const { data: reportedIds } = await supabase.from('playground_reports').select('post_id');
          const ids = [...new Set((reportedIds || []).map((r: any) => r.post_id))];
          if (ids.length > 0) query = query.in('id', ids);
          else return res.json({ success: true, posts: [], total: 0 });
        }
        if (search) query = query.or(`caption.ilike.%${search}%,author_name.ilike.%${search}%,email.ilike.%${search}%,topic.ilike.%${search}%`);

        if (sort === 'popular') {
          query = query.order('like_count', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data: posts, count } = await query.range(offset, offset + lim - 1);
        return res.json({ success: true, posts: posts || [], total: count || 0 });
      }

      case 'admin-deletePost': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { postId } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        // 게시물 정보 먼저 조회 (Storage 삭제용 email 필요)
        const { data: post } = await supabase.from('playground_posts').select('email, video_url').eq('id', postId).single();
        if (!post) return res.status(404).json({ error: '게시물 없음' });

        // 관련 데이터 삭제
        await Promise.all([
          supabase.from('playground_likes').delete().eq('post_id', postId),
          supabase.from('playground_bookmarks').delete().eq('post_id', postId),
          supabase.from('playground_reports').delete().eq('post_id', postId),
        ]);

        // 댓글 + 댓글 좋아요 삭제
        const { data: commentIds } = await supabase.from('playground_comments').select('id').eq('post_id', postId);
        if (commentIds && commentIds.length > 0) {
          const cIds = commentIds.map((c: any) => c.id);
          await supabase.from('playground_comment_likes').delete().in('comment_id', cIds);
          await supabase.from('playground_comments').delete().eq('post_id', postId);
        }

        // 게시물 삭제
        await supabase.from('playground_posts').delete().eq('id', postId);

        // Storage 영상 파일 삭제
        if (post.video_url && post.email) {
          const BUCKET = 'project-assets';
          await supabase.storage.from(BUCKET).remove([
            `playground/${post.email}/${postId}.mp4`,
            `playground/${post.email}/${postId}.webm`,
          ]);
        }

        return res.json({ success: true });
      }

      case 'admin-flagPost': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { postId, flagged } = params;
        if (!postId) return res.status(400).json({ error: 'postId 필요' });

        await supabase.from('playground_posts').update({ flagged: !!flagged }).eq('id', postId);
        return res.json({ success: true });
      }

      // ── 신고 목록 조회 ──
      case 'admin-viewReports': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { page = 0, limit: rlimit = 20, reasonFilter } = params;
        const lim = Math.min(Number(rlimit) || 20, 50);
        const offset = (Number(page) || 0) * lim;

        let query = supabase.from('playground_reports')
          .select('id, post_id, email, reason, created_at', { count: 'exact' });
        if (reasonFilter) query = query.eq('reason', reasonFilter);
        query = query.order('created_at', { ascending: false }).range(offset, offset + lim - 1);

        const { data: reports, count } = await query;

        // 게시물 정보 조인
        const postIds = [...new Set((reports || []).map((r: any) => r.post_id))];
        let postMap: Record<string, any> = {};
        if (postIds.length > 0) {
          const { data: posts } = await supabase.from('playground_posts')
            .select('id, topic, author_name, email, flagged')
            .in('id', postIds);
          for (const p of (posts || [])) postMap[p.id] = p;
        }

        const enriched = (reports || []).map((r: any) => ({
          ...r,
          post_topic: postMap[r.post_id]?.topic || '삭제됨',
          post_author: postMap[r.post_id]?.author_name || '-',
          post_flagged: postMap[r.post_id]?.flagged || false,
        }));

        return res.json({ success: true, reports: enriched, total: count || 0 });
      }

      // ── 댓글 목록 조회 ──
      case 'admin-listComments': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { page = 0, limit: climit = 20, search: csearch } = params;
        const lim = Math.min(Number(climit) || 20, 50);
        const offset = (Number(page) || 0) * lim;

        let query = supabase.from('playground_comments')
          .select('id, post_id, email, author_name, content, like_count, parent_id, created_at', { count: 'exact' });
        if (csearch) query = query.or(`content.ilike.%${csearch}%,author_name.ilike.%${csearch}%,email.ilike.%${csearch}%`);
        query = query.order('created_at', { ascending: false }).range(offset, offset + lim - 1);

        const { data: comments, count } = await query;

        // 게시물 제목 조인
        const cPostIds = [...new Set((comments || []).map((c: any) => c.post_id))];
        let cPostMap: Record<string, string> = {};
        if (cPostIds.length > 0) {
          const { data: posts } = await supabase.from('playground_posts').select('id, topic').in('id', cPostIds);
          for (const p of (posts || [])) cPostMap[p.id] = p.topic || '제목 없음';
        }

        const enrichedComments = (comments || []).map((c: any) => ({
          ...c,
          post_topic: cPostMap[c.post_id] || '삭제됨',
        }));

        return res.json({ success: true, comments: enrichedComments, total: count || 0 });
      }

      // ── 관리자 댓글 삭제 ──
      case 'admin-deleteComment': {
        const adminToken = params.adminToken || params.token || token;
        if (!(await validateAdmin(supabase, adminToken))) return res.status(403).json({ error: '관리자 권한 필요' });

        const { commentId } = params;
        if (!commentId) return res.status(400).json({ error: 'commentId 필요' });

        const { data: comment } = await supabase.from('playground_comments').select('post_id, parent_id').eq('id', commentId).single();
        if (!comment) return res.status(404).json({ error: '댓글 없음' });

        // 답글 삭제 (부모 댓글인 경우)
        if (!comment.parent_id) {
          const { data: childIds } = await supabase.from('playground_comments').select('id').eq('parent_id', commentId);
          if (childIds && childIds.length > 0) {
            const ids = childIds.map((c: any) => c.id);
            await supabase.from('playground_comment_likes').delete().in('comment_id', ids);
            await supabase.from('playground_comments').delete().in('id', ids);
          }
        }

        await supabase.from('playground_comment_likes').delete().eq('comment_id', commentId);
        await supabase.from('playground_comments').delete().eq('id', commentId);

        // comment_count 감소
        const { data: post } = await supabase.from('playground_posts').select('comment_count').eq('id', comment.post_id).single();
        if (post) {
          await supabase.from('playground_posts').update({ comment_count: Math.max(0, (post.comment_count || 0) - 1) }).eq('id', comment.post_id);
        }

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/playground] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
