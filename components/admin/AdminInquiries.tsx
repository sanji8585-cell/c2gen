import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from './adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface InquiryStats { total: number; open: number; replied: number; closed: number; }

interface Inquiry {
  id: string;
  email: string;
  author_name: string;
  category: string;
  subject: string;
  content: string;
  status: 'open' | 'replied' | 'closed';
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  bug: { label: '버그', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  payment: { label: '결제', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  account: { label: '계정', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  playground: { label: '놀이터', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  general: { label: '기타', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: '대기중', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  replied: { label: '답변완료', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  closed: { label: '종료', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
};

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

const AdminInquiries: React.FC<Props> = ({ adminToken, onToast }) => {
  const [stats, setStats] = useState<InquiryStats | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // 상세/답변
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const limit = 15;

  const loadStats = useCallback(async () => {
    const data = await authFetch({ action: 'admin-inquiryStats', token: adminToken });
    if (data.success) setStats(data);
  }, [adminToken]);

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    const data = await authFetch({
      action: 'admin-listInquiries', token: adminToken,
      page, limit, status: statusFilter, category: categoryFilter,
      search: search || undefined,
    });
    if (data.success) { setInquiries(data.inquiries); setTotal(data.total); }
    setLoading(false);
  }, [adminToken, page, statusFilter, categoryFilter, search]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  const handleReply = async (inquiryId: string) => {
    if (!replyText.trim()) return;
    setReplying(true);
    const data = await authFetch({ action: 'admin-replyInquiry', token: adminToken, inquiryId, reply: replyText.trim() });
    if (data.success) {
      setInquiries(prev => prev.map(i => i.id === inquiryId ? { ...i, status: 'replied', admin_reply: replyText.trim(), admin_replied_at: new Date().toISOString() } : i));
      setReplyText('');
      setSelectedId(null);
      onToast('success', '답변이 등록되었습니다.');
      loadStats();
    } else { onToast('error', data.error || '답변 실패'); }
    setReplying(false);
  };

  const handleClose = async (inquiryId: string) => {
    const data = await authFetch({ action: 'admin-closeInquiry', token: adminToken, inquiryId });
    if (data.success) {
      setInquiries(prev => prev.map(i => i.id === inquiryId ? { ...i, status: 'closed' } : i));
      onToast('success', '문의가 종료되었습니다.');
      loadStats();
    }
  };

  const totalPages = Math.ceil(total / limit);
  const selected = inquiries.find(i => i.id === selectedId);

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="전체 문의" value={stats.total} />
          <StatCard label="대기중" value={stats.open} color="#f59e0b" />
          <StatCard label="답변완료" value={stats.replied} color="#22c55e" />
          <StatCard label="종료" value={stats.closed} color="#94a3b8" />
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="제목, 내용, 이메일 검색..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
          <option value="all">전체 상태</option>
          <option value="open">대기중</option>
          <option value="replied">답변완료</option>
          <option value="closed">종료</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
          <option value="all">전체 카테고리</option>
          <option value="bug">버그</option>
          <option value="payment">결제</option>
          <option value="account">계정</option>
          <option value="playground">놀이터</option>
          <option value="general">기타</option>
        </select>
      </div>

      {/* 문의 테이블 */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : inquiries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>문의가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>작성자</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>카테고리</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>제목</th>
                  <th className="px-3 py-2.5 text-center font-medium" style={{ color: 'var(--text-muted)' }}>상태</th>
                  <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>날짜</th>
                  <th className="px-3 py-2.5 text-center font-medium" style={{ color: 'var(--text-muted)' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map(inq => {
                  const cat = CATEGORY_LABELS[inq.category] || CATEGORY_LABELS.general;
                  const st = STATUS_LABELS[inq.status] || STATUS_LABELS.open;
                  const isSelected = selectedId === inq.id;
                  return (
                    <React.Fragment key={inq.id}>
                      <tr className="border-t cursor-pointer transition-colors"
                        style={{ borderColor: 'var(--border-subtle)', backgroundColor: isSelected ? 'rgba(99,102,241,0.05)' : undefined }}
                        onClick={() => setSelectedId(isSelected ? null : inq.id)}>
                        <td className="px-3 py-2">
                          <p style={{ color: 'var(--text-primary)' }}>{inq.author_name}</p>
                          <p style={{ color: 'var(--text-muted)' }}>{inq.email}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: cat.bg, color: cat.color }}>{cat.label}</span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium truncate max-w-[250px]" style={{ color: 'var(--text-primary)' }}>{inq.subject}</p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(inq.created_at)}</td>
                        <td className="px-3 py-2 text-center">
                          {inq.status !== 'closed' && (
                            <button onClick={e => { e.stopPropagation(); handleClose(inq.id); }}
                              className="text-[9px] px-2 py-1 rounded transition-all hover:bg-slate-500/20"
                              style={{ color: 'var(--text-muted)' }}>종료</button>
                          )}
                        </td>
                      </tr>
                      {/* 펼침: 상세 + 답변 */}
                      {isSelected && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 border-t" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'rgba(99,102,241,0.03)' }}>
                            <div className="space-y-3 max-w-2xl">
                              {/* 문의 내용 */}
                              <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                                <p className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>문의 내용</p>
                                <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{inq.content}</p>
                              </div>

                              {/* 기존 답변 */}
                              {inq.admin_reply && (
                                <div className="p-3 rounded-lg border" style={{ backgroundColor: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[10px] font-bold" style={{ color: '#22c55e' }}>관리자 답변</p>
                                    {inq.admin_replied_at && <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(inq.admin_replied_at)}</p>}
                                  </div>
                                  <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{inq.admin_reply}</p>
                                </div>
                              )}

                              {/* 답변 작성 폼 */}
                              {inq.status !== 'closed' && (
                                <div className="space-y-2">
                                  <textarea
                                    value={selectedId === inq.id ? replyText : ''}
                                    onChange={e => setReplyText(e.target.value)}
                                    placeholder="답변을 작성하세요..."
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg text-xs border resize-none"
                                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                                  />
                                  <button
                                    onClick={() => handleReply(inq.id)}
                                    disabled={replying || !replyText.trim()}
                                    className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                  >
                                    {replying ? '전송 중...' : inq.admin_reply ? '답변 수정' : '답변 등록'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>이전</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded text-xs disabled:opacity-30"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>다음</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    <p className="text-xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value.toLocaleString()}</p>
  </div>
);

export default AdminInquiries;
