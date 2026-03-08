-- ============================================================
-- C2 PILOT Phase 4: 캠페인 + 승인 대기열
-- 실행: Supabase SQL Editor에서 실행
-- ============================================================

-- 1) 캠페인
CREATE TABLE IF NOT EXISTS c2gen_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  channel_id UUID REFERENCES c2gen_channels(id) ON DELETE SET NULL,
  brand_preset_id UUID REFERENCES c2gen_brand_presets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  topic_strategy JSONB DEFAULT '{}',
  emotion_curve_template JSONB,
  target_platforms TEXT[] DEFAULT '{}',
  video_engine_mode TEXT DEFAULT 'standard' CHECK (video_engine_mode IN ('standard', 'premium', 'fast')),
  schedule JSONB DEFAULT '{}',
  auto_approve BOOLEAN DEFAULT false,
  max_daily_count INTEGER DEFAULT 3,
  budget_limit_daily INTEGER DEFAULT 5000,
  budget_limit_monthly INTEGER DEFAULT 100000,
  budget_used_today INTEGER DEFAULT 0,
  budget_used_month INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  total_generated INTEGER DEFAULT 0,
  total_published INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) 승인 대기열
CREATE TABLE IF NOT EXISTS c2gen_approval_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES c2gen_campaigns(id) ON DELETE CASCADE,
  content_data JSONB NOT NULL,
  platform_variants JSONB DEFAULT '{}',
  emotion_curve_used JSONB,
  metadata JSONB DEFAULT '{}',
  estimated_credits INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  reviewer_email TEXT,
  review_notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON c2gen_campaigns(user_email);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON c2gen_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_approval_campaign ON c2gen_approval_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_approval_status ON c2gen_approval_queue(status);
