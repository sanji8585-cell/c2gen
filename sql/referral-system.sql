-- =============================================
-- 다단계 추천인 제도 DB 설계
-- =============================================

-- 1. 추천 설정 (관리자 조절용)
CREATE TABLE IF NOT EXISTS c2gen_referral_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN DEFAULT true,
  max_tiers INT DEFAULT 3,                    -- 최대 단계 수 (1~5)
  tier1_reward INT DEFAULT 50,                -- 1단계 추천인 보상 (크레딧)
  tier2_reward INT DEFAULT 20,                -- 2단계 추천인 보상
  tier3_reward INT DEFAULT 10,                -- 3단계 추천인 보상
  tier4_reward INT DEFAULT 5,                 -- 4단계 추천인 보상
  tier5_reward INT DEFAULT 2,                 -- 5단계 추천인 보상
  signup_bonus INT DEFAULT 30,                -- 추천 링크로 가입한 신규 사용자 보너스
  reward_trigger TEXT DEFAULT 'approved',      -- 보상 지급 시점: 'signup' | 'approved' | 'first_project'
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 설정 삽입
INSERT INTO c2gen_referral_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 2. 사용자별 추천 코드 (c2gen_users에 컬럼 추가)
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS referred_by TEXT;  -- 추천인의 email

-- 추천 코드 인덱스
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON c2gen_users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON c2gen_users(referred_by);

-- 3. 추천 보상 이력
CREATE TABLE IF NOT EXISTS c2gen_referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_email TEXT NOT NULL,               -- 보상 받는 사람
  referred_email TEXT NOT NULL,               -- 가입한 사람
  tier INT NOT NULL,                          -- 몇 단계 추천인지 (1, 2, 3...)
  credits INT NOT NULL,                       -- 지급된 크레딧
  status TEXT DEFAULT 'pending',              -- 'pending' | 'paid' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON c2gen_referral_rewards(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred ON c2gen_referral_rewards(referred_email);
