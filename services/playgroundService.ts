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
  createdAt: string;
  liked?: boolean;
  equipped?: PlaygroundEquippedItems;
  videoUrl?: string | null;
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
  sceneGap: number;
  equipped?: PlaygroundEquippedItems;
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

function mapPost(raw: any, liked?: boolean): PlaygroundPost {
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
    createdAt: raw.created_at,
    liked,
    equipped: raw.equipped || undefined,
    videoUrl: raw.video_url || null,
  };
}

// ── 피드 조회 ──

export async function getPlaygroundFeed(
  sort: 'latest' | 'popular' = 'latest',
  cursor: string | null = null,
  limit: number = 12
): Promise<PlaygroundFeedResponse> {
  const data = await callPlaygroundAPI('feed', { sort, cursor, limit });
  const likedSet = new Set<string>(data.likedPostIds || []);
  const posts = (data.posts || []).map((p: any) => mapPost(p, likedSet.has(p.id)));
  return { posts, nextCursor: data.nextCursor };
}

// ── 프로젝트 공유 ──

export async function shareToPlayground(projectId: string, caption: string): Promise<PlaygroundPost> {
  const data = await callPlaygroundAPI('share', { projectId, caption });
  return mapPost(data.post, false);
}

// ── 게시물 삭제 ──

export async function deletePlaygroundPost(postId: string): Promise<void> {
  await callPlaygroundAPI('delete', { postId });
}

// ── 좋아요 토글 ──

export async function toggleLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return callPlaygroundAPI('like', { postId });
}

// ── 게시물 상세 ──

export async function getPostDetail(postId: string): Promise<PostDetailResponse> {
  const data = await callPlaygroundAPI('detail', { postId });
  return {
    post: mapPost(data.post, data.liked),
    assets: data.assets || [],
    liked: data.liked,
    sceneGap: data.sceneGap ?? 0.3,
    equipped: data.equipped || undefined,
  };
}
