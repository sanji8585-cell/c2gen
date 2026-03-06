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
  created_at: string;
  video_url: string | null;
  flagged: boolean;
}

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

const AdminPlayground: React.FC<Props> = ({ adminToken, onToast }) => {
  const [stats, setStats] = useState<PlaygroundStats | null>(null);
  const [posts, setPosts] = useState<PlaygroundPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [loading, setLoading] = useState(true);

  const limit = 15;

  const loadStats = useCallback(async () => {
    const data = await pgFetch({ action: 'admin-playgroundStats', token: adminToken });
    if (data.success) setStats(data);
  }, [adminToken]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const data = await pgFetch({
      action: 'admin-playgroundPosts',
      token: adminToken,
      page, limit, search: search || undefined,
      filter: filter !== 'all' ? filter : undefined,
      sort,
    });
    if (data.success) {
      setPosts(data.posts);
      setTotal(data.total);
    }
    setLoading(false);
  }, [adminToken, page, search, filter, sort]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleDelete = async (postId: string, topic: string) => {
    if (!confirm(`"${topic || '제목 없음'}" 게시물을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    const data = await pgFetch({ action: 'admin-deletePost', token: adminToken, postId });
    if (data.success) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      setTotal(prev => prev - 1);
      onToast('success', '게시물이 삭제되었습니다.');
      loadStats();
    } else {
      onToast('error', data.error || '삭제 실패');
    }
  };

  const handleFlag = async (postId: string, flagged: boolean) => {
    const data = await pgFetch({ action: 'admin-flagPost', token: adminToken, postId, flagged });
    if (data.success) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, flagged } : p));
      onToast('success', flagged ? '신고 처리되었습니다.' : '신고 해제되었습니다.');
      loadStats();
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="전체 게시물" value={stats.totalPosts} />
          <StatCard label="작성자 수" value={stats.uniqueAuthors} />
          <StatCard label="총 좋아요" value={stats.totalLikes} color="#ef4444" />
          <StatCard label="신고 게시물" value={stats.flaggedPosts} color="#f59e0b" />
        </div>
      )}

      {/* 검색/필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="제목, 작성자, 이메일 검색..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        />
        <select value={filter} onChange={e => { setFilter(e.target.value as any); setPage(0); }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          <option value="all">전체</option>
          <option value="flagged">신고됨</option>
        </select>
        <select value={sort} onChange={e => { setSort(e.target.value as any); setPage(0); }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          <option value="latest">최신순</option>
          <option value="popular">인기순</option>
        </select>
      </div>

      {/* 게시물 테이블 */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>게시물이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>썸네일</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>제목</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>작성자</th>
                  <th className="px-3 py-2.5 text-center font-medium" style={{ color: 'var(--text-muted)' }}>좋아요</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>날짜</th>
                  <th className="px-3 py-2.5 text-center font-medium" style={{ color: 'var(--text-muted)' }}>상태</th>
                  <th className="px-3 py-2.5 text-center font-medium" style={{ color: 'var(--text-muted)' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-3 py-2">
                      {post.thumbnail ? (
                        <img src={`data:image/jpeg;base64,${post.thumbnail}`} alt="" className="w-12 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-8 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                          <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>없음</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>{post.topic || '제목 없음'}</p>
                      {post.caption && <p className="truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{post.caption}</p>}
                      {post.video_url && <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>영상</span>}
                    </td>
                    <td className="px-3 py-2">
                      <p style={{ color: 'var(--text-primary)' }}>{post.author_name}</p>
                      <p style={{ color: 'var(--text-muted)' }}>{post.email}</p>
                    </td>
                    <td className="px-3 py-2 text-center" style={{ color: '#ef4444' }}>{post.like_count}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.created_at)}</td>
                    <td className="px-3 py-2 text-center">
                      {post.flagged ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>신고</span>
                      ) : (
                        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>정상</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleFlag(post.id, !post.flagged)}
                          className="p-1 rounded transition-all hover:bg-yellow-500/20"
                          title={post.flagged ? '신고 해제' : '신고'}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={post.flagged ? '#f59e0b' : 'none'} stroke={post.flagged ? '#f59e0b' : 'currentColor'} strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(post.id, post.topic)}
                          className="p-1 rounded transition-all hover:bg-red-500/20"
                          title="삭제"
                        >
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

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {total}개 중 {page * limit + 1}-{Math.min((page + 1) * limit, total)}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 rounded text-xs disabled:opacity-30"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >이전</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded text-xs disabled:opacity-30"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >다음</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border p-4 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    <p className="text-2xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value.toLocaleString()}</p>
  </div>
);

export default AdminPlayground;
