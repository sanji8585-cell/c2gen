-- 음성 즐겨찾기 테이블
CREATE TABLE IF NOT EXISTS c2gen_favorite_voices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  voice_meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email, voice_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_voices_email ON c2gen_favorite_voices(email);
