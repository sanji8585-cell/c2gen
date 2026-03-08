export interface PlaygroundEquippedItem {
  id: string;
  name: string;
  emoji: string;
  rarity: string;
}

export interface PlaygroundEquippedItems {
  title: PlaygroundEquippedItem | null;
  badges: PlaygroundEquippedItem[];
  frame: PlaygroundEquippedItem | null;
}

export interface PlaygroundPost {
  id: string;
  email: string;
  projectId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  caption: string;
  thumbnail: string | null;
  topic: string;
  sceneCount: number;
  likeCount: number;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  liked?: boolean;
  bookmarked?: boolean;
  equipped?: PlaygroundEquippedItems;
  videoUrl?: string | null;
  tags?: string[];
  authorLevel?: number;
}

export interface PlaygroundFeedResponse {
  posts: PlaygroundPost[];
  nextCursor: string | null;
}

export interface PlaygroundAsset {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;
  imageUrl: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
  subtitleData: any;
  customDuration?: number;
  videoData: string | null;
  videoDuration: number | null;
  zoomEffect: string;
  transition: string;
}

export interface PostDetailResponse {
  post: PlaygroundPost;
  assets: PlaygroundAsset[];
  liked: boolean;
  bookmarked: boolean;
  sceneGap: number;
  equipped?: PlaygroundEquippedItems;
}

export interface PlaygroundComment {
  id: string;
  post_id: string;
  email: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  liked?: boolean;
  equipped?: PlaygroundEquippedItems;
  author_level?: number;
}

export interface CommentsResponse {
  comments: PlaygroundComment[];
  replies: Record<string, PlaygroundComment[]>;
  nextCursor: string | null;
  likedCommentIds: string[];
}

export interface AuthorProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  postCount: number;
  totalLikes: number;
  equipped: PlaygroundEquippedItems;
}

// ── API 호출 헬퍼 ──

async function callPlaygroundAPI(action: string, params: Record<string, any> = {}): Promise<any> {
  const token = localStorage.getItem('c2gen_session_token');
  const res = await fetch('/api/playground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: token || undefined, ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API 오류: ${res.status}`);
  }
  return res.json();
}

function mapPost(raw: any, liked?: boolean, bookmarked?: boolean): PlaygroundPost {
  return {
    id: raw.id,
    email: raw.email,
    projectId: raw.project_id,
    authorName: raw.author_name,
    authorAvatarUrl: raw.author_avatar_url,
    caption: raw.caption,
    thumbnail: raw.thumbnail,
    topic: raw.topic,
    sceneCount: raw.scene_count,
    likeCount: raw.like_count,
    viewCount: raw.view_count || 0,
    commentCount: raw.comment_count || 0,
    createdAt: raw.created_at,
    liked,
    bookmarked,
    equipped: raw.equipped || undefined,
    videoUrl: raw.video_url || null,
    tags: raw.tags || [],
    authorLevel: raw.author_level || 1,
  };
}

// ── 피드 조회 ──

export interface FeedParams {
  sort?: 'latest' | 'popular';
  cursor?: string | null;
  limit?: number;
  search?: string;
  tag?: string;
  authorEmail?: string;
}

export async function getPlaygroundFeed(
  params: FeedParams = {}
): Promise<PlaygroundFeedResponse> {
  const { sort = 'latest', cursor, limit = 12, search, tag, authorEmail } = params;
  const data = await callPlaygroundAPI('feed', {
    sort, cursor, limit,
    search: search || undefined,
    tag: tag || undefined,
    authorEmail: authorEmail || undefined,
  });
  const likedSet = new Set<string>(data.likedPostIds || []);
  const bookmarkedSet = new Set<string>(data.bookmarkedPostIds || []);
  const posts = (data.posts || []).map((p: any) => mapPost(p, likedSet.has(p.id), bookmarkedSet.has(p.id)));
  return { posts, nextCursor: data.nextCursor };
}

// ── 프로젝트 공유 ──

export async function shareToPlayground(projectId: string, caption: string, tags: string[] = []): Promise<PlaygroundPost> {
  const data = await callPlaygroundAPI('share', { projectId, caption, tags });
  return mapPost(data.post, false, false);
}

// ── 게시물 삭제 ──

export async function deletePlaygroundPost(postId: string): Promise<void> {
  await callPlaygroundAPI('delete', { postId });
}

// ── 좋아요 토글 ──

export async function toggleLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return callPlaygroundAPI('like', { postId });
}

// ── 북마크 토글 ──

export async function toggleBookmark(postId: string): Promise<{ bookmarked: boolean }> {
  return callPlaygroundAPI('bookmark', { postId });
}

// ── 조회수 증가 ──

export async function incrementView(postId: string): Promise<void> {
  callPlaygroundAPI('view', { postId }).catch(() => {});
}

// ── 신고 ──

export async function reportPost(postId: string, reason: string): Promise<void> {
  await callPlaygroundAPI('report', { postId, reason });
}

// ── 댓글 목록 ──

export async function getComments(postId: string, cursor?: string | null): Promise<CommentsResponse> {
  return callPlaygroundAPI('comments', { postId, cursor });
}

// ── 댓글 작성 ──

export async function addComment(postId: string, content: string, parentId?: string): Promise<{ comment: PlaygroundComment; commentCount: number }> {
  const data = await callPlaygroundAPI('addComment', { postId, content, parentId });
  return { comment: data.comment, commentCount: data.commentCount };
}

// ── 댓글 삭제 ──

export async function deleteComment(commentId: string): Promise<{ commentCount: number }> {
  const data = await callPlaygroundAPI('deleteComment', { commentId });
  return { commentCount: data.commentCount };
}

// ── 댓글 좋아요 토글 ──

export async function toggleCommentLike(commentId: string): Promise<{ liked: boolean; likeCount: number }> {
  return callPlaygroundAPI('likeComment', { commentId });
}

// ── 게시물 상세 ──

export async function getPostDetail(postId: string): Promise<PostDetailResponse> {
  const data = await callPlaygroundAPI('detail', { postId });
  return {
    post: mapPost(data.post, data.liked, data.bookmarked),
    assets: data.assets || [],
    liked: data.liked,
    bookmarked: data.bookmarked || false,
    sceneGap: data.sceneGap ?? 0.3,
    equipped: data.equipped || undefined,
  };
}

// ── 작성자 프로필 ──

export async function getAuthorProfile(authorEmail: string): Promise<AuthorProfile> {
  const data = await callPlaygroundAPI('author-posts', { authorEmail });
  return data.author;
}

// ── 알림 ──

export interface PlaygroundNotification {
  id: string;
  actor_email: string;
  actor_name: string;
  type: 'like' | 'comment' | 'reply';
  post_id: string | null;
  comment_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export async function getNotifications(): Promise<{ notifications: PlaygroundNotification[]; unreadCount: number }> {
  return callPlaygroundAPI('notifications');
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await callPlaygroundAPI('markNotificationsRead', { ids });
}
