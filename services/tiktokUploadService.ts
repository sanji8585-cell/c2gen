const API_AUTH = '/api/tiktok-auth';
const API_UPLOAD = '/api/tiktok-upload';

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

export async function initTiktokAuth(): Promise<{ authUrl: string }> {
  return apiCall(API_AUTH, 'tiktok-init-auth');
}

export async function checkTiktokStatus(): Promise<{ connected: boolean; open_id?: string; token_expired?: boolean }> {
  return apiCall(API_AUTH, 'tiktok-status');
}

export async function disconnectTiktok(): Promise<void> {
  await apiCall(API_AUTH, 'tiktok-disconnect');
}

export async function uploadToTiktok(params: {
  video_base64: string;
  caption: string;
}): Promise<{ success: boolean; publishId?: string; uploadLogId?: string }> {
  return apiCall(API_UPLOAD, 'tiktok-upload', params);
}

export async function checkTiktokUploadStatus(uploadLogId: string): Promise<{
  id: string;
  platform: string;
  status: string;
  error_message?: string;
}> {
  return apiCall(API_UPLOAD, 'tiktok-upload-status', { uploadLogId });
}
