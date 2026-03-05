-- ============================================================
-- c2gen_users 누락 컬럼 보완 스크립트
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 기본 게임 컬럼 (원래 auth 시스템에 있어야 했던 것들)
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_generations INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS streak_last_date DATE;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_count INTEGER DEFAULT 0;

-- 크레딧/요금제 (supabase-credit-schema.sql)
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- 게이미피케이션 확장 컬럼 (gamification-schema.sql 재실행 보완)
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS prestige_level INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS prestige_xp_bonus NUMERIC DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_pity_epic INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_pity_legendary INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_images INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_audio INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_videos INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_gacha_pulls INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS max_combo INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS login_days INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_tickets INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT false;

-- 장착 정보 테이블
CREATE TABLE IF NOT EXISTS c2gen_user_equipped (
  email TEXT PRIMARY KEY,
  equipped_title TEXT,
  equipped_badges JSONB DEFAULT '[]',
  equipped_frame TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
