import React, { useState, useEffect, useCallback } from 'react';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface PlaygroundStats {
  totalPosts: number;
  flaggedPosts: number;
  uniqueAuthors: number;
  totalLikes: number;
  totalComments: number;
  totalReports: number;
  totalBookmarks: number;
  totalViews: number;
  totalNotifications: number;
}

interface PlaygroundPost {
  id: string;
  email: string;
  author_name: string;
  caption: string;
  thumbnail: string | null;
  topic: string;
  scene_count: number;
  like_count: number;
  view_count: number;
  comment_count: number;
  created_at: string;
  video_url: string | null;
  flagged: boolean;
  tags: string[];
}

interface PlaygroundReport {
  id: string;
  post_id: string;
  email: string;
  reason: string;
  created_at: string;
  post_topic: string;
  post_author: string;
  post_flagged: boolean;
}

interface PlaygroundComment {
  id: string;
  post_id: string;
  email: string;
  author_name: string;
  content: string;
  like_count: number;
  parent_id: string | null;
  created_at: string;
  post_topic: string;
}

type SubTab = 'posts' | 'comments' | 'reports';

async function pgFetch(body: Record<string, any>) {
  const res = await fetch('/api/playground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  return `${days}일 전`;
}

const REASON_LABELS: Record<string, string> = {
  spam: '스팸/광고',
  inappropriate: '부적절',
  copyright: '저작권',
  hate: '혐오/차별',
  other: '기타',
};

const AdminPlayground: React.FC<Props> = ({ adminToken, onToast }) => {
  const [stats, setStats] = useState<PlaygroundStats | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('posts');

  // ── 게시물 상태 ──
  const [posts, setPosts] = useState<PlaygroundPost[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [postPage, setPostPage] = useState(0);
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'flagged' | 'reported'>('all');
  const [postSort, setPostSort] = useState<'latest' | 'popular'>('latest');
  const [postLoading, setPostLoading] = useState(true);

  // ── 댓글 상태 ──
  const [comments, setComments] = useState<PlaygroundComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(0);
  const [commentSearch, setCommentSearch] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // ── 신고 상태 ──
  const [reports, setReports] = useState<PlaygroundReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const [reportReasonFilter, setReportReasonFilter] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const limit = 15;

  // ── 통계 로드 ──
  const loadStats = useCallback(async () => {
    const data = await pgFetch({ action: 'admin-playgroundStats', token: adminToken });
    if (data.success) setStats(data);
  }, [adminToken]);

  // ── 게시물 로드 ──
  const loadPosts = useCallback(async () => {
    setPostLoading(true);
    const data = await pgFetch({
      action: 'admin-playgroundPosts', token: adminToken,
      page: postPage, limit, search: postSearch || undefined,
      filter: postFilter !== 'all' ? postFilter : undefined, sort: postSort,
    });
    if (data.success) { setPosts(data.posts); setPostTotal(data.total); }
    setPostLoading(false);
  }, [adminToken, postPage, postSearch, postFilter, postSort]);

  // ── 댓글 로드 ──
  const loadComments = useCallback(async () => {
    setCommentLoading(true);
    const data = await pgFetch({
      action: 'admin-listComments', token: adminToken,
      page: commentPage, limit, search: commentSearch || undefined,
    });
    if (data.success) { setComments(data.comments); setCommentTotal(data.total); }
    setCommentLoading(false);
  }, [adminToken, commentPage, commentSearch]);

  // ── 신고 로드 ──
  const loadReports = useCallback(async () => {
    setReportLoading(true);
    const data = await pgFetch({
      action: 'admin-viewReports', token: adminToken,
      page: reportPage, limit, reasonFilter: reportReasonFilter || undefined,
    });
    if (data.success) { setReports(data.reports); setReportTotal(data.total); }
    setReportLoading(false);
  }, [adminToken, reportPage, reportReasonFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (subTab === 'posts') loadPosts(); }, [subTab, loadPosts]);
  useEffect(() => { if (subTab === 'comments') loadComments(); }, [subTab, loadComments]);
  useEffect(() => { if (subTab === 'reports') loadReports(); }, [subTab, loadReports]);

  // ── 액션 핸들러 ──
  const handleDeletePost = async (postId: string, topic: string) => {
    if (!confirm(`"${topic || '제목 없음'}" 게시물을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    const data = await pgFetch({ action: 'admin-deletePost', token: adminToken, postId });
    if (data.success) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      setPostTotal(prev => prev - 1);
      onToast('success', '게시물이 삭제되었습니다.');
      loadStats();
    } else { onToast('error', data.error || '삭제 실패'); }
  };

  const handleFlagPost = async (postId: string, flagged: boolean) => {
    const data = await pgFetch({ action: 'admin-flagPost', token: adminToken, postId, flagged });
    if (data.success) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, flagged } : p));
      onToast('success', flagged ? '신고 처리되었습니다.' : '신고 해제되었습니다.');
      loadStats();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
    const data = await pgFetch({ action: 'admin-deleteComment', token: adminToken, commentId });
    if (data.success) {
      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentTotal(prev => prev - 1);
      onToast('success', '댓글이 삭제되었습니다.');
      loadStats();
    } else { onToast('error', data.error || '삭제 실패'); }
  };

  const handleDeleteReportedPost = async (postId: string, topic: string) => {
    if (!confirm(`"${topic}" 게시물을 삭제하시겠습니까?`)) return;
    const data = await pgFetch({ action: 'admin-deletePost', token: adminToken, postId });
    if (data.success) {
      setReports(prev => prev.filter(r => r.post_id !== postId));
      onToast('success', '게시물이 삭제되었습니다.');
      loadStats();
      loadReports();
    } else { onToast('error', data.error || '삭제 실패'); }
  };

  const postPages = Math.ceil(postTotal / limit);
  const commentPages = Math.ceil(commentTotal / limit);
  const reportPages = Math.ceil(reportTotal / limit);

  const subTabStyle = (tab: SubTab) => ({
    backgroundColor: subTab === tab ? 'var(--brand-500)' : 'transparent',
    color: subTab === tab ? '#fff' : 'var(--text-secondary)',
  });

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-9 gap-2">
          <StatCard label="전체 게시물" value={stats.totalPosts} />
          <StatCard label="작성자 수" value={stats.uniqueAuthors} />
          <StatCard label="총 좋아요" value={stats.totalLikes} color="#ef4444" />
          <StatCard label="총 댓글" value={stats.totalComments} color="#6366f1" />
          <StatCard label="총 조회수" value={stats.totalViews} color="#3b82f6" />
          <StatCard label="총 북마크" value={stats.totalBookmarks} color="#fbbf24" />
          <StatCard label="신고 접수" value={stats.totalReports} color="#f59e0b" />
          <StatCard label="신고 게시물" value={stats.flaggedPosts} color="#f97316" />
          <StatCard label="총 알림" value={stats.totalNotifications} color="#8b5cf6" />
        </div>
      )}

      {/* 서브 탭 */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        {([
          { id: 'posts' as SubTab, label: '게시물', count: postTotal },
          { id: 'comments' as SubTab, label: '댓글', count: commentTotal || stats?.totalComments || 0 },
          { id: 'reports' as SubTab, label: '신고', count: reportTotal || stats?.totalReports || 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
            style={subTabStyle(tab.id)}>
            {tab.label}
            {tab.count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{
                backgroundColor: subTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--bg-surface)',
                color: subTab === tab.id ? '#fff' : 'var(--text-muted)',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ 게시물 탭 ═══ */}
      {subTab === 'posts' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input type="text" value={postSearch} onChange={e => { setPostSearch(e.target.value); setPostPage(0); }}
              placeholder="제목, 작성자, 이메일 검색..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
            <select value={postFilter} onChange={e => { setPostFilter(e.target.value as any); setPostPage(0); }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
              <option value="all">전체</option>
              <option value="flagged">신고됨</option>
              <option value="reported">신고 접수</option>
            </select>
            <select value={postSort} onChange={e => { setPostSort(e.target.value as any); setPostPage(0); }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
              <option value="latest">최신순</option>
              <option value="popular">인기순</option>
            </select>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            {postLoading ? <Spinner /> : posts.length === 0 ? <EmptyState text="게시물이 없습니다." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <Th>썸네일</Th><Th>제목</Th><Th>작성자</Th>
                      <Th center>좋아요</Th><Th center>조회</Th><Th center>댓글</Th>
                      <Th>날짜</Th><Th center>상태</Th><Th center>액션</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2">
                          {post.thumbnail ? (
                            <img src={`data:image/jpeg;base64,${post.thumbnail}`} alt="" className="w-12 h-8 rounded object-cover" />
                          ) : <div className="w-12 h-8 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}><span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>없음</span></div>}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>{post.topic || '제목 없음'}</p>
                          {post.caption && <p className="truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>{post.caption}</p>}
                          <div className="flex items-center gap-1 mt-0.5">
                            {post.video_url && <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>영상</span>}
                            {post.tags?.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>#{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <p style={{ color: 'var(--text-primary)' }}>{post.author_name}</p>
                          <p style={{ color: 'var(--text-muted)' }}>{post.email}</p>
                        </td>
                        <td className="px-3 py-2 text-center" style={{ color: '#ef4444' }}>{post.like_count}</td>
                        <td className="px-3 py-2 text-center" style={{ color: '#3b82f6' }}>{post.view_count || 0}</td>
                        <td className="px-3 py-2 text-center" style={{ color: '#6366f1' }}>{post.comment_count || 0}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.created_at)}</td>
                        <td className="px-3 py-2 text-center">
                          {post.flagged ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>신고</span>
                          ) : <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>정상</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleFlagPost(post.id, !post.flagged)} className="p-1 rounded transition-all hover:bg-yellow-500/20" title={post.flagged ? '신고 해제' : '신고'}>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={post.flagged ? '#f59e0b' : 'none'} stroke={post.flagged ? '#f59e0b' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                              </svg>
                            </button>
                            <button onClick={() => handleDeletePost(post.id, post.topic)} className="p-1 rounded transition-all hover:bg-red-500/20" title="삭제">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="#f87171" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination current={postPage} total={postPages} count={postTotal} limit={limit} onChange={setPostPage} />
          </div>
        </>
      )}

      {/* ═══ 댓글 탭 ═══ */}
      {subTab === 'comments' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input type="text" value={commentSearch} onChange={e => { setCommentSearch(e.target.value); setCommentPage(0); }}
              placeholder="댓글 내용, 작성자, 이메일 검색..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            {commentLoading ? <Spinner /> : comments.length === 0 ? <EmptyState text="댓글이 없습니다." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <Th>작성자</Th><Th>내용</Th><Th>게시물</Th>
                      <Th center>좋아요</Th><Th>유형</Th><Th>날짜</Th><Th center>액션</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map(c => (
                      <tr key={c.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2">
                          <p style={{ color: 'var(--text-primary)' }}>{c.author_name}</p>
                          <p style={{ color: 'var(--text-muted)' }}>{c.email}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate max-w-[250px]" style={{ color: 'var(--text-secondary)' }}>{c.content}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate max-w-[150px]" style={{ color: 'var(--text-muted)' }}>{c.post_topic}</p>
                        </td>
                        <td className="px-3 py-2 text-center" style={{ color: '#ef4444' }}>{c.like_count}</td>
                        <td className="px-3 py-2">
                          {c.parent_id ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>답글</span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>댓글</span>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => handleDeleteComment(c.id)} className="p-1 rounded transition-all hover:bg-red-500/20" title="삭제">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="#f87171" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination current={commentPage} total={commentPages} count={commentTotal} limit={limit} onChange={setCommentPage} />
          </div>
        </>
      )}

      {/* ═══ 신고 탭 ═══ */}
      {subTab === 'reports' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select value={reportReasonFilter} onChange={e => { setReportReasonFilter(e.target.value); setReportPage(0); }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
              <option value="">전체 사유</option>
              <option value="spam">스팸/광고</option>
              <option value="inappropriate">부적절</option>
              <option value="copyright">저작권</option>
              <option value="hate">혐오/차별</option>
              <option value="other">기타</option>
            </select>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            {reportLoading ? <Spinner /> : reports.length === 0 ? <EmptyState text="신고 내역이 없습니다." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <Th>신고자</Th><Th>사유</Th><Th>대상 게시물</Th>
                      <Th>게시물 작성자</Th><Th>날짜</Th><Th center>상태</Th><Th center>액션</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{r.email}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{
                            backgroundColor: r.reason === 'spam' ? 'rgba(245,158,11,0.15)' :
                              r.reason === 'hate' ? 'rgba(239,68,68,0.15)' :
                              r.reason === 'inappropriate' ? 'rgba(249,115,22,0.15)' :
                              'rgba(99,102,241,0.15)',
                            color: r.reason === 'spam' ? '#f59e0b' :
                              r.reason === 'hate' ? '#ef4444' :
                              r.reason === 'inappropriate' ? '#f97316' :
                              '#818cf8',
                          }}>
                            {REASON_LABELS[r.reason] || r.reason}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>{r.post_topic}</p>
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{r.post_author}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</td>
                        <td className="px-3 py-2 text-center">
                          {r.post_flagged ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>처리됨</span>
                          ) : (
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>대기</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {!r.post_flagged && (
                              <button onClick={() => handleFlagPost(r.post_id, true)} className="p-1 rounded transition-all hover:bg-yellow-500/20" title="신고 처리">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                                </svg>
                              </button>
                            )}
                            <button onClick={() => handleDeleteReportedPost(r.post_id, r.post_topic)} className="p-1 rounded transition-all hover:bg-red-500/20" title="게시물 삭제">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="#f87171" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination current={reportPage} total={reportPages} count={reportTotal} limit={limit} onChange={setReportPage} />
          </div>
        </>
      )}
    </div>
  );
};

// ── 공통 서브 컴포넌트 ──

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    <p className="text-xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value.toLocaleString()}</p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; center?: boolean }> = ({ children, center }) => (
  <th className={`px-3 py-2.5 ${center ? 'text-center' : 'text-left'} font-medium`} style={{ color: 'var(--text-muted)' }}>{children}</th>
);

const Spinner: React.FC = () => (
  <div className="flex justify-center py-12">
    <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-12">
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</p>
  </div>
);

const Pagination: React.FC<{ current: number; total: number; count: number; limit: number; onChange: (p: number) => void }> = ({ current, total, count, limit, onChange }) => {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {count}개 중 {current * limit + 1}-{Math.min((current + 1) * limit, count)}
      </span>
      <div className="flex gap-2">
        <button onClick={() => onChange(Math.max(0, current - 1))} disabled={current === 0}
          className="px-3 py-1 rounded text-xs disabled:opacity-30"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>이전</button>
        <button onClick={() => onChange(Math.min(total - 1, current + 1))} disabled={current >= total - 1}
          className="px-3 py-1 rounded text-xs disabled:opacity-30"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>다음</button>
      </div>
    </div>
  );
};

export default AdminPlayground;
