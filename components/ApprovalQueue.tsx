import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = (url: string, id: string) => {
    if (playingAudio === id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingAudio(null);
    } else {
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlayingAudio(null);
      audio.play();
      audioRef.current = audio;
      setPlayingAudio(id);
    }
  };

  useEffect(() => { return () => { audioRef.current?.pause(); }; }, []);

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
              const cd = item.content_data as Record<string, any>;
              const topic = cd?.topic || cd?.title || '제목 없음';
              const assets = (cd?.assets || []) as Array<{ sceneNumber: number; imageUrl?: string; audioUrl?: string; narration?: string; audioDuration?: number }>;
              const bgmUrl = cd?.bgmUrl as string | undefined;
              const meta = cd?.metadata as { title?: string; tags?: string[]; description?: string } | undefined;
              const costs = cd?.costs as { total?: number } | undefined;
              const presetName = cd?.presetName as string | undefined;
              const narration = cd?.narration || cd?.script || (assets[0]?.narration) || '';
              const emotionInfo = item.emotion_curve_used
                ? `감정 곡선: ${item.emotion_curve_used?.curve_points?.length || 0}포인트`
                : null;
              const isProcessing = processing.has(item.id);
              const hasStoryboard = assets.length > 0 && assets.some(a => a.imageUrl);

              return (
                <div key={item.id} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{topic}</h3>
                        {presetName && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 bg-cyan-500/20 text-cyan-400">{presetName}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {emotionInfo && <span>{emotionInfo}</span>}
                        <span>{costs?.total || item.estimated_credits} 크레딧</span>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Storyboard Preview */}
                  {hasStoryboard && (
                    <div className="mt-3 mb-2">
                      {/* Scene thumbnails */}
                      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                        {assets.map((asset) => (
                          <div key={asset.sceneNumber} className="shrink-0 flex flex-col items-center gap-1">
                            {asset.imageUrl ? (
                              <img
                                src={asset.imageUrl}
                                alt={`S${asset.sceneNumber}`}
                                className="rounded-lg object-cover"
                                style={{ width: 96, height: 54, border: '1px solid var(--border-subtle)' }}
                              />
                            ) : (
                              <div className="rounded-lg flex items-center justify-center" style={{ width: 96, height: 54, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>S{asset.sceneNumber}</span>
                              </div>
                            )}
                            {asset.audioUrl && (
                              <button
                                onClick={() => toggleAudio(asset.audioUrl!, `${item.id}-s${asset.sceneNumber}`)}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: playingAudio === `${item.id}-s${asset.sceneNumber}` ? 'rgba(96,165,250,0.2)' : 'var(--bg-base)', color: playingAudio === `${item.id}-s${asset.sceneNumber}` ? '#60a5fa' : 'var(--text-muted)' }}
                              >
                                {playingAudio === `${item.id}-s${asset.sceneNumber}` ? '⏸' : '▶'} S{asset.sceneNumber}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* BGM + Narration preview */}
                      <div className="flex items-center gap-3 mt-1">
                        {bgmUrl && (
                          <button
                            onClick={() => toggleAudio(bgmUrl, `${item.id}-bgm`)}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ backgroundColor: playingAudio === `${item.id}-bgm` ? 'rgba(96,165,250,0.2)' : 'var(--bg-base)', color: playingAudio === `${item.id}-bgm` ? '#60a5fa' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                          >
                            {playingAudio === `${item.id}-bgm` ? '⏸ BGM' : '🎵 BGM'}
                          </button>
                        )}
                        {narration && (
                          <p className="text-xs line-clamp-1 flex-1" style={{ color: 'var(--text-secondary)' }}>{narration}</p>
                        )}
                      </div>

                      {/* Metadata */}
                      {meta?.title && (
                        <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)' }}>
                          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{meta.title}</div>
                          {meta.tags && meta.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {meta.tags.slice(0, 8).map((tag, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>#{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback: text-only narration */}
                  {!hasStoryboard && narration && (
                    <p className="text-xs line-clamp-2 mb-1 mt-1" style={{ color: 'var(--text-secondary)' }}>{narration}</p>
                  )}

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
