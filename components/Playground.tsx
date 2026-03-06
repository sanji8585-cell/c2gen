import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SavedProject, GeneratedAsset } from '../types';
import {
  getPlaygroundFeed,
  shareToPlayground,
  deletePlaygroundPost,
  toggleLike,
  getPostDetail,
  type PlaygroundPost,
  type PostDetailResponse,
  type PlaygroundEquippedItem,
  type PlaygroundEquippedItems,
} from '../services/playgroundService';
import PreviewPlayer from './PreviewPlayer';

// ── 레어리티 색상 (InventoryModal과 동일) ──
const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

interface PlaygroundProps {
  isAuthenticated: boolean;
  onShowAuthModal: () => void;
  savedProjects: SavedProject[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

const Playground: React.FC<PlaygroundProps> = ({ isAuthenticated, onShowAuthModal, savedProjects }) => {
  const [posts, setPosts] = useState<PlaygroundPost[]>([]);
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 공유 모달
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareProjectId, setShareProjectId] = useState('');
  const [shareCaption, setShareCaption] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareProgress, setShareProgress] = useState('');
  const shareAbortRef = useRef({ current: false });

  // 상세 모달
  const [detailData, setDetailData] = useState<PostDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 현재 유저 email (내 게시물 판별)
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // 유저 email 조회
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('c2gen_session_token');
    if (!token) return;
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getProfile', token }),
    })
      .then(r => r.json())
      .then(d => { if (d.email) setUserEmail(d.email); })
      .catch(() => {});
  }, [isAuthenticated]);

  // 피드 로드
  const loadFeed = useCallback(async (resetCursor = true) => {
    try {
      if (resetCursor) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const cursor = resetCursor ? null : nextCursor;
      const result = await getPlaygroundFeed(sort, cursor);

      if (resetCursor) {
        setPosts(result.posts);
      } else {
        setPosts(prev => [...prev, ...result.posts]);
      }
      setNextCursor(result.nextCursor);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, nextCursor]);

  // 정렬 변경 or 최초 로드
  useEffect(() => {
    loadFeed(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // 좋아요 토글
  const handleLike = useCallback(async (postId: string) => {
    if (!isAuthenticated) { onShowAuthModal(); return; }

    // Optimistic UI
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const newLiked = !p.liked;
      return { ...p, liked: newLiked, likeCount: p.likeCount + (newLiked ? 1 : -1) };
    }));

    try {
      const result = await toggleLike(postId);
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked: result.liked, likeCount: result.likeCount } : p
      ));
      // 상세 모달 열려있으면 업데이트
      if (detailData?.post.id === postId) {
        setDetailData(prev => prev ? {
          ...prev,
          post: { ...prev.post, liked: result.liked, likeCount: result.likeCount },
          liked: result.liked,
        } : null);
      }
    } catch {
      // 롤백
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        const reverted = !p.liked;
        return { ...p, liked: reverted, likeCount: p.likeCount + (reverted ? 1 : -1) };
      }));
    }
  }, [isAuthenticated, onShowAuthModal, detailData]);

  // 삭제
  const handleDelete = useCallback(async (postId: string) => {
    if (!confirm('이 게시물을 삭제하시겠습니까?')) return;
    try {
      await deletePlaygroundPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (detailData?.post.id === postId) setDetailData(null);
    } catch (e: any) {
      alert(e.message);
    }
  }, [detailData]);

  // 공유 (렌더링 → 업로드 → DB 저장)
  const handleShare = useCallback(async () => {
    if (!shareProjectId) { setShareError('프로젝트를 선택해주세요.'); return; }
    setSharing(true);
    setShareError(null);
    setShareProgress('공유 준비 중...');
    shareAbortRef.current = { current: false };

    try {
      console.log('[Share] Step 0: start');
      const token = localStorage.getItem('c2gen_session_token');
      console.log('[Share] Step 1: token ok');

      // 1) DB에 게시물 먼저 생성 (직접 fetch)
      setShareProgress('게시물 생성 중...');
      console.log('[Share] Step 2: calling share API');
      const shareRes = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share', token, projectId: shareProjectId, caption: shareCaption }),
      });
      if (!shareRes.ok) {
        const err = await shareRes.json().catch(() => ({ error: shareRes.statusText }));
        throw new Error(err.error || `공유 실패: ${shareRes.status}`);
      }
      console.log('[Share] Step 3: share API response ok');
      const shareData = await shareRes.json();
      console.log('[Share] Step 4: parsed share response', shareData?.post?.id);
      const newPost: PlaygroundPost = {
        id: shareData.post.id,
        email: shareData.post.email,
        projectId: shareData.post.project_id,
        authorName: shareData.post.author_name,
        authorAvatarUrl: shareData.post.author_avatar_url,
        caption: shareData.post.caption,
        thumbnail: shareData.post.thumbnail,
        topic: shareData.post.topic,
        sceneCount: shareData.post.scene_count,
        likeCount: shareData.post.like_count || 0,
        createdAt: shareData.post.created_at,
        liked: false,
        videoUrl: null,
      };

      console.log('[Share] Step 5: newPost created');
      // 2) 프로젝트 에셋 로드 (직접 fetch)
      setShareProgress('프로젝트 에셋 로딩 중...');
      const detailRes = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detail', token, postId: newPost.id }),
      });
      let sceneGap = 0.3;
      let assets: GeneratedAsset[] = [];
      if (detailRes.ok) {
        const detailData2 = await detailRes.json();
        sceneGap = detailData2.sceneGap ?? 0.3;
        assets = (detailData2.assets || [])
          .filter((a: any) => a.imageUrl)
          .map((a: any) => ({
            sceneNumber: a.sceneNumber,
            narration: a.narration,
            visualPrompt: a.visualPrompt,
            imageData: a.imageUrl,
            imageUrl: a.imageUrl,
            audioData: null,
            audioUrl: a.audioUrl,
            audioDuration: a.audioDuration,
            subtitleData: a.subtitleData,
            customDuration: a.customDuration,
            videoData: a.videoData,
            videoDuration: a.videoDuration,
            zoomEffect: a.zoomEffect || 'zoomIn',
            transition: a.transition || 'none',
            status: 'completed' as const,
          })) as GeneratedAsset[];
      }

      console.log('[Share] Step 6: assets loaded, count=', assets.length);
      if (assets.length > 0) {
        // 3) 경량 MP4 렌더링 (720p, 2.5Mbps)
        setShareProgress('영상 렌더링 중...');
        const { generateVideo } = await import('../services/videoService');
        const result = await generateVideo(
          assets,
          (msg) => setShareProgress(msg),
          shareAbortRef.current,
          { resolution: '720p', bitrateOverride: 2_500_000, sceneGap, enableSubtitles: true }
        );

        if (result?.videoBlob) {
          const sizeMB = (result.videoBlob.size / 1024 / 1024).toFixed(1);
          setShareProgress(`영상 업로드 중... (${sizeMB}MB)`);

          // 1) 서명된 업로드 URL 획득
          const urlRes = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-playground-upload-url', token, postId: newPost.id }),
          });
          if (urlRes.ok) {
            const { uploadUrl, token: uploadToken, publicUrl } = await urlRes.json();

            // 2) Supabase Storage에 바이너리 직접 업로드 (Vercel 4.5MB 제한 우회)
            const directUpload = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                ...(uploadToken ? { 'x-upsert': 'true' } : {}),
              },
              body: result.videoBlob,
            });

            if (directUpload.ok) {
              // 3) DB에 video_url 저장
              await fetch('/api/storage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm-playground-video', token, postId: newPost.id, publicUrl }),
              });
              newPost.videoUrl = publicUrl;
            }
          }
        }
      }

      setPosts(prev => [newPost, ...prev]);
      setShowShareModal(false);
      setShareProjectId('');
      setShareCaption('');
      setShareProgress('');
      // 공유 퀘스트 진행
      try {
        const tkn = localStorage.getItem('c2gen_session_token');
        if (tkn) {
          fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'game-recordAction', token: tkn, actionType: 'share_project', count: 1 }) }).catch(() => {});
        }
      } catch {};
    } catch (e: any) {
      console.error('[Playground Share Error]', e);
      setShareError(`[${e.name}] ${e.message}`);
      setShareProgress('');
    } finally {
      setSharing(false);
    }
  }, [shareProjectId, shareCaption]);

  // 상세 보기
  const handleOpenDetail = useCallback(async (postId: string) => {
    setDetailLoading(true);
    setDetailData(null);
    try {
      const data = await getPostDetail(postId);
      setDetailData(data);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 소개 */}
      <div className="mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          다른 사용자들이 만든 AI 영상을 구경하고, 내 프로젝트도 공유해보세요.
        </p>
      </div>

      {/* 상단 바 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          {(['latest', 'popular'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: sort === s ? 'var(--brand-500)' : 'transparent',
                color: sort === s ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {s === 'latest' ? '최신순' : '인기순'}
            </button>
          ))}
        </div>

        {isAuthenticated ? (
          <button onClick={() => setShowShareModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            내 프로젝트 공유
          </button>
        ) : (
          <button onClick={onShowAuthModal}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            로그인하고 공유하기
          </button>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="text-center py-4">
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          <button onClick={() => loadFeed(true)} className="mt-2 text-xs underline" style={{ color: 'var(--text-muted)' }}>다시 시도</button>
        </div>
      )}

      {/* 스켈레톤 로딩 */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && !error && posts.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <svg className="w-8 h-8" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>아직 공유된 프로젝트가 없어요</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>첫 번째로 프로젝트를 공유해보세요!</p>
        </div>
      )}

      {/* 피드 그리드 */}
      {!loading && posts.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isMine={post.email === userEmail}
                onLike={() => handleLike(post.id)}
                onDelete={() => handleDelete(post.id)}
                onClick={() => handleOpenDetail(post.id)}
              />
            ))}
          </div>

          {/* 더 보기 */}
          {nextCursor && (
            <div className="text-center mt-8">
              <button onClick={() => loadFeed(false)} disabled={loadingMore}
                className="px-8 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                {loadingMore ? '로딩 중...' : '더 보기'}
              </button>
            </div>
          )}
        </>
      )}

      {/* 공유 모달 */}
      {showShareModal && (
        <ShareModal
          projects={savedProjects}
          projectId={shareProjectId}
          caption={shareCaption}
          sharing={sharing}
          progress={shareProgress}
          error={shareError}
          onSelectProject={setShareProjectId}
          onChangeCaption={setShareCaption}
          onSubmit={handleShare}
          onClose={() => { if (!sharing) { setShowShareModal(false); setShareError(null); setShareProgress(''); } }}
        />
      )}

      {/* 상세 모달 */}
      {(detailData || detailLoading) && (
        <DetailModal
          data={detailData}
          loading={detailLoading}
          isMine={detailData?.post.email === userEmail}
          isAuthenticated={isAuthenticated}
          onLike={() => detailData && handleLike(detailData.post.id)}
          onDelete={() => detailData && handleDelete(detailData.post.id)}
          onClose={() => setDetailData(null)}
          onShowAuthModal={onShowAuthModal}
        />
      )}
    </div>
  );
};

// ── 포스트 카드 ──

const PostCard: React.FC<{
  post: PlaygroundPost;
  isMine: boolean;
  onLike: () => void;
  onDelete: () => void;
  onClick: () => void;
}> = ({ post, isMine, onLike, onDelete, onClick }) => (
  <div
    className="rounded-xl border overflow-hidden transition-all hover:shadow-lg hover:scale-[1.01] cursor-pointer relative group"
    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
  >
    {/* 썸네일 */}
    <div className="relative" style={{ aspectRatio: '16/9' }} onClick={onClick}>
      {post.thumbnail ? (
        <img src={`data:image/jpeg;base64,${post.thumbnail}`} alt={post.topic} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
        </div>
      )}
      {/* 재생 아이콘 (영상이 있는 게시물) */}
      {post.videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
            <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
      {/* 씬 수 배지 */}
      {post.sceneCount > 0 && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          {post.sceneCount}씬
        </div>
      )}
    </div>

    {/* 삭제 버튼 (내 게시물) */}
    {isMine && (
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
        title="삭제"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )}

    {/* 하단 정보 */}
    <div className="p-3">
      {/* 작성자 */}
      <div className="flex items-center gap-2 mb-2">
        <FramedAvatar name={post.authorName} url={post.authorAvatarUrl} size={28} frame={post.equipped?.frame} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{post.authorName}</p>
            {post.equipped?.badges && post.equipped.badges.length > 0 && (
              <BadgeIcons badges={post.equipped.badges} compact />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.createdAt)}</p>
            {post.equipped?.title && <TitleBadge title={post.equipped.title} compact />}
          </div>
        </div>
      </div>

      {/* 주제 */}
      {post.topic && (
        <p className="text-xs font-medium mb-1 truncate" style={{ color: 'var(--text-primary)' }}>{post.topic}</p>
      )}

      {/* 캡션 */}
      {post.caption && (
        <p className="text-[11px] line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>{post.caption}</p>
      )}

      {/* 좋아요 */}
      <button
        onClick={e => { e.stopPropagation(); onLike(); }}
        className="flex items-center gap-1.5 transition-all hover:scale-105"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={post.liked ? '#ef4444' : 'none'} stroke={post.liked ? '#ef4444' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
        <span className="text-xs font-medium" style={{ color: post.liked ? '#ef4444' : 'var(--text-muted)' }}>
          {post.likeCount > 0 ? post.likeCount : ''}
        </span>
      </button>
    </div>
  </div>
);

// ── 아바타 ──

const Avatar: React.FC<{ name: string; url: string | null; size: number }> = ({ name, url, size }) => {
  const initials = name.slice(0, 1).toUpperCase();
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: 'var(--brand-500)' }}>
      {initials}
    </div>
  );
};

// ── 프레임 아바타 (등급별 효과) ──

const FramedAvatar: React.FC<{
  name: string;
  url: string | null;
  size: number;
  frame?: PlaygroundEquippedItem | null;
}> = ({ name, url, size, frame }) => {
  const rarity = frame?.rarity as string | undefined;
  const color = rarity ? RARITY_COLORS[rarity] || null : null;
  if (!color || !rarity) return <Avatar name={name} url={url} size={size} />;

  const borderW = size >= 36 ? 2.5 : 2;
  const innerSize = size - borderW * 2;

  // 전설: 회전 conic-gradient 테두리 + 스파클
  if (rarity === 'legendary') {
    const ringPad = borderW + 1;
    const outerSize = size + ringPad * 2;
    return (
      <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: outerSize, height: outerSize }} title={frame?.name}>
        <div className="absolute inset-0 rounded-full frame-legendary-ring frame-animated" style={{ background: 'conic-gradient(from var(--frame-angle, 0deg), #ef4444, #f59e0b, #ec4899, #8b5cf6, #ef4444)', animation: 'frame-legendary-spin 3s linear infinite', opacity: 0.7 }} />
        <div className="absolute rounded-full frame-animated" style={{ inset: ringPad - borderW, animation: 'frame-legendary-glow 2s ease-in-out infinite' }} />
        <div className="absolute frame-animated" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#fbbf24', top: 0, left: '50%', transform: 'translateX(-50%)', animation: 'frame-legendary-sparkle 2s ease-in-out infinite' }} />
        <div className="absolute frame-animated" style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#ec4899', bottom: 1, right: 2, animation: 'frame-legendary-sparkle 2s ease-in-out infinite 0.7s' }} />
        <div className="relative rounded-full overflow-hidden z-10" style={{ width: size, height: size }}>
          <Avatar name={name} url={url} size={size} />
        </div>
      </div>
    );
  }

  // 영웅: 금빛 글로우 맥동
  if (rarity === 'epic') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated" style={{ width: size, height: size, border: `${borderW}px solid ${color}`, animation: 'frame-epic-glow 3s ease-in-out infinite' }} title={frame?.name}>
        <Avatar name={name} url={url} size={innerSize} />
      </div>
    );
  }

  // 희귀: 맥동 글로우
  if (rarity === 'rare') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated" style={{ width: size, height: size, border: `${borderW}px solid ${color}`, animation: 'frame-rare-pulse 2s ease-in-out infinite' }} title={frame?.name}>
        <Avatar name={name} url={url} size={innerSize} />
      </div>
    );
  }

  // 고급: 정적 글로우 / 일반: 테두리만
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, border: `${rarity === 'uncommon' ? 2 : 1.5}px solid ${color}`, boxShadow: rarity === 'uncommon' ? `0 0 6px ${color}44, 0 0 12px ${color}22` : undefined }} title={frame?.name}>
      <Avatar name={name} url={url} size={size - (rarity === 'uncommon' ? 4 : 3)} />
    </div>
  );
};

// ── 칭호 뱃지 (pill) ──

const TitleBadge: React.FC<{ title: PlaygroundEquippedItem; compact?: boolean }> = ({ title, compact = false }) => {
  const color = RARITY_COLORS[title.rarity] || RARITY_COLORS.common;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-medium leading-none ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      }`}
      style={{
        backgroundColor: `${color}15`,
        color: color,
        border: `1px solid ${color}30`,
      }}
      title={title.name}
    >
      <span>{title.emoji}</span>
      <span className={compact ? 'max-w-[60px] truncate' : ''}>{title.name}</span>
    </span>
  );
};

// ── 뱃지 아이콘 (최대 3개) ──

const BadgeIcons: React.FC<{ badges: PlaygroundEquippedItem[]; compact?: boolean }> = ({ badges, compact = false }) => {
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {badges.slice(0, 3).map(badge => (
        <span
          key={badge.id}
          className={`rounded-full flex items-center justify-center ${
            compact ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-xs'
          }`}
          style={{
            backgroundColor: `${RARITY_COLORS[badge.rarity] || RARITY_COLORS.common}15`,
            border: `1px solid ${RARITY_COLORS[badge.rarity] || RARITY_COLORS.common}25`,
          }}
          title={badge.name}
        >
          {badge.emoji}
        </span>
      ))}
    </span>
  );
};

// ── 공유 모달 ──

const ShareModal: React.FC<{
  projects: SavedProject[];
  projectId: string;
  caption: string;
  sharing: boolean;
  progress: string;
  error: string | null;
  onSelectProject: (id: string) => void;
  onChangeCaption: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}> = ({ projects, projectId, caption, sharing, progress, error, onSelectProject, onChangeCaption, onSubmit, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
    <div className="w-full max-w-md rounded-2xl border p-5 space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>놀이터에 공유</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        선택한 프로젝트가 놀이터 피드에 공개됩니다. 다른 사용자들이 내 작품을 감상하고 좋아요를 누를 수 있어요.
      </p>

      {/* 프로젝트 선택 */}
      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>공유할 프로젝트</label>
        {projects.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>저장된 프로젝트가 없습니다. 먼저 프로젝트를 저장해주세요.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border p-1" style={{ borderColor: 'var(--border-default)', scrollbarWidth: 'thin' }}>
            {projects.map(p => (
              <button key={p.id} onClick={() => onSelectProject(p.id)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all ${projectId === p.id ? 'ring-2' : 'hover:bg-white/5'}`}
                style={{
                  backgroundColor: projectId === p.id ? 'color-mix(in srgb, var(--brand-500) 15%, transparent)' : 'transparent',
                  ringColor: 'var(--brand-400)',
                }}
              >
                {p.thumbnail ? (
                  <img src={`data:image/jpeg;base64,${p.thumbnail}`} alt="" className="w-12 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-8 rounded flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <svg className="w-4 h-4 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{p.topic}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 캡션 */}
      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>한마디 (선택)</label>
        <textarea
          value={caption}
          onChange={e => onChangeCaption(e.target.value.slice(0, 200))}
          placeholder="프로젝트에 대해 한마디..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg text-sm border resize-none focus:outline-none"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        />
        <p className="text-[10px] text-right mt-0.5" style={{ color: 'var(--text-muted)' }}>{caption.length}/200</p>
      </div>

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

      {sharing && progress && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="w-5 h-5 border-2 rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{progress}</p>
        </div>
      )}

      <button onClick={onSubmit} disabled={sharing || projects.length === 0}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        style={{ background: sharing ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: sharing ? 'var(--text-muted)' : '#fff' }}
      >
        {sharing ? '영상 준비 중...' : '공유하기'}
      </button>
    </div>
  </div>
);

// ── 스켈레톤 카드 ──

const SkeletonCard: React.FC = () => (
  <div className="rounded-xl border overflow-hidden"
    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
  >
    <div className="animate-pulse" style={{ aspectRatio: '16/9', backgroundColor: 'var(--bg-elevated)' }} />
    <div className="p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-20 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
          <div className="h-2 w-12 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        </div>
      </div>
      <div className="h-3 w-3/4 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
      <div className="h-2.5 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
    </div>
  </div>
);

// ── 상세 모달 (PreviewPlayer 임베드) ──

const DetailModal: React.FC<{
  data: PostDetailResponse | null;
  loading: boolean;
  isMine: boolean;
  isAuthenticated: boolean;
  onLike: () => void;
  onDelete: () => void;
  onClose: () => void;
  onShowAuthModal: () => void;
}> = ({ data, loading, isMine, isAuthenticated, onLike, onDelete, onClose, onShowAuthModal }) => {
  // API 에셋 → PreviewPlayer 호환 GeneratedAsset 변환
  const playerAssets = useMemo<GeneratedAsset[]>(() => {
    if (!data?.assets) return [];
    return data.assets
      .filter(a => a.imageUrl)
      .map(a => ({
        sceneNumber: a.sceneNumber,
        narration: a.narration,
        visualPrompt: a.visualPrompt,
        imageData: a.imageUrl,
        imageUrl: a.imageUrl,
        audioData: null,
        audioUrl: a.audioUrl,
        audioDuration: a.audioDuration,
        subtitleData: a.subtitleData,
        customDuration: a.customDuration,
        videoData: a.videoData,
        videoDuration: a.videoDuration,
        zoomEffect: a.zoomEffect as any,
        transition: a.transition as any,
        status: 'completed' as const,
      })) as GeneratedAsset[];
  }, [data?.assets]);

  // 장착 아이템: detail API 응답 우선, 없으면 post에서
  const detailEquipped = data?.equipped || data?.post.equipped;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', scrollbarWidth: 'thin' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {data?.post.topic || '게시물 상세'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {data && (
          <div className="p-4 space-y-4">
            {/* 영상 플레이어: video_url이 있으면 네이티브 재생, 없으면 PreviewPlayer 폴백 */}
            {data.post.videoUrl ? (
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#000' }}>
                <video
                  src={data.post.videoUrl}
                  controls
                  autoPlay
                  preload="metadata"
                  className="w-full max-h-[60vh]"
                  style={{ display: 'block', margin: '0 auto' }}
                />
              </div>
            ) : playerAssets.length > 0 ? (
              <PreviewPlayer
                assets={playerAssets}
                sceneGap={data.sceneGap}
                onClose={onClose}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>프로젝트가 삭제되었거나 에셋을 불러올 수 없습니다.</p>
              </div>
            )}

            {/* 작성자 + 캡션 */}
            <div className="flex items-center gap-3">
              <FramedAvatar name={data.post.authorName} url={data.post.authorAvatarUrl} size={36} frame={detailEquipped?.frame} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{data.post.authorName}</p>
                  {detailEquipped?.badges && detailEquipped.badges.length > 0 && (
                    <BadgeIcons badges={detailEquipped.badges} />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(data.post.createdAt)}</p>
                  {detailEquipped?.title && <TitleBadge title={detailEquipped.title} />}
                </div>
              </div>
              {isMine && (
                <button onClick={onDelete} className="px-3 py-1 text-xs rounded-lg transition-all hover:bg-red-500/20"
                  style={{ color: '#f87171' }}>
                  삭제
                </button>
              )}
            </div>

            {data.post.caption && (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{data.post.caption}</p>
            )}

            {/* 좋아요 */}
            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                onClick={() => isAuthenticated ? onLike() : onShowAuthModal()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: data.liked ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)' }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill={data.liked ? '#ef4444' : 'none'} stroke={data.liked ? '#ef4444' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: data.liked ? '#ef4444' : 'var(--text-secondary)' }}>
                  {data.post.likeCount > 0 ? data.post.likeCount : '좋아요'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Playground;
