-- ============================================================
-- C2 PILOT Phase 5: 성과 분석 + 피드백 인사이트
-- 실행: Supabase SQL Editor에서 실행
-- ============================================================

-- 1) 콘텐츠 성과 데이터
CREATE TABLE IF NOT EXISTS c2gen_content_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_log_id UUID NOT NULL REFERENCES c2gen_upload_logs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
  snapshot_at TIMESTAMPTZ NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('24h', '72h', '7d')),
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  avg_watch_duration FLOAT DEFAULT 0,
  retention_curve JSONB,
  top_comments JSONB DEFAULT '[]',
  ctr FLOAT DEFAULT 0,
  engagement_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) AI 피드백 인사이트
CREATE TABLE IF NOT EXISTS c2gen_feedback_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES c2gen_campaigns(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('auto_applied', 'requires_approval', 'observation')),
  category TEXT NOT NULL CHECK (category IN ('retention', 'comments', 'ctr', 'channel_growth')),
  title TEXT NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}',
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) 감사 로그
CREATE TABLE IF NOT EXISTS c2gen_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  channel_id UUID,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_upload ON c2gen_content_analytics(upload_log_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshot ON c2gen_content_analytics(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON c2gen_feedback_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON c2gen_feedback_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_audit_user ON c2gen_audit_logs(user_email);
