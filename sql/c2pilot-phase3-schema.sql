-- ============================================================
-- C2 PILOT Phase 3: 플랫폼 연동 + 업로드 로그
-- 실행: Supabase SQL Editor에서 실행
-- ============================================================

-- 1) 플랫폼 OAuth 연결
CREATE TABLE IF NOT EXISTS c2gen_platform_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  channel_id TEXT,
  channel_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, platform)
);

-- 2) 업로드 로그
CREATE TABLE IF NOT EXISTS c2gen_upload_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  campaign_id UUID,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
  platform_video_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'published', 'failed', 'private')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_platform_conn_user ON c2gen_platform_connections(user_email);
CREATE INDEX IF NOT EXISTS idx_upload_logs_user ON c2gen_upload_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_upload_logs_status ON c2gen_upload_logs(status);
