import type { Campaign } from '../types';

const API_URL = '/api/campaign';

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

export async function listCampaigns(): Promise<Campaign[]> {
  const data = await apiCall('campaign-list');
  return data.campaigns;
}

export async function createCampaign(campaignData: Partial<Campaign>): Promise<Campaign> {
  const data = await apiCall('campaign-create', campaignData);
  return data.campaign;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign> {
  const data = await apiCall('campaign-update', { id, ...updates });
  return data.campaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  await apiCall('campaign-delete', { id });
}

export async function getCampaign(id: string): Promise<Campaign & { pending_count: number }> {
  const data = await apiCall('campaign-get', { id });
  return data.campaign;
}
