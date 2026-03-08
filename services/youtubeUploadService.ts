const API_AUTH = '/api/youtube-auth';
const API_UPLOAD = '/api/youtube-upload';

function getToken(): string {
  return localStorage.getItem('c2gen_session_token') || '';
}

async function apiCall(url: string, action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(url, {
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

export async function initYoutubeAuth(): Promise<{ authUrl: string }> {
  return apiCall(API_AUTH, 'youtube-init-auth');
}

export async function checkYoutubeStatus(): Promise<{ connected: boolean; channel_name?: string }> {
  return apiCall(API_AUTH, 'youtube-status');
}

export async function disconnectYoutube(): Promise<void> {
  await apiCall(API_AUTH, 'youtube-disconnect');
}

export async function uploadToYoutube(params: {
  video_base64: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'private' | 'public' | 'unlisted';
}): Promise<{ success: boolean; videoId?: string; uploadLogId?: string }> {
  return apiCall(API_UPLOAD, 'youtube-upload', params);
}

export async function setYoutubePublic(platformVideoId: string): Promise<void> {
  await apiCall(API_UPLOAD, 'youtube-set-public', { platformVideoId });
}
