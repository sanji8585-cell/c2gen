import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedProject, GeneratedAsset } from '../types';
import {
  getPlaygroundFeed,
  shareToPlayground,
  deletePlaygroundPost,
  toggleLike,
  toggleBookmark,
  toggleCommentLike,
  getPostDetail,
  getComments,
  addComment,
  deleteComment,
  reportPost,
  incrementView,
  getAuthorProfile,
  type PlaygroundPost,
  type PlaygroundComment,
  type PostDetailResponse,
  type CommentsResponse,
  type PlaygroundEquippedItem,
  type PlaygroundEquippedItems,
  type AuthorProfile,
} from '../services/playgroundService';
import PreviewPlayer from './PreviewPlayer';

// ── 레어리티 색상 ──
const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  epic: '#f59e0b',
  legendary: '#ef4444',
};

const REPORT_REASONS = [
  { key: 'spam', ko: '스팸/광고', en: 'Spam/Ads', ja: 'スパム/広告' },
  { key: 'inappropriate', ko: '부적절한 콘텐츠', en: 'Inappropriate content', ja: '不適切なコンテンツ' },
  { key: 'copyright', ko: '저작권 침해', en: 'Copyright violation', ja: '著作権侵害' },
  { key: 'hate', ko: '혐오/차별', en: 'Hate/Discrimination', ja: 'ヘイト/差別' },
  { key: 'other', ko: '기타', en: 'Other', ja: 'その他' },
];

interface PlaygroundProps {
  isAuthenticated: boolean;
  onShowAuthModal: () => void;
  savedProjects: SavedProject[];
}

function timeAgo(dateStr: string, t: (key: string, opts?: any) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('playground.ago.justNow');
  if (min < 60) return t('playground.ago.minutes', { count: min });
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return t('playground.ago.hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('playground.ago.days', { count: days });
  return t('playground.ago.months', { count: Math.floor(days / 30) });
}

type FeedFilter = 'all' | 'bookmarked';

const Playground: React.FC<PlaygroundProps> = ({ isAuthenticated, onShowAuthModal, savedProjects }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'ko') as 'ko' | 'en' | 'ja';
  const [posts, setPosts] = useState<PlaygroundPost[]>([]);
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 태그 필터
  const [activeTag, setActiveTag] = useState('');

  // 작성자 필터
  const [authorFilter, setAuthorFilter] = useState('');
  const [authorFilterName, setAuthorFilterName] = useState('');

  // 공유 모달
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareProjectId, setShareProjectId] = useState('');
  const [shareCaption, setShareCaption] = useState('');
  const [shareTags, setShareTags] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareProgress, setShareProgress] = useState('');
  const shareAbortRef = useRef({ current: false });

  // 상세 모달
  const [detailData, setDetailData] = useState<PostDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 신고 모달
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  // 작성자 프로필 팝업
  const [authorProfile, setAuthorProfile] = useState<AuthorProfile | null>(null);
  const [authorProfileLoading, setAuthorProfileLoading] = useState(false);

  // 현재 유저 email
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // 무한 스크롤 sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 딥링크: URL에서 ?post=xxx 파라미터 읽기
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('post');
    if (postId) {
      handleOpenDetail(postId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const result = await getPlaygroundFeed({
        sort,
        cursor,
        search: activeSearch || undefined,
        tag: activeTag || undefined,
        authorEmail: authorFilter || undefined,
      });

      let newPosts = result.posts;

      // 북마크 필터 (클라이언트 측)
      if (feedFilter === 'bookmarked') {
        newPosts = newPosts.filter(p => p.bookmarked);
      }

      if (resetCursor) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      setNextCursor(result.nextCursor);

      // 영상 URL 프리로드
      result.posts.forEach(p => {
        if (p.videoUrl) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'video';
          link.href = p.videoUrl;
          link.crossOrigin = 'anonymous';
          if (!document.querySelector(`link[href="${p.videoUrl}"]`)) {
            document.head.appendChild(link);
          }
        }
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, nextCursor, activeSearch, activeTag, authorFilter, feedFilter]);

  // 정렬/필터 변경 시 리로드
  useEffect(() => {
    loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, activeSearch, activeTag, authorFilter, feedFilter]);

  // 검색 디바운스
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setActiveSearch(val.trim());
    }, 500);
  };

  // 무한 스크롤 IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) {
          loadFeed(false);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, loading, loadFeed]);

  // 좋아요 토글
  const handleLike = useCallback(async (postId: string) => {
    if (!isAuthenticated) { onShowAuthModal(); return; }

    // Optimistic UI — 피드 + 상세 모달 모두 즉시 반영
    const optimisticUpdate = (liked: boolean, delta: number) => {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked, likeCount: p.likeCount + delta } : p
      ));
      setDetailData(prev => {
        if (!prev || prev.post.id !== postId) return prev;
        return {
          ...prev,
          post: { ...prev.post, liked, likeCount: prev.post.likeCount + delta },
          liked,
        };
      });
    };

    // 현재 상태 파악 (피드 or 상세에서)
    const currentPost = posts.find(p => p.id === postId) || detailData?.post;
    const wasLiked = currentPost?.liked ?? false;
    const newLiked = !wasLiked;

    optimisticUpdate(newLiked, newLiked ? 1 : -1);

    try {
      const result = await toggleLike(postId);
      // 서버 결과로 보정 (count가 다를 수 있음)
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked: result.liked, likeCount: result.likeCount } : p
      ));
      setDetailData(prev => {
        if (!prev || prev.post.id !== postId) return prev;
        return {
          ...prev,
          post: { ...prev.post, liked: result.liked, likeCount: result.likeCount },
          liked: result.liked,
        };
      });
    } catch {
      // 롤백
      optimisticUpdate(wasLiked, wasLiked ? 1 : -1);
    }
  }, [isAuthenticated, onShowAuthModal, posts, detailData]);

  // 북마크 토글
  const handleBookmark = useCallback(async (postId: string) => {
    if (!isAuthenticated) { onShowAuthModal(); return; }

    const currentPost = posts.find(p => p.id === postId) || detailData?.post;
    const wasBookmarked = currentPost?.bookmarked ?? false;
    const newBookmarked = !wasBookmarked;

    // Optimistic — 피드 + 상세 모두
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, bookmarked: newBookmarked } : p
    ));
    setDetailData(prev => {
      if (!prev || prev.post.id !== postId) return prev;
      return { ...prev, post: { ...prev.post, bookmarked: newBookmarked }, bookmarked: newBookmarked };
    });

    try {
      const result = await toggleBookmark(postId);
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, bookmarked: result.bookmarked } : p
      ));
      setDetailData(prev => {
        if (!prev || prev.post.id !== postId) return prev;
        return { ...prev, post: { ...prev.post, bookmarked: result.bookmarked }, bookmarked: result.bookmarked };
      });
    } catch {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, bookmarked: wasBookmarked } : p
      ));
      setDetailData(prev => {
        if (!prev || prev.post.id !== postId) return prev;
        return { ...prev, post: { ...prev.post, bookmarked: wasBookmarked }, bookmarked: wasBookmarked };
      });
    }
  }, [isAuthenticated, onShowAuthModal, posts, detailData]);

  // 삭제
  const handleDelete = useCallback(async (postId: string) => {
    if (!confirm(t('playground.deletePost'))) return;
    try {
      await deletePlaygroundPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (detailData?.post.id === postId) setDetailData(null);
    } catch (e: any) {
      alert(e.message);
    }
  }, [detailData, t]);

  // 신고
  const handleReport = useCallback(async () => {
    if (!reportPostId || !reportReason) return;
    setReporting(true);
    try {
      await reportPost(reportPostId, reportReason);
      setReportPostId(null);
      setReportReason('');
      alert(t('playground.reportSuccess'));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReporting(false);
    }
  }, [reportPostId, reportReason, t]);

  // 공유
  const handleShare = useCallback(async () => {
    if (!shareProjectId) { setShareError(t('playground.selectProjectError')); return; }
    setSharing(true);
    setShareError(null);
    setShareProgress(t('playground.progress.preparing'));
    shareAbortRef.current = { current: false };

    try {
      const token = localStorage.getItem('c2gen_session_token');

      // 태그 파싱
      const tags = shareTags
        .split(/[,#\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .slice(0, 5);

      // DB에 게시물 생성
      setShareProgress(t('playground.progress.creating'));
      const shareRes = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share', token, projectId: shareProjectId, caption: shareCaption, tags }),
      });
      if (!shareRes.ok) {
        const err = await shareRes.json().catch(() => ({ error: shareRes.statusText }));
        throw new Error(err.error || `공유 실패: ${shareRes.status}`);
      }
      const shareData = await shareRes.json();
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
        viewCount: 0,
        commentCount: 0,
        createdAt: shareData.post.created_at,
        liked: false,
        bookmarked: false,
        videoUrl: null,
        tags: shareData.post.tags || [],
        authorLevel: shareData.post.author_level || 1,
      };

      // 프로젝트 에셋 로드
      setShareProgress(t('playground.progress.loadingAssets'));
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

      if (assets.length > 0) {
        setShareProgress(t('playground.progress.rendering'));
        const { generateVideo } = await import('../services/videoService');
        const result = await generateVideo(
          assets,
          (msg) => setShareProgress(msg),
          shareAbortRef.current,
          { resolution: '720p', bitrateOverride: 1_500_000, sceneGap, enableSubtitles: true }
        );

        if (result?.videoBlob) {
          const uploadBlob = result.videoBlob;
          const isWebM = uploadBlob.type.includes('webm');
          const ext = isWebM ? 'webm' : 'mp4';
          const contentType = uploadBlob.type || (isWebM ? 'video/webm' : 'video/mp4');

          const sizeMB = (uploadBlob.size / 1024 / 1024).toFixed(1);
          setShareProgress(t('playground.progress.uploading', { size: sizeMB }));

          const urlRes = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-playground-upload-url', token, postId: newPost.id, ext }),
          });
          if (urlRes.ok) {
            const { uploadUrl, publicUrl } = await urlRes.json();

            const directUpload = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': contentType },
              body: uploadBlob,
            });

            if (directUpload.ok) {
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
      setShareTags('');
      setShareProgress('');

      // 공유 퀘스트
      try {
        const tkn = localStorage.getItem('c2gen_session_token');
        if (tkn) {
          fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'game-recordAction', token: tkn, actionType: 'share_project', count: 1 }) }).catch(() => {});
        }
      } catch {}
    } catch (e: any) {
      console.error('[Playground Share Error]', e);
      setShareError(`[${e.name}] ${e.message}`);
      setShareProgress('');
    } finally {
      setSharing(false);
    }
  }, [shareProjectId, shareCaption, shareTags, t]);

  // 상세 보기
  const handleOpenDetail = useCallback(async (postId: string) => {
    // 조회수 증가
    incrementView(postId);

    const feedPost = posts.find(p => p.id === postId);
    if (feedPost?.videoUrl) {
      setDetailData({
        post: { ...feedPost, viewCount: (feedPost.viewCount || 0) + 1 },
        assets: [],
        liked: feedPost.liked ?? false,
        bookmarked: feedPost.bookmarked ?? false,
        sceneGap: 0.3,
        equipped: feedPost.equipped,
      });
      // 피드에서도 조회수 업데이트
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, viewCount: (p.viewCount || 0) + 1 } : p));
      return;
    }

    setDetailLoading(true);
    setDetailData(null);
    try {
      const data = await getPostDetail(postId);
      setDetailData(data);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, viewCount: (p.viewCount || 0) + 1 } : p));
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, [posts]);

  // 딥링크: 상세 열 때 URL 업데이트
  const updateUrlWithPost = (postId: string | null) => {
    const url = new URL(window.location.href);
    if (postId) {
      url.searchParams.set('post', postId);
    } else {
      url.searchParams.delete('post');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // 작성자 프로필 클릭
  const handleAuthorClick = useCallback(async (authorEmail: string, authorName: string) => {
    // 이미 같은 작성자 필터가 걸려있으면 해제
    if (authorFilter === authorEmail) {
      setAuthorFilter('');
      setAuthorFilterName('');
      return;
    }
    setAuthorProfileLoading(true);
    try {
      const profile = await getAuthorProfile(authorEmail);
      setAuthorProfile(profile);
    } catch {
      // 프로필 로드 실패 시 필터만 적용
      setAuthorFilter(authorEmail);
      setAuthorFilterName(authorName);
    } finally {
      setAuthorProfileLoading(false);
    }
  }, [authorFilter]);

  // 태그 클릭
  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag('');
    } else {
      setActiveTag(tag);
    }
  };

  // 링크 복사
  const handleCopyLink = (postId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('post', postId);
    url.search = `?post=${postId}`;
    navigator.clipboard.writeText(url.toString()).then(() => {
      alert(t('playground.linkCopied'));
    }).catch(() => {});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 소개 */}
      <div className="mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('playground.description')}
        </p>
      </div>

      {/* 검색 바 */}
      <div className="mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={t('playground.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
              '--tw-ring-color': 'var(--brand-500)',
            } as any}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setActiveSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* 활성 필터 표시 */}
      {(activeTag || authorFilter) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {activeTag && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
              #{activeTag}
              <button onClick={() => setActiveTag('')} className="ml-0.5 hover:opacity-70">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          )}
          {authorFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              @{authorFilterName || authorFilter}
              <button onClick={() => { setAuthorFilter(''); setAuthorFilterName(''); }} className="ml-0.5 hover:opacity-70">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          )}
        </div>
      )}

      {/* 상단 바 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          {(['latest', 'popular'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: sort === s && feedFilter === 'all' ? 'var(--brand-500)' : 'transparent',
                color: sort === s && feedFilter === 'all' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {s === 'latest' ? t('playground.latest') : t('playground.popular')}
            </button>
          ))}
          {isAuthenticated && (
            <button onClick={() => setFeedFilter(feedFilter === 'bookmarked' ? 'all' : 'bookmarked')}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: feedFilter === 'bookmarked' ? 'var(--brand-500)' : 'transparent',
                color: feedFilter === 'bookmarked' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t('playground.bookmarks')}
            </button>
          )}
        </div>

        {isAuthenticated ? (
          <button onClick={() => setShowShareModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            {t('playground.shareProject')}
          </button>
        ) : (
          <button onClick={onShowAuthModal}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            {t('common.login')}
          </button>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="text-center py-4">
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          <button onClick={() => loadFeed(true)} className="mt-2 text-xs underline" style={{ color: 'var(--text-muted)' }}>{t('common.error')}</button>
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
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('playground.emptyTitle')}</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('playground.emptyDesc')}</p>
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
                onBookmark={() => handleBookmark(post.id)}
                onDelete={() => handleDelete(post.id)}
                onClick={() => { handleOpenDetail(post.id); updateUrlWithPost(post.id); }}
                onReport={() => { if (!isAuthenticated) { onShowAuthModal(); return; } setReportPostId(post.id); }}
                onAuthorClick={() => handleAuthorClick(post.email, post.authorName)}
                onTagClick={handleTagClick}
                onCopyLink={() => handleCopyLink(post.id)}
                t={t}
              />
            ))}
          </div>

          {/* 무한 스크롤 sentinel */}
          {nextCursor && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              {loadingMore && (
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
              )}
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
          tags={shareTags}
          sharing={sharing}
          progress={shareProgress}
          error={shareError}
          onSelectProject={setShareProjectId}
          onChangeCaption={setShareCaption}
          onChangeTags={setShareTags}
          onSubmit={handleShare}
          onClose={() => { if (!sharing) { setShowShareModal(false); setShareError(null); setShareProgress(''); } }}
          t={t}
        />
      )}

      {/* 상세 모달 */}
      {(detailData || detailLoading) && (
        <DetailModal
          data={detailData}
          loading={detailLoading}
          isMine={detailData?.post.email === userEmail}
          isAuthenticated={isAuthenticated}
          userEmail={userEmail}
          onLike={() => detailData && handleLike(detailData.post.id)}
          onBookmark={() => detailData && handleBookmark(detailData.post.id)}
          onDelete={() => detailData && handleDelete(detailData.post.id)}
          onClose={() => { setDetailData(null); updateUrlWithPost(null); }}
          onShowAuthModal={onShowAuthModal}
          onReport={() => { if (!isAuthenticated) { onShowAuthModal(); return; } if (detailData) setReportPostId(detailData.post.id); }}
          onAuthorClick={(email, name) => { setDetailData(null); updateUrlWithPost(null); handleAuthorClick(email, name); setAuthorFilter(email); setAuthorFilterName(name); }}
          onTagClick={(tag) => { setDetailData(null); updateUrlWithPost(null); handleTagClick(tag); }}
          onCopyLink={() => detailData && handleCopyLink(detailData.post.id)}
          onCommentCountChange={(postId, count) => {
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: count } : p));
          }}
          t={t}
          lang={lang}
        />
      )}

      {/* 신고 모달 */}
      {reportPostId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => { if (!reporting) setReportPostId(null); }}>
          <div className="w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{t('playground.reportTitle')}</h3>
            <div className="space-y-2">
              {REPORT_REASONS.map(r => (
                <button key={r.key} onClick={() => setReportReason(r.key)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    backgroundColor: reportReason === r.key ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                    color: reportReason === r.key ? '#818cf8' : 'var(--text-secondary)',
                    border: reportReason === r.key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                  }}>
                  {r[lang] || r.en}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReportPostId(null)} disabled={reporting}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                {t('common.cancel')}
              </button>
              <button onClick={handleReport} disabled={!reportReason || reporting}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: '#ef4444' }}>
                {reporting ? t('common.loading') : t('playground.reportSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 작성자 프로필 팝업 */}
      {authorProfile && (
        <ProfilePopup
          profile={authorProfile}
          onViewPosts={() => { setAuthorFilter(authorProfile.email); setAuthorFilterName(authorProfile.name); setAuthorProfile(null); }}
          onClose={() => setAuthorProfile(null)}
          t={t}
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
  onBookmark: () => void;
  onDelete: () => void;
  onClick: () => void;
  onReport: () => void;
  onAuthorClick: () => void;
  onTagClick: (tag: string) => void;
  onCopyLink: () => void;
  t: (key: string, opts?: any) => string;
}> = ({ post, isMine, onLike, onBookmark, onDelete, onClick, onReport, onAuthorClick, onTagClick, onCopyLink, t }) => {
  const [hovering, setHovering] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressPreview, setLongPressPreview] = useState(false);
  const [likeBounce, setLikeBounce] = useState(false);

  const handleMouseEnter = () => {
    if (!post.videoUrl) return;
    hoverTimer.current = setTimeout(() => setHovering(true), 400);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovering(false);
  };

  // 모바일 long press 프리뷰
  const handleTouchStart = () => {
    if (!post.videoUrl) return;
    longPressTimer.current = setTimeout(() => setLongPressPreview(true), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (longPressPreview) {
      setLongPressPreview(false);
    }
  };

  useEffect(() => {
    if ((hovering || longPressPreview) && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [hovering, longPressPreview]);

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all hover:shadow-lg hover:scale-[1.01] cursor-pointer relative group"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
    >
      {/* 썸네일 + 호버 프리뷰 */}
      <div className="relative" style={{ aspectRatio: '16/9' }} onClick={onClick}
        onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
      >
        {post.videoUrl && (hovering || longPressPreview) ? (
          <video ref={videoRef} src={post.videoUrl} muted playsInline loop preload="none" className="w-full h-full object-cover" />
        ) : post.thumbnail ? (
          <img src={`data:image/jpeg;base64,${post.thumbnail}`} alt={post.topic} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
        {/* 재생 아이콘 */}
        {post.videoUrl && !hovering && !longPressPreview && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
              <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        {/* 상단 뱃지들 */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {post.sceneCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
              {post.sceneCount}{t('common.scenes')}
            </span>
          )}
        </div>
        {/* 조회수 */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          {post.viewCount || 0}
        </div>
      </div>

      {/* 더보기 메뉴 */}
      <button
        onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
        className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {showMenu && (
        <div className="absolute top-9 left-2 z-20 rounded-lg border overflow-hidden shadow-lg"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { onCopyLink(); setShowMenu(false); }}
            className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2"
            style={{ color: 'var(--text-secondary)' }}>
            {t('playground.copyLink')}
          </button>
          {!isMine && (
            <button onClick={() => { onReport(); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2"
              style={{ color: '#f87171' }}>
              {t('playground.report')}
            </button>
          )}
          {isMine && (
            <button onClick={() => { onDelete(); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2"
              style={{ color: '#f87171' }}>
              {t('common.delete')}
            </button>
          )}
        </div>
      )}
      {/* 메뉴 외 클릭 시 닫기 */}
      {showMenu && <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />}

      {/* 하단 정보 */}
      <div className="p-3">
        {/* 작성자 */}
        <div className="flex items-center gap-2 mb-2">
          <div onClick={e => { e.stopPropagation(); onAuthorClick(); }} className="cursor-pointer">
            <FramedAvatar name={post.authorName} url={post.authorAvatarUrl} size={28} frame={post.equipped?.frame} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium truncate cursor-pointer hover:underline"
                style={{ color: 'var(--text-primary)' }}
                onClick={e => { e.stopPropagation(); onAuthorClick(); }}>
                {post.authorName}
              </p>
              <LevelBadge level={post.authorLevel || 1} compact />
              {post.equipped?.badges && post.equipped.badges.length > 0 && (
                <BadgeIcons badges={post.equipped.badges} compact />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.createdAt, t)}</p>
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
          <p className="text-[11px] line-clamp-2 mb-1.5" style={{ color: 'var(--text-secondary)' }}>{post.caption}</p>
        )}

        {/* 태그 */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {post.tags.map(tag => (
              <button key={tag} onClick={e => { e.stopPropagation(); onTagClick(tag); }}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-all hover:opacity-80"
                style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* 하단 액션 바 */}
        <div className="flex items-center gap-3">
          {/* 좋아요 */}
          <button onClick={e => { e.stopPropagation(); setLikeBounce(true); setTimeout(() => setLikeBounce(false), 300); onLike(); }}
            className="flex items-center gap-1 transition-all hover:scale-105"
            style={{ transform: likeBounce ? 'scale(1.3)' : undefined, transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={post.liked ? '#ef4444' : 'none'} stroke={post.liked ? '#ef4444' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            <span className="text-xs font-medium" style={{ color: post.liked ? '#ef4444' : 'var(--text-muted)' }}>
              {post.likeCount > 0 ? post.likeCount : ''}
            </span>
          </button>

          {/* 댓글 수 */}
          <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
            </svg>
            <span className="text-xs font-medium">{post.commentCount > 0 ? post.commentCount : ''}</span>
          </div>

          <div className="flex-1" />

          {/* 북마크 */}
          <button onClick={e => { e.stopPropagation(); onBookmark(); }} className="transition-all hover:scale-110">
            <svg className="w-4 h-4" viewBox="0 0 24 24"
              fill={post.bookmarked ? '#fbbf24' : 'none'}
              stroke={post.bookmarked ? '#fbbf24' : 'currentColor'}
              strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

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

// ── 프레임 아바타 ──

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

  if (rarity === 'epic') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated" style={{ width: size, height: size, border: `${borderW}px solid ${color}`, animation: 'frame-epic-glow 3s ease-in-out infinite' }} title={frame?.name}>
        <Avatar name={name} url={url} size={innerSize} />
      </div>
    );
  }

  if (rarity === 'rare') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 frame-animated" style={{ width: size, height: size, border: `${borderW}px solid ${color}`, animation: 'frame-rare-pulse 2s ease-in-out infinite' }} title={frame?.name}>
        <Avatar name={name} url={url} size={innerSize} />
      </div>
    );
  }

  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, border: `${rarity === 'uncommon' ? 2 : 1.5}px solid ${color}`, boxShadow: rarity === 'uncommon' ? `0 0 6px ${color}44, 0 0 12px ${color}22` : undefined }} title={frame?.name}>
      <Avatar name={name} url={url} size={size - (rarity === 'uncommon' ? 4 : 3)} />
    </div>
  );
};

// ── 칭호 뱃지 ──

const TitleBadge: React.FC<{ title: PlaygroundEquippedItem; compact?: boolean }> = ({ title, compact = false }) => {
  const color = RARITY_COLORS[title.rarity] || RARITY_COLORS.common;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full font-medium leading-none ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }} title={title.name}>
      <span>{title.emoji}</span>
      <span className={compact ? 'max-w-[60px] truncate' : ''}>{title.name}</span>
    </span>
  );
};

// ── 뱃지 아이콘 ──

const BadgeIcons: React.FC<{ badges: PlaygroundEquippedItem[]; compact?: boolean }> = ({ badges, compact = false }) => {
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {badges.slice(0, 3).map(badge => (
        <span key={badge.id}
          className={`rounded-full flex items-center justify-center ${compact ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-xs'}`}
          style={{ backgroundColor: `${RARITY_COLORS[badge.rarity] || RARITY_COLORS.common}15`, border: `1px solid ${RARITY_COLORS[badge.rarity] || RARITY_COLORS.common}25` }}
          title={badge.name}>
          {badge.emoji}
        </span>
      ))}
    </span>
  );
};

// ── 레벨 뱃지 ──

const LEVEL_COLORS = [
  '#94a3b8', // 1-4
  '#4ade80', // 5-9
  '#22d3ee', // 10-14
  '#818cf8', // 15-19
  '#f59e0b', // 20-24
  '#ef4444', // 25+
];

function getLevelColor(level: number): string {
  if (level >= 25) return LEVEL_COLORS[5];
  if (level >= 20) return LEVEL_COLORS[4];
  if (level >= 15) return LEVEL_COLORS[3];
  if (level >= 10) return LEVEL_COLORS[2];
  if (level >= 5) return LEVEL_COLORS[1];
  return LEVEL_COLORS[0];
}

const LevelBadge: React.FC<{ level: number; compact?: boolean }> = ({ level, compact = false }) => {
  const color = getLevelColor(level);
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold leading-none ${
        compact ? 'px-1 py-0.5 text-[9px] min-w-[20px]' : 'px-1.5 py-0.5 text-[10px] min-w-[24px]'
      }`}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
      title={`Lv.${level}`}
    >
      {level}
    </span>
  );
};

// ── 프로필 팝업 ──

function getProfileBoxStyle(rarity?: string): React.CSSProperties {
  if (!rarity) return { borderColor: 'var(--border-default)' };
  const color = RARITY_COLORS[rarity];
  if (!color) return { borderColor: 'var(--border-default)' };

  switch (rarity) {
    case 'legendary':
      return {
        border: '2px solid transparent',
        backgroundClip: 'padding-box',
        animation: 'frame-legendary-glow 2s ease-in-out infinite',
      };
    case 'epic':
      return {
        border: `2px solid ${color}`,
        animation: 'frame-epic-glow 3s ease-in-out infinite',
      };
    case 'rare':
      return {
        border: `2px solid ${color}`,
        animation: 'frame-rare-pulse 2s ease-in-out infinite',
      };
    case 'uncommon':
      return {
        border: `2px solid ${color}`,
        boxShadow: `0 0 8px ${color}44, 0 0 16px ${color}22`,
      };
    default:
      return { border: `1.5px solid ${color}40` };
  }
}

function getProfileGradient(rarity?: string): string {
  switch (rarity) {
    case 'legendary': return 'linear-gradient(135deg, #ef4444, #f59e0b, #ec4899, #8b5cf6)';
    case 'epic': return 'linear-gradient(135deg, #f59e0b, #fbbf24)';
    case 'rare': return 'linear-gradient(135deg, #8b5cf6, #a78bfa)';
    case 'uncommon': return 'linear-gradient(135deg, #22c55e, #4ade80)';
    default: return 'linear-gradient(135deg, var(--brand-500), var(--brand-400))';
  }
}

const ProfilePopup: React.FC<{
  profile: AuthorProfile;
  onViewPosts: () => void;
  onClose: () => void;
  t: (key: string, opts?: any) => string;
}> = ({ profile, onViewPosts, onClose, t }) => {
  const frameRarity = profile.equipped?.frame?.rarity as string | undefined;
  const boxStyle = getProfileBoxStyle(frameRarity);
  const gradientBar = getProfileGradient(frameRarity);
  const accentColor = frameRarity ? RARITY_COLORS[frameRarity] || 'var(--brand-500)' : 'var(--brand-500)';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      {/* legendary: conic gradient 외곽 래퍼 */}
      {frameRarity === 'legendary' ? (
        <div className="rounded-2xl p-[2px] frame-animated" onClick={e => e.stopPropagation()}
          style={{
            background: 'conic-gradient(from var(--frame-angle, 0deg), #ef4444, #f59e0b, #ec4899, #8b5cf6, #ef4444)',
            animation: 'frame-legendary-spin 3s linear infinite, frame-legendary-glow 2s ease-in-out infinite',
            maxWidth: '320px', width: '100%',
          }}>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)' }}>
            <ProfilePopupInner profile={profile} gradientBar={gradientBar} accentColor={accentColor} onViewPosts={onViewPosts} t={t} />
          </div>
        </div>
      ) : (
        <div className={`w-full max-w-[320px] rounded-2xl overflow-hidden ${frameRarity === 'epic' || frameRarity === 'rare' ? 'frame-animated' : ''}`}
          style={{ backgroundColor: 'var(--bg-surface)', ...boxStyle }}
          onClick={e => e.stopPropagation()}>
          <ProfilePopupInner profile={profile} gradientBar={gradientBar} accentColor={accentColor} onViewPosts={onViewPosts} t={t} />
        </div>
      )}
    </div>
  );
};

const ProfilePopupInner: React.FC<{
  profile: AuthorProfile;
  gradientBar: string;
  accentColor: string;
  onViewPosts: () => void;
  t: (key: string, opts?: any) => string;
}> = ({ profile, gradientBar, accentColor, onViewPosts, t }) => (
  <div>
    {/* 상단 그라데이션 바 */}
    <div style={{ background: gradientBar, height: 48 }} />

    {/* 아바타 (바 위에 걸치게) */}
    <div className="flex justify-center" style={{ marginTop: -36 }}>
      <FramedAvatar name={profile.name} url={profile.avatarUrl} size={72} frame={profile.equipped?.frame} />
    </div>

    <div className="px-5 pb-5 pt-3 text-center space-y-3">
      {/* 이름 + 레벨 */}
      <div>
        <div className="flex items-center justify-center gap-2">
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{profile.name}</p>
          <LevelBadge level={profile.level || 1} />
        </div>

        {/* 칭호 */}
        {profile.equipped?.title && (
          <div className="mt-1.5 flex justify-center">
            <TitleBadge title={profile.equipped.title} />
          </div>
        )}

        {/* 뱃지 */}
        {profile.equipped?.badges && profile.equipped.badges.length > 0 && (
          <div className="mt-2 flex justify-center">
            <BadgeIcons badges={profile.equipped.badges} />
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)` }} />

      {/* 통계 */}
      <div className="flex justify-center gap-4">
        <div className="flex-1 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{profile.postCount}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('playground.authorPosts')}</p>
        </div>
        <div className="flex-1 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <p className="text-xl font-bold" style={{ color: '#ef4444' }}>{profile.totalLikes}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('playground.authorLikes')}</p>
        </div>
      </div>

      {/* 버튼 */}
      <button onClick={onViewPosts}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
        style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, color: '#fff' }}>
        {t('playground.viewAllPosts')}
      </button>
    </div>
  </div>
);

// ── 공유 모달 ──

const ShareModal: React.FC<{
  projects: SavedProject[];
  projectId: string;
  caption: string;
  tags: string;
  sharing: boolean;
  progress: string;
  error: string | null;
  onSelectProject: (id: string) => void;
  onChangeCaption: (v: string) => void;
  onChangeTags: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  t: (key: string, opts?: any) => string;
}> = ({ projects, projectId, caption, tags, sharing, progress, error, onSelectProject, onChangeCaption, onChangeTags, onSubmit, onClose, t }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{t('playground.shareProject')}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {t('playground.shareDescription')}
        </p>

        {/* 프로젝트 선택 */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('playground.selectProject')}</label>
          {projects.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('playground.noProjectsToShare')}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border p-1" style={{ borderColor: 'var(--border-default)', scrollbarWidth: 'thin' }}>
              {projects.map(p => (
                <button key={p.id} onClick={() => onSelectProject(p.id)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all ${projectId === p.id ? 'ring-2' : 'hover:bg-white/5'}`}
                  style={{ backgroundColor: projectId === p.id ? 'color-mix(in srgb, var(--brand-500) 15%, transparent)' : 'transparent', ringColor: 'var(--brand-400)' }}>
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
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('playground.caption')}</label>
          <textarea value={caption} onChange={e => onChangeCaption(e.target.value.slice(0, 200))}
            placeholder={t('playground.captionPlaceholder')} rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm border resize-none focus:outline-none"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          <p className="text-[10px] text-right mt-0.5" style={{ color: 'var(--text-muted)' }}>{caption.length}/200</p>
        </div>

        {/* 태그 */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('playground.tags')}</label>
          <input type="text" value={tags} onChange={e => onChangeTags(e.target.value)}
            placeholder={t('playground.tagsPlaceholder')}
            className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('playground.tagsHelp')}</p>
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
          style={{ background: sharing ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: sharing ? 'var(--text-muted)' : '#fff' }}>
          {sharing ? t('playground.sharing') : t('playground.share')}
        </button>
      </div>
    </div>
  );
};

// ── 스켈레톤 카드 ──

const SkeletonCard: React.FC = () => (
  <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
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

// ── 댓글 섹션 ──

const CommentSection: React.FC<{
  postId: string;
  isAuthenticated: boolean;
  userEmail: string | null;
  onShowAuthModal: () => void;
  onCommentCountChange: (count: number) => void;
  t: (key: string, opts?: any) => string;
}> = ({ postId, isAuthenticated, userEmail, onShowAuthModal, onCommentCountChange, t }) => {
  const [comments, setComments] = useState<PlaygroundComment[]>([]);
  const [replies, setReplies] = useState<Record<string, PlaygroundComment[]>>({});
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const loadComments = async (cursor?: string | null) => {
    try {
      if (!cursor) setLoading(true);
      const data: CommentsResponse = await getComments(postId, cursor);
      if (!cursor) {
        setComments(data.comments);
        setReplies(data.replies);
      } else {
        setComments(prev => [...prev, ...data.comments]);
        setReplies(prev => ({ ...prev, ...data.replies }));
      }
      setLikedCommentIds(new Set(data.likedCommentIds));
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) { onShowAuthModal(); return; }
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const { comment, commentCount } = await addComment(postId, newComment.trim(), replyTo?.id);
      if (replyTo) {
        setReplies(prev => ({
          ...prev,
          [replyTo.id]: [...(prev[replyTo.id] || []), comment],
        }));
        setExpandedReplies(prev => new Set(prev).add(replyTo.id));
      } else {
        setComments(prev => [...prev, comment]);
      }
      setNewComment('');
      setReplyTo(null);
      onCommentCountChange(commentCount);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string, parentId?: string | null) => {
    if (!confirm(t('playground.deleteComment'))) return;
    try {
      const { commentCount } = await deleteComment(commentId);
      if (parentId) {
        setReplies(prev => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter(r => r.id !== commentId),
        }));
      } else {
        setComments(prev => prev.filter(c => c.id !== commentId));
        setReplies(prev => { const n = { ...prev }; delete n[commentId]; return n; });
      }
      onCommentCountChange(commentCount);
    } catch {
      // ignore
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!isAuthenticated) { onShowAuthModal(); return; }
    try {
      const result = await toggleCommentLike(commentId);
      // 업데이트 liked set
      setLikedCommentIds(prev => {
        const next = new Set(prev);
        if (result.liked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
      // 업데이트 like count
      const updateComment = (c: PlaygroundComment) =>
        c.id === commentId ? { ...c, like_count: result.likeCount } : c;
      setComments(prev => prev.map(updateComment));
      setReplies(prev => {
        const n: Record<string, PlaygroundComment[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          n[k] = v.map(updateComment);
        }
        return n;
      });
    } catch {
      // ignore
    }
  };

  const renderComment = (comment: PlaygroundComment, isReply = false) => (
    <div key={comment.id} className={`flex gap-2 ${isReply ? 'ml-8' : ''}`}>
      <FramedAvatar name={comment.author_name} url={comment.author_avatar_url} size={isReply ? 24 : 28} frame={comment.equipped?.frame} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{comment.author_name}</span>
          <LevelBadge level={comment.author_level || 1} compact />
          {comment.equipped?.badges && comment.equipped.badges.length > 0 && (
            <BadgeIcons badges={comment.equipped.badges} compact />
          )}
          {comment.equipped?.title && <TitleBadge title={comment.equipped.title} compact />}
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(comment.created_at, t)}</span>
        </div>
        <p className="text-xs mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
        <div className="flex items-center gap-3 mt-1">
          <button onClick={() => handleLikeComment(comment.id)} className="flex items-center gap-1 text-[10px] transition-all hover:opacity-80"
            style={{ color: likedCommentIds.has(comment.id) ? '#ef4444' : 'var(--text-muted)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill={likedCommentIds.has(comment.id) ? '#ef4444' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            {comment.like_count > 0 && comment.like_count}
          </button>
          {!isReply && (
            <button onClick={() => setReplyTo({ id: comment.id, name: comment.author_name })}
              className="text-[10px] hover:underline" style={{ color: 'var(--text-muted)' }}>
              {t('playground.reply')}
            </button>
          )}
          {comment.email === userEmail && (
            <button onClick={() => handleDeleteComment(comment.id, isReply ? comment.parent_id : null)}
              className="text-[10px] hover:underline" style={{ color: '#f87171' }}>
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('playground.comments')}</h4>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>{t('playground.noComments')}</p>
      ) : (
        <div className="space-y-4">
          {comments.map(comment => (
            <div key={comment.id}>
              {renderComment(comment)}
              {/* 답글 */}
              {replies[comment.id] && replies[comment.id].length > 0 && (
                <>
                  {!expandedReplies.has(comment.id) && replies[comment.id].length > 0 && (
                    <button onClick={() => setExpandedReplies(prev => new Set(prev).add(comment.id))}
                      className="ml-10 mt-2 text-[10px] hover:underline" style={{ color: 'var(--brand-400)' }}>
                      {t('playground.showReplies', { count: replies[comment.id].length })}
                    </button>
                  )}
                  {expandedReplies.has(comment.id) && (
                    <div className="mt-2 space-y-3">
                      {replies[comment.id].map(r => renderComment(r, true))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {nextCursor && (
            <button onClick={() => loadComments(nextCursor)} className="text-xs hover:underline" style={{ color: 'var(--brand-400)' }}>
              {t('playground.loadMoreComments')}
            </button>
          )}
        </div>
      )}

      {/* 댓글 입력 */}
      <div className="pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{t('playground.replyingTo', { name: replyTo.name })}</span>
            <button onClick={() => setReplyTo(null)} className="hover:opacity-70">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" value={newComment}
            onChange={e => setNewComment(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={isAuthenticated ? t('playground.commentPlaceholder') : t('playground.loginToComment')}
            disabled={!isAuthenticated}
            className="flex-1 px-3 py-2 rounded-lg text-xs border focus:outline-none disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          <button onClick={handleSubmit} disabled={!newComment.trim() || submitting || !isAuthenticated}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-all"
            style={{ backgroundColor: 'var(--brand-500)' }}>
            {submitting ? '...' : t('playground.commentSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 상세 모달 ──

const DetailModal: React.FC<{
  data: PostDetailResponse | null;
  loading: boolean;
  isMine: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  onLike: () => void;
  onBookmark: () => void;
  onDelete: () => void;
  onClose: () => void;
  onShowAuthModal: () => void;
  onReport: () => void;
  onAuthorClick: (email: string, name: string) => void;
  onTagClick: (tag: string) => void;
  onCopyLink: () => void;
  onCommentCountChange: (postId: string, count: number) => void;
  t: (key: string, opts?: any) => string;
  lang: 'ko' | 'en' | 'ja';
}> = ({ data, loading, isMine, isAuthenticated, userEmail, onLike, onBookmark, onDelete, onClose, onShowAuthModal, onReport, onAuthorClick, onTagClick, onCopyLink, onCommentCountChange, t, lang }) => {
  const [detailLikeBounce, setDetailLikeBounce] = useState(false);

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

  const detailEquipped = data?.equipped || data?.post.equipped;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', scrollbarWidth: 'thin' }}
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{data?.post.topic || ''}</h3>
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
            {/* 영상 플레이어 */}
            {data.post.videoUrl ? (
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#000' }}>
                <video src={data.post.videoUrl} controls autoPlay playsInline preload="auto"
                  poster={data.post.thumbnail ? `data:image/jpeg;base64,${data.post.thumbnail}` : undefined}
                  className="w-full max-h-[60vh]" style={{ display: 'block', margin: '0 auto' }}
                  ref={(el) => {
                    if (!el) return;
                    el.muted = false;
                    el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
                  }} />
              </div>
            ) : playerAssets.length > 0 ? (
              <PreviewPlayer assets={playerAssets} sceneGap={data.sceneGap} onClose={onClose} />
            ) : (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('playground.noAssets')}</p>
              </div>
            )}

            {/* 작성자 + 캡션 */}
            <div className="flex items-center gap-3">
              <div className="cursor-pointer" onClick={() => onAuthorClick(data.post.email, data.post.authorName)}>
                <FramedAvatar name={data.post.authorName} url={data.post.authorAvatarUrl} size={36} frame={detailEquipped?.frame} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium cursor-pointer hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => onAuthorClick(data.post.email, data.post.authorName)}>
                    {data.post.authorName}
                  </p>
                  <LevelBadge level={data.post.authorLevel || 1} />
                  {detailEquipped?.badges && detailEquipped.badges.length > 0 && (
                    <BadgeIcons badges={detailEquipped.badges} />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(data.post.createdAt, t)}</p>
                  {detailEquipped?.title && <TitleBadge title={detailEquipped.title} />}
                  <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    {data.post.viewCount || 0}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isMine && (
                  <button onClick={onReport} className="px-3 py-1 text-xs rounded-lg transition-all hover:bg-red-500/10"
                    style={{ color: 'var(--text-muted)' }} title={t('playground.report')}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                  </button>
                )}
                {isMine && (
                  <button onClick={onDelete} className="px-3 py-1 text-xs rounded-lg transition-all hover:bg-red-500/20"
                    style={{ color: '#f87171' }}>
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>

            {data.post.caption && (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{data.post.caption}</p>
            )}

            {/* 태그 */}
            {data.post.tags && data.post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.post.tags.map(tag => (
                  <button key={tag} onClick={() => onTagClick(tag)}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* 액션 바 */}
            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                onClick={() => { if (!isAuthenticated) { onShowAuthModal(); return; } setDetailLikeBounce(true); setTimeout(() => setDetailLikeBounce(false), 300); onLike(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{
                  backgroundColor: data.liked ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)',
                  transform: detailLikeBounce ? 'scale(1.15)' : undefined,
                  transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s',
                }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill={data.liked ? '#ef4444' : 'none'} stroke={data.liked ? '#ef4444' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: data.liked ? '#ef4444' : 'var(--text-secondary)' }}>
                  {data.post.likeCount > 0 ? data.post.likeCount : t('playground.likeEmpty')}
                </span>
              </button>

              <button
                onClick={() => isAuthenticated ? onBookmark() : onShowAuthModal()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: data.bookmarked ? 'rgba(251,191,36,0.1)' : 'var(--bg-elevated)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24"
                  fill={data.bookmarked ? '#fbbf24' : 'none'}
                  stroke={data.bookmarked ? '#fbbf24' : 'currentColor'}
                  strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: data.bookmarked ? '#fbbf24' : 'var(--text-secondary)' }}>
                  {t('playground.bookmark')}
                </span>
              </button>

              <button onClick={onCopyLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-4.122a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 8.688" />
                </svg>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{t('playground.copyLink')}</span>
              </button>
            </div>

            {/* 댓글 섹션 */}
            <CommentSection
              postId={data.post.id}
              isAuthenticated={isAuthenticated}
              userEmail={userEmail}
              onShowAuthModal={onShowAuthModal}
              onCommentCountChange={(count) => onCommentCountChange(data.post.id, count)}
              t={t}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Playground;
