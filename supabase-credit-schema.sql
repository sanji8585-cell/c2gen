-- ============================================================
-- TubeGen AI - 크레딧/결제 시스템 DB 스키마
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 1. c2gen_users 테이블에 크레딧/요금제 컬럼 추가
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS credits integer DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';

-- 2. 크레딧 트랜잭션 히스토리
CREATE TABLE IF NOT EXISTS c2gen_credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  type text NOT NULL,
  description text,
  reference_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_email ON c2gen_credit_transactions(email);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON c2gen_credit_transactions(created_at DESC);

-- 3. 구독 정보
CREATE TABLE IF NOT EXISTS c2gen_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  payment_provider text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  monthly_credits integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. 결제 내역
CREATE TABLE IF NOT EXISTS c2gen_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  provider text NOT NULL,
  provider_payment_id text NOT NULL UNIQUE,
  amount integer NOT NULL,
  credits integer NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_email ON c2gen_payments(email);

-- 5. 크레딧 차감 RPC (원자적 연산 - FOR UPDATE 락)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_email text,
  p_amount integer,
  p_description text DEFAULT ''
) RETURNS jsonb AS $$
DECLARE
  v_current integer;
  v_new integer;
BEGIN
  SELECT credits INTO v_current FROM c2gen_users WHERE email = p_email FOR UPDATE;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'current', v_current, 'required', p_amount);
  END IF;
  v_new := v_current - p_amount;
  UPDATE c2gen_users SET credits = v_new WHERE email = p_email;
  INSERT INTO c2gen_credit_transactions (email, amount, balance_after, type, description)
  VALUES (p_email, -p_amount, v_new, 'deduct', p_description);
  RETURN jsonb_build_object('success', true, 'balance', v_new);
END;
$$ LANGUAGE plpgsql;

-- 6. 크레딧 충전 RPC
CREATE OR REPLACE FUNCTION add_credits(
  p_email text,
  p_amount integer,
  p_type text DEFAULT 'charge',
  p_description text DEFAULT '',
  p_reference_id text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_new integer;
BEGIN
  UPDATE c2gen_users SET credits = credits + p_amount WHERE email = p_email
  RETURNING credits INTO v_new;
  IF v_new IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  INSERT INTO c2gen_credit_transactions (email, amount, balance_after, type, description, reference_id)
  VALUES (p_email, p_amount, v_new, p_type, p_description, p_reference_id);
  RETURN jsonb_build_object('success', true, 'balance', v_new);
END;
$$ LANGUAGE plpgsql;
