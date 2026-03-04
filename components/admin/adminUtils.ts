import React from 'react';

// ── 타입 정의 ──

export interface UserInfo {
  email: string;
  name: string;
  password: string;
  status: string;
  createdAt: number;
  lastLoginAt: number | null;
  totalCostUsd: number;
  todayCostUsd: number;
  projectCount: number;
}

export interface SystemStats {
  totalUsers: number;
  approvedUsers: number;
  pendingUsers: number;
  totalCostUsd: number;
  todayCostUsd: number;
  totalProjects: number;
  activeSessions: number;
}

export interface UsageBreakdown {
  [action: string]: { cost: number; count: number };
}

export interface UsageLog {
  action: string;
  cost_usd: number;
  count: number;
  created_at: string;
}

export interface UserProject {
  id: string;
  name: string;
  topic: string;
  thumbnail: string | null;
  cost: any;
  sceneCount: number;
  createdAt: string;
}

export interface ProjectAsset {
  narration?: string;
  visualPrompt?: string;
  imageData?: string;
  audioData?: string;
  videoData?: string;
  videoDuration?: number;
  status?: string;
}

// ── 새 기능 타입 ──

export interface TimeSeriesEntry {
  date: string;
  actions: Record<string, { cost: number; count: number }>;
  totalCost: number;
  totalCount: number;
}

export interface UserRanking {
  email: string;
  cost: number;
  count: number;
}

export interface SessionInfo {
  token: string;
  email: string;
  name: string;
  expires_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  active: boolean;
  created_at: string;
}

export interface ErrorLogEntry {
  id: string;
  service: string;
  action: string;
  error_message: string;
  email?: string;
  created_at: string;
}

export interface ApiKeyServiceStatus {
  configured: boolean;
  keyCount: number;
  subscription?: {
    tier: string;
    characterCount: number;
    characterLimit: number;
    remaining: number;
  };
}

export interface SearchProject extends UserProject {
  email: string;
}

// ── 상수 ──

export const ADMIN_STORAGE_KEY = 'c2gen_admin_token';

export const KRW_RATE = 1450;

export const ACTION_LABELS: Record<string, string> = {
  image: '이미지 생성',
  tts: 'TTS 음성',
  video: '영상 변환',
  script: '스크립트',
};

// ── 포맷 함수 ──

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function formatKrw(usd: number): string {
  return `${Math.round(usd * KRW_RATE).toLocaleString()}원`;
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  return `${formatUsd(usd)} (${formatKrw(usd)})`;
}

export function timeAgo(timestamp: number | string | null): string {
  if (!timestamp) return '-';
  const ms = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diff = Date.now() - ms;
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
}

// ── API 함수 ──

export async function authFetch(body: Record<string, any>) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !data.message) data.message = data.error || `오류가 발생했습니다. (${res.status})`;
  return { ok: res.ok, data };
}

export async function projectsFetch(body: Record<string, any>) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// ── 상태 배지 ──

export function getStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return styles[status] || styles.pending;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = { pending: '대기', approved: '승인', rejected: '거부' };
  return labels[status] || status;
}

export function getProjectCost(cost: any): number {
  if (!cost) return 0;
  return (cost.imageCost || 0) + (cost.ttsCost || 0) + (cost.videoCost || 0);
}
