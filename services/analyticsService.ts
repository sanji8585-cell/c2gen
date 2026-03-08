import type { ContentAnalytics, FeedbackInsight } from '../types';

const API_URL = '/api/analytics';

function getToken(): string {
  return localStorage.getItem('c2gen_session_token') || '';
}

async function apiCall(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: getToken(), ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export interface CampaignAnalyticsSummary {
  total_views: number;
  total_likes: number;
  total_comments: number;
  avg_engagement_rate: number;
  avg_ctr: number;
  content_count: number;
}

export async function getCampaignSummary(campaignId: string): Promise<CampaignAnalyticsSummary> {
  const data = await apiCall('analytics-campaign-summary', { campaign_id: campaignId });
  return data.summary;
}

export async function getContentDetail(uploadLogId: string): Promise<ContentAnalytics[]> {
  const data = await apiCall('analytics-content-detail', { upload_log_id: uploadLogId });
  return data.snapshots;
}

export async function collectAnalytics(uploadLogId: string, snapshotType: string): Promise<{ analytics_id: string }> {
  return apiCall('analytics-collect', { upload_log_id: uploadLogId, snapshot_type: snapshotType });
}

export async function getInsights(campaignId: string): Promise<FeedbackInsight[]> {
  const data = await apiCall('analytics-insights', { campaign_id: campaignId });
  return data.insights;
}

export async function applyInsight(insightId: string, action: 'apply' | 'dismiss'): Promise<void> {
  await apiCall('analytics-apply-insight', { insight_id: insightId, action });
}

export async function generateInsights(campaignId: string): Promise<{ insights_generated: number }> {
  return apiCall('analytics-generate-insights', { campaign_id: campaignId });
}
