import type { BrandPreset } from '../types';

const API_URL = '/api/brand-preset';

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

export async function listPresets(channelId?: string): Promise<BrandPreset[]> {
  const params: Record<string, unknown> = {};
  if (channelId) params.channel_id = channelId;
  const data = await apiCall('preset-list', params);
  return data.presets;
}

export async function createPreset(presetData: Partial<BrandPreset>): Promise<BrandPreset> {
  const data = await apiCall('preset-create', presetData);
  return data.preset;
}

export async function updatePreset(id: string, presetData: Partial<BrandPreset>): Promise<BrandPreset> {
  const data = await apiCall('preset-update', { id, ...presetData });
  return data.preset;
}

export async function deletePreset(id: string): Promise<void> {
  await apiCall('preset-delete', { id });
}

export async function getPreset(id: string): Promise<BrandPreset> {
  const data = await apiCall('preset-get', { id });
  return data.preset;
}

export async function analyzeTone(texts: string[]): Promise<Record<string, unknown>> {
  const data = await apiCall('tone-analyze', { texts });
  return data.patterns;
}
