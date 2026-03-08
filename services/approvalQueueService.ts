import type { ApprovalQueueItem } from '../types';

const API_URL = '/api/approval';

function getToken(): string {
  return localStorage.getItem('c2gen_session_token') || '';
}

async function apiCall(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: getToken(), ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function listPendingItems(campaignId: string): Promise<ApprovalQueueItem[]> {
  const data = await apiCall('approval-list', { campaign_id: campaignId });
  return data.items;
}

export async function approveItem(id: string): Promise<void> {
  await apiCall('approval-approve', { id });
}

export async function rejectItem(id: string, notes: string): Promise<void> {
  await apiCall('approval-reject', { id, review_notes: notes });
}

export async function bulkApprove(ids: string[]): Promise<void> {
  await apiCall('approval-bulk-approve', { ids });
}

export async function getApprovalItem(id: string): Promise<ApprovalQueueItem> {
  const data = await apiCall('approval-get', { id });
  return data.item;
}
