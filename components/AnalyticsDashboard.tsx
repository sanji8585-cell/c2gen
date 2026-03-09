import React, { useState, useEffect, useCallback } from 'react';
import type { FeedbackInsight } from '../types';
import { getCampaignSummary, getInsights, generateInsights, applyInsight, type CampaignAnalyticsSummary } from '../services/analyticsService';

interface AnalyticsDashboardProps {
  campaignId: string;
  campaignName: string;
  onBack: () => void;
}

const CATEGORY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  retention: { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  comments: { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  ctr: { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  channel_growth: { border: 'border-green-500', bg: 'bg-green-500/10', text: 'text-green-400' },
};

const TAB_CONFIG = [
  { key: 'auto_applied' as const, label: '자동 적용' },
  { key: 'requires_approval' as const, label: '승인 필요' },
  { key: 'observation' as const, label: '관찰' },
];

export default function AnalyticsDashboard({ campaignId, campaignName, onBack }: AnalyticsDashboardProps) {
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [insights, setInsights] = useState<FeedbackInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'auto_applied' | 'requires_approval' | 'observation'>('auto_applied');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, insightsData] = await Promise.all([
        getCampaignSummary(campaignId),
        getInsights(campaignId),
      ]);
      setSummary(summaryData);
      setInsights(insightsData);
    } catch {
      setError('분석 데이터 로딩에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    try {
      await generateInsights(campaignId);
      const refreshed = await getInsights(campaignId);
      setInsights(refreshed);
    } catch {
      setError('인사이트 생성에 실패했습니다.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleApplyInsight = async (insightId: string) => {
    try {
      await applyInsight(insightId, 'apply');
      setInsights(prev => prev.map(i => i.id === insightId ? { ...i, applied: true } : i));
    } catch {
      setError('인사이트 적용에 실패했습니다.');
    }
  };

  const handleDismissInsight = (insightId: string) => {
    setInsights(prev => prev.filter(i => i.id !== insightId));
  };

  const filteredInsights = insights.filter(i => i.insight_type === activeTab);

  const summaryCards = summary ? [
    { icon: '👁', value: summary.total_views.toLocaleString(), label: 'Total Views' },
    { icon: '❤', value: summary.total_likes.toLocaleString(), label: 'Total Likes' },
    { icon: '💬', value: summary.total_comments.toLocaleString(), label: 'Total Comments' },
    { icon: '🔗', value: `${summary.avg_ctr.toFixed(1)}%`, label: 'Avg CTR' },
    { icon: '📊', value: `${summary.avg_engagement_rate.toFixed(1)}%`, label: 'Avg Engagement' },
    { icon: '📄', value: summary.content_count.toString(), label: 'Content Count' },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" style={{ color: 'var(--text-muted)' }}>
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mr-3" />
        데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
          ← 뒤로
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{campaignName}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>캠페인 분석 대시보드</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-2">&#x2715;</button>
        </div>
      )}

      {/* Section 1: Summary Cards */}
      <section>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>성과 요약</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {summaryCards.map(card => (
            <div key={card.label} className="rounded-xl p-4 text-center transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                {card.value}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: AI Insights Panel */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>AI 인사이트</h2>
          <button onClick={handleGenerateInsights} disabled={insightsLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}>
            {insightsLoading ? '생성 중...' : '인사이트 생성'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ background: 'var(--bg-elevated)' }}>
          {TAB_CONFIG.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'text-white shadow-sm' : ''}`}
              style={activeTab === tab.key
                ? { background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }
                : { color: 'var(--text-secondary)' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Insight Cards */}
        <div className="space-y-3">
          {filteredInsights.length === 0 ? (
            <div className="text-center py-8 rounded-xl" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              이 카테고리에 인사이트가 없습니다
            </div>
          ) : filteredInsights.map(insight => {
            const colors = CATEGORY_COLORS[insight.category] || CATEGORY_COLORS.retention;
            return (
              <div key={insight.id} className={`rounded-xl p-4 border-l-4 ${colors.border}`}
                style={{ background: 'var(--bg-surface)', borderColor: undefined }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {insight.category}
                      </span>
                      {insight.applied && (
                        <span className="text-green-400 text-xs font-medium flex items-center gap-1">✓ 적용됨</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{insight.title}</h3>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{insight.description}</p>
                  </div>
                  {activeTab === 'requires_approval' && !insight.applied && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleApplyInsight(insight.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 transition-colors">
                        적용
                      </button>
                      <button onClick={() => handleDismissInsight(insight.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        무시
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Performance Trend Placeholder */}
      <section>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>성과 추이</h2>
        <div className="rounded-xl p-8 flex flex-col items-center justify-center min-h-[240px]"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <svg width="280" height="100" viewBox="0 0 280 100" fill="none" className="opacity-20 mb-4">
            <polyline points="0,80 40,65 80,70 120,45 160,50 200,30 240,35 280,15"
              stroke="#06b6d4" strokeWidth="2" fill="none" />
            <polyline points="0,90 40,85 80,75 120,70 160,60 200,55 240,45 280,40"
              stroke="#3b82f6" strokeWidth="2" fill="none" strokeDasharray="4 4" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            성과 데이터가 축적되면 여기에 차트가 표시됩니다
          </p>
        </div>
      </section>
    </div>
  );
}
