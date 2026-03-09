import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

async function getSessionEmail(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions').select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString()).single();
  return data?.email || null;
}

async function verifyCampaignOwnership(
  supabase: ReturnType<typeof getSupabase>,
  campaignId: string,
  email: string
): Promise<boolean> {
  const { data } = await supabase
    .from('c2gen_campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_email', email)
    .single();
  return !!data;
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const email = await getSessionEmail(supabase, token);

    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    switch (action) {

      // ── 캠페인 분석 요약 ──
      case 'analytics-campaign-summary': {
        const { campaign_id } = params;
        if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

        const owns = await verifyCampaignOwnership(supabase, campaign_id, email);
        if (!owns) return res.status(403).json({ error: 'Campaign not found or access denied' });

        // Get all upload logs for this campaign
        const { data: uploads, error: uploadsErr } = await supabase
          .from('c2gen_upload_logs')
          .select('id')
          .eq('campaign_id', campaign_id);

        if (uploadsErr) throw uploadsErr;

        if (!uploads || uploads.length === 0) {
          return res.json({
            summary: {
              total_views: 0,
              total_likes: 0,
              total_comments: 0,
              avg_engagement_rate: 0,
              avg_ctr: 0,
              content_count: 0,
            },
          });
        }

        const uploadIds = uploads.map((u: { id: string }) => u.id);

        // Get latest analytics snapshot per upload
        const { data: analytics, error: analyticsErr } = await supabase
          .from('c2gen_content_analytics')
          .select('upload_log_id, views, likes, comments, engagement_rate, ctr')
          .in('upload_log_id', uploadIds)
          .order('snapshot_at', { ascending: false });

        if (analyticsErr) throw analyticsErr;

        // Deduplicate: keep only latest snapshot per upload
        const latestByUpload = new Map<string, { views: number; likes: number; comments: number; engagement_rate: number; ctr: number }>();
        for (const row of (analytics || [])) {
          if (!latestByUpload.has(row.upload_log_id)) {
            latestByUpload.set(row.upload_log_id, row);
          }
        }

        const entries = Array.from(latestByUpload.values());
        const contentCount = entries.length;
        const totalViews = entries.reduce((s, e) => s + (e.views || 0), 0);
        const totalLikes = entries.reduce((s, e) => s + (e.likes || 0), 0);
        const totalComments = entries.reduce((s, e) => s + (e.comments || 0), 0);
        const avgEngagement = contentCount > 0 ? entries.reduce((s, e) => s + (e.engagement_rate || 0), 0) / contentCount : 0;
        const avgCtr = contentCount > 0 ? entries.reduce((s, e) => s + (e.ctr || 0), 0) / contentCount : 0;

        return res.json({
          summary: {
            total_views: totalViews,
            total_likes: totalLikes,
            total_comments: totalComments,
            avg_engagement_rate: Math.round(avgEngagement * 100) / 100,
            avg_ctr: Math.round(avgCtr * 100) / 100,
            content_count: contentCount,
          },
        });
      }

      // ── 콘텐츠 상세 분석 ──
      case 'analytics-content-detail': {
        const { upload_log_id } = params;
        if (!upload_log_id) return res.status(400).json({ error: 'upload_log_id is required' });

        const { data: snapshots, error: snapErr } = await supabase
          .from('c2gen_content_analytics')
          .select('*')
          .eq('upload_log_id', upload_log_id)
          .order('snapshot_at', { ascending: true });

        if (snapErr) throw snapErr;

        return res.json({ snapshots: snapshots || [] });
      }

      // ── 분석 데이터 수집 (플레이스홀더) ──
      case 'analytics-collect': {
        const { upload_log_id, snapshot_type } = params;
        if (!upload_log_id || !snapshot_type) {
          return res.status(400).json({ error: 'upload_log_id and snapshot_type are required' });
        }

        const validTypes = ['24h', '72h', '7d'];
        if (!validTypes.includes(snapshot_type)) {
          return res.status(400).json({ error: 'snapshot_type must be one of: 24h, 72h, 7d' });
        }

        // Placeholder: in production, this would call YouTube/TikTok APIs
        const { data: inserted, error: insertErr } = await supabase
          .from('c2gen_content_analytics')
          .insert({
            upload_log_id,
            snapshot_type,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            engagement_rate: 0,
            ctr: 0,
            avg_watch_time: 0,
            snapshot_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;

        return res.json({ success: true, analytics_id: inserted.id });
      }

      // ── AI 피드백 인사이트 조회 ──
      case 'analytics-insights': {
        const { campaign_id } = params;
        if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

        const owns = await verifyCampaignOwnership(supabase, campaign_id, email);
        if (!owns) return res.status(403).json({ error: 'Campaign not found or access denied' });

        const { data: insights, error: insightsErr } = await supabase
          .from('c2gen_feedback_insights')
          .select('*')
          .eq('campaign_id', campaign_id)
          .order('created_at', { ascending: false });

        if (insightsErr) throw insightsErr;

        return res.json({ insights: insights || [] });
      }

      // ── 인사이트 적용/무시 ──
      case 'analytics-apply-insight': {
        const { insight_id, action: insightAction } = params;
        if (!insight_id || !insightAction) {
          return res.status(400).json({ error: 'insight_id and action are required' });
        }

        if (!['apply', 'dismiss'].includes(insightAction)) {
          return res.status(400).json({ error: 'action must be apply or dismiss' });
        }

        const { error: updateErr } = await supabase
          .from('c2gen_feedback_insights')
          .update({
            applied: insightAction === 'apply',
            applied_at: new Date().toISOString(),
          })
          .eq('id', insight_id);

        if (updateErr) throw updateErr;

        return res.json({ success: true });
      }

      // ── AI 인사이트 생성 (플레이스홀더) ──
      case 'analytics-generate-insights': {
        const { campaign_id } = params;
        if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

        const owns = await verifyCampaignOwnership(supabase, campaign_id, email);
        if (!owns) return res.status(403).json({ error: 'Campaign not found or access denied' });

        // Get campaign analytics summary for insight generation
        const { data: uploads } = await supabase
          .from('c2gen_upload_logs')
          .select('id')
          .eq('campaign_id', campaign_id);

        const uploadIds = (uploads || []).map((u: { id: string }) => u.id);

        let avgCtr = 0;
        let totalViews = 0;

        if (uploadIds.length > 0) {
          const { data: analytics } = await supabase
            .from('c2gen_content_analytics')
            .select('views, ctr')
            .in('upload_log_id', uploadIds)
            .order('snapshot_at', { ascending: false });

          if (analytics && analytics.length > 0) {
            totalViews = analytics.reduce((s: number, a: { views: number }) => s + (a.views || 0), 0);
            avgCtr = analytics.reduce((s: number, a: { ctr: number }) => s + (a.ctr || 0), 0) / analytics.length;
          }
        }

        // Generate sample insights based on analytics data
        const insightsToInsert: Array<{
          campaign_id: string;
          type: string;
          category: string;
          message: string;
          priority: string;
          auto_applied: boolean;
          applied: boolean;
          applied_at: string | null;
          created_at: string;
        }> = [];

        const now = new Date().toISOString();

        if (avgCtr > 8) {
          insightsToInsert.push({
            campaign_id,
            type: 'observation',
            category: 'ctr',
            message: '높은 CTR 유지 중',
            priority: 'low',
            auto_applied: false,
            applied: false,
            applied_at: null,
            created_at: now,
          });
        }

        if (totalViews < 100) {
          insightsToInsert.push({
            campaign_id,
            type: 'suggestion',
            category: 'hook',
            message: '후킹 강화 필요',
            priority: 'high',
            auto_applied: false,
            applied: false,
            applied_at: null,
            created_at: now,
          });
        }

        // Always add one auto-applied insight
        insightsToInsert.push({
          campaign_id,
          type: 'auto_applied',
          category: 'emotion_curve',
          message: '감정곡선 미세 조정 적용',
          priority: 'medium',
          auto_applied: true,
          applied: true,
          applied_at: now,
          created_at: now,
        });

        if (insightsToInsert.length > 0) {
          const { error: insertErr } = await supabase
            .from('c2gen_feedback_insights')
            .insert(insightsToInsert);

          if (insertErr) throw insertErr;
        }

        return res.json({ insights_generated: insightsToInsert.length });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[api/analytics] ${action} error:`, err);
    return res.status(500).json({ error: message });
  }
}
