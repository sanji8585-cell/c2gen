import type { Channel } from '../types';

const API_URL = '/api/channel';

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

export async function listChannels(): Promise<Channel[]> {
  const data = await apiCall('channel-list');
  return data.channels;
}

export async function createChannel(channelData: Partial<Channel>): Promise<Channel> {
  const data = await apiCall('channel-create', channelData);
  return data.channel;
}

export async function updateChannel(id: string, channelData: Partial<Channel>): Promise<Channel> {
  const data = await apiCall('channel-update', { id, ...channelData });
  return data.channel;
}

export async function deleteChannel(id: string): Promise<void> {
  await apiCall('channel-delete', { id });
}

export async function getChannel(id: string): Promise<Channel> {
  const data = await apiCall('channel-get', { id });
  return data.channel;
}
