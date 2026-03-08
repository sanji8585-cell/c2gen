/**
 * 공유 유틸리티 (auth, gamification, user API에서 공통 사용)
 */
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// ── Supabase 클라이언트 ──

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

// ── 비밀번호 해싱 (PBKDF2, Node.js 내장) ──

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

// ── KST 날짜 헬퍼 (UTC+9) ──

export function getKSTDateStr(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ── 타입 ──

export interface SessionData {
  email: string;
  name: string;
}

// ── 세션 TTL ──

export const SESSION_TTL = 7 * 24 * 60 * 60; // 7일 (초)
export const ADMIN_SESSION_TTL = 4 * 60 * 60; // 4시간 (초)

// ── 관리자 세션 검증 헬퍼 ──

export async function validateAdminSession(supabase: ReturnType<typeof getSupabase>, adminToken: string): Promise<boolean> {
  if (!adminToken) return false;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email')
    .eq('token', adminToken)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email === 'admin';
}

// ── 세션 토큰 검증 + 사용자 이메일 추출 ──

export async function validateSessionToken(supabase: ReturnType<typeof getSupabase>, token: string): Promise<{ valid: boolean; email?: string; name?: string }> {
  if (!token) return { valid: false };
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email, data')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  if (!data) return { valid: false };
  const sessionData = data.data as SessionData;
  return { valid: true, email: data.email, name: sessionData?.name };
}

// ── 크레딧 차감 헬퍼 ──

export async function checkAndDeductCredits(
  supabase: ReturnType<typeof getSupabase>,
  email: string,
  amount: number,
  description: string
): Promise<{ ok: boolean; balance?: number }> {
  const { data: user } = await supabase
    .from('users')
    .select('credits, plan')
    .eq('email', email)
    .single();

  if (!user) return { ok: false };
  if (user.plan === 'operator') return { ok: true, balance: user.credits };
  if (user.credits < amount) return { ok: false, balance: user.credits };

  const { data: updated } = await supabase.rpc('deduct_credits', {
    user_email: email,
    amount,
    description,
  });

  return { ok: true, balance: updated ?? (user.credits - amount) };
}

// ── 사용 로그 기록 ──

export async function logUsage(
  supabase: ReturnType<typeof getSupabase>,
  email: string,
  action: string,
  cost: number
): Promise<void> {
  try {
    await supabase.from('usage_logs').insert({
      email,
      action,
      cost_usd: cost,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* ignore */ }
}
