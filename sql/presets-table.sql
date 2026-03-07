-- 프리셋(프로젝트 설정) 테이블
CREATE TABLE IF NOT EXISTS c2gen_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_presets_email ON c2gen_presets(email);

-- 유저당 최대 20개 제한은 서버 로직에서 처리
