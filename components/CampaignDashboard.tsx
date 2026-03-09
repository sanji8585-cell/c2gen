import React, { useState, useEffect, useCallback } from 'react';
import type { Campaign, CampaignStatus, TopicStrategy, CampaignSchedule, VideoEngineMode } from '../types';
import { listCampaigns, createCampaign, updateCampaign, deleteCampaign } from '../services/campaignService';
import ApprovalQueue from './ApprovalQueue';

interface CampaignDashboardProps {
  onClose: () => void;
}

type FilterTab = 'all' | 'active' | 'paused';

const STATUS_STYLES: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400', label: '활성' },
  paused: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '일시정지' },
  completed: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: '완료' },
};

const EMPTY_FORM: {
  name: string;
  description: string;
  channel_id: string;
  brand_preset_id: string;
  topic_strategy: TopicStrategy;
  schedule: CampaignSchedule;
  target_platforms: string[];
  video_engine_mode: VideoEngineMode;
  auto_approve: boolean;
  max_daily_count: number;
  budget_limit_daily: number;
  budget_limit_monthly: number;
} = {
  name: '',
  description: '',
  channel_id: '',
  brand_preset_id: '',
  topic_strategy: { mode: 'keyword_pool', keyword_pool: [] },
  schedule: { frequency: 'daily', days: [], time: '09:00', timezone: 'Asia/Seoul', generation_lead_time: 2 },
  target_platforms: [],
  video_engine_mode: 'standard',
  auto_approve: false,
  max_daily_count: 3,
  budget_limit_daily: 500,
  budget_limit_monthly: 10000,
};

export default function CampaignDashboard({ onClose }: CampaignDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [approvalCampaign, setApprovalCampaign] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listCampaigns();
      setCampaigns(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const filtered = campaigns.filter(c => filter === 'all' || c.status === filter);

  const handleSubmit = async () => {
    try {
      setError('');
      if (!form.name.trim()) { setError('캠페인 이름을 입력하세요'); return; }
      if (editingId) {
        await updateCampaign(editingId, form as unknown as Partial<Campaign>);
      } else {
        await createCampaign(form as unknown as Partial<Campaign>);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save campaign');
    }
  };

  const handleEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description || '',
      channel_id: c.channel_id || '',
      brand_preset_id: c.brand_preset_id || '',
      topic_strategy: c.topic_strategy,
      schedule: c.schedule,
      target_platforms: c.target_platforms as string[],
      video_engine_mode: c.video_engine_mode,
      auto_approve: c.auto_approve,
      max_daily_count: c.max_daily_count,
      budget_limit_daily: c.budget_limit_daily,
      budget_limit_monthly: c.budget_limit_monthly,
    });
    setShowForm(true);
  };

  const handleTogglePause = async (c: Campaign) => {
    try {
      const newStatus = c.status === 'active' ? 'paused' : 'active';
      await updateCampaign(c.id, { status: newStatus } as Partial<Campaign>);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 캠페인을 삭제하시겠습니까?')) return;
    try {
      await deleteCampaign(id);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete campaign');
    }
  };

  if (approvalCampaign) {
    return (
      <ApprovalQueue
        campaignId={approvalCampaign.id}
        campaignName={approvalCampaign.name}
        onBack={() => setApprovalCampaign(null)}
      />
    );
  }

  const budgetPercent = (used: number, limit: number) => limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>캠페인 관리</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              새 캠페인
            </button>
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>닫기</button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {([['all', '전체'], ['active', '활성'], ['paused', '일시정지']] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === key ? 'bg-blue-600 text-white' : ''}`}
              style={filter !== key ? { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' } : {}}
            >
              {label} {key === 'all' ? `(${campaigns.length})` : `(${campaigns.filter(c => c.status === key).length})`}
            </button>
          ))}
        </div>

        {/* Campaign form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {editingId ? '캠페인 수정' : '새 캠페인 생성'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>캠페인 이름 *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>설명</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>채널 ID</label>
                <input value={form.channel_id} onChange={e => setForm({ ...form, channel_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>브랜드 프리셋 ID</label>
                <input value={form.brand_preset_id} onChange={e => setForm({ ...form, brand_preset_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>주제 전략</label>
                <select value={form.topic_strategy.mode} onChange={e => setForm({ ...form, topic_strategy: { ...form.topic_strategy, mode: e.target.value as 'keyword_pool' | 'trend_auto' | 'series' | 'hybrid' } })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  <option value="keyword_pool">키워드 풀</option>
                  <option value="trend_auto">트렌드 자동</option>
                  <option value="series">시리즈</option>
                  <option value="hybrid">하이브리드</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>영상 엔진</label>
                <select value={form.video_engine_mode} onChange={e => setForm({ ...form, video_engine_mode: e.target.value as 'standard' | 'premium' | 'fast' })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="fast">Fast</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>스케줄 빈도</label>
                <select value={form.schedule.frequency} onChange={e => setForm({ ...form, schedule: { ...form.schedule, frequency: e.target.value as 'daily' | 'weekly' | 'custom' } })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="custom">커스텀</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>생성 시간</label>
                <input type="time" value={form.schedule.time} onChange={e => setForm({ ...form, schedule: { ...form.schedule, time: e.target.value } })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>대상 플랫폼 (쉼표 구분)</label>
                <input value={(form.target_platforms || []).join(', ')} onChange={e => setForm({ ...form, target_platforms: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="w-full px-3 py-2 rounded-lg text-sm" placeholder="youtube, tiktok, instagram"
                  style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>일일 최대 생성 수</label>
                <input type="number" value={form.max_daily_count} onChange={e => setForm({ ...form, max_daily_count: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>일일 예산 한도</label>
                <input type="number" value={form.budget_limit_daily} onChange={e => setForm({ ...form, budget_limit_daily: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>월간 예산 한도</label>
                <input type="number" value={form.budget_limit_monthly} onChange={e => setForm({ ...form, budget_limit_monthly: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="auto_approve" checked={form.auto_approve} onChange={e => setForm({ ...form, auto_approve: e.target.checked })} />
                <label htmlFor="auto_approve" className="text-sm" style={{ color: 'var(--text-secondary)' }}>자동 승인 (승인 대기열 건너뛰기)</label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSubmit} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {editingId ? '수정' : '생성'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}>
                취소
              </button>
            </div>
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            {campaigns.length === 0 ? '캠페인이 없습니다. 새 캠페인을 생성하세요.' : '해당 필터에 맞는 캠페인이 없습니다.'}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(c => {
              const s = STATUS_STYLES[c.status];
              const dailyPct = budgetPercent(c.budget_used_today, c.budget_limit_daily);
              return (
                <div key={c.id} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      {c.description && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{c.description}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleTogglePause(c)} className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                        {c.status === 'active' ? '일시정지' : '재개'}
                      </button>
                      <button onClick={() => handleEdit(c)} className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                        편집
                      </button>
                      <button onClick={() => setApprovalCampaign({ id: c.id, name: c.name })} className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/20 text-blue-400 transition-colors">
                        승인 대기열
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600/20 text-red-400 transition-colors">
                        삭제
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    <span>플랫폼: {c.target_platforms.join(', ') || '-'}</span>
                    <span>스케줄: {c.schedule.frequency === 'daily' ? '매일' : c.schedule.frequency === 'weekly' ? '매주' : '커스텀'} {c.schedule.time}</span>
                    <span>생성: {c.total_generated}건</span>
                    <span>발행: {c.total_published}건</span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-muted)' }}>일일 예산</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{c.budget_used_today} / {c.budget_limit_daily} 크레딧</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
                      <div className={`h-full rounded-full transition-all ${dailyPct >= 90 ? 'bg-red-500' : dailyPct >= 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${dailyPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
