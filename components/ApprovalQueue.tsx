import React, { useState, useEffect, useCallback } from 'react';
import type { ApprovalQueueItem, ApprovalStatus } from '../types';
import { listPendingItems, approveItem, rejectItem, bulkApprove } from '../services/approvalQueueService';

interface ApprovalQueueProps {
  campaignId: string;
  campaignName: string;
  onBack: () => void;
}

const STATUS_STYLES: Record<ApprovalStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '대기' },
  approved: { bg: 'bg-green-500/20', text: 'text-green-400', label: '승인' },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-400', label: '반려' },
  published: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '발행됨' },
};

export default function ApprovalQueue({ campaignId, campaignName, onBack }: ApprovalQueueProps) {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const list = await listPendingItems(campaignId);
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleApprove = async (id: string) => {
    try {
      setProcessing(prev => new Set(prev).add(id));
      await approveItem(id);
      await loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectNotes.trim()) { setError('반려 사유를 입력하세요'); return; }
    try {
      setProcessing(prev => new Set(prev).add(id));
      await rejectItem(id, rejectNotes);
      setRejectingId(null);
      setRejectNotes('');
      await loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleBulkApprove = async () => {
    const pendingIds = items.filter(i => i.status === 'pending').map(i => i.id);
    if (pendingIds.length === 0) return;
    try {
      setProcessing(new Set(pendingIds));
      await bulkApprove(pendingIds);
      await loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to bulk approve');
    } finally {
      setProcessing(new Set());
    }
  };

  const pendingItems = items.filter(i => i.status === 'pending');
  const formatDate = (d: string) => new Date(d).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>승인 대기열</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{campaignName}</p>
          </div>
          <div className="flex gap-2">
            {pendingItems.length > 0 && (
              <button onClick={handleBulkApprove} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                disabled={processing.size > 0}>
                전체 승인 ({pendingItems.length})
              </button>
            )}
            <button onClick={onBack} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>뒤로</button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Items */}
        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg mb-1" style={{ color: 'var(--text-secondary)' }}>대기 중인 콘텐츠가 없습니다</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>새로운 콘텐츠가 생성되면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map(item => {
              const s = STATUS_STYLES[item.status];
              const topic = (item.content_data?.topic as string) || (item.content_data?.title as string) || '제목 없음';
              const narration = (item.content_data?.narration as string) || (item.content_data?.script as string) || '';
              const emotionInfo = item.emotion_curve_used
                ? `감정 곡선: ${item.emotion_curve_used?.curve_points?.length || 0}포인트`
                : null;
              const isProcessing = processing.has(item.id);

              return (
                <div key={item.id} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{topic}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      {narration && (
                        <p className="text-xs line-clamp-2 mb-1" style={{ color: 'var(--text-secondary)' }}>{narration}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {emotionInfo && <span>{emotionInfo}</span>}
                        <span>예상 {item.estimated_credits} 크레딧</span>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {item.status === 'pending' && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {rejectingId === item.id ? (
                        <div className="flex gap-2">
                          <input
                            value={rejectNotes}
                            onChange={e => setRejectNotes(e.target.value)}
                            placeholder="반려 사유를 입력하세요..."
                            className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}
                          />
                          <button onClick={() => handleReject(item.id)} disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50">
                            확인
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(item.id)} disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50">
                            {isProcessing ? '처리 중...' : '승인'}
                          </button>
                          <button onClick={() => setRejectingId(item.id)} disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50">
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {item.review_notes && (
                    <div className="mt-2 p-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                      반려 사유: {item.review_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
