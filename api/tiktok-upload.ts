import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

async function getSessionEmail(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions').select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString()).single();
  return data?.email || null;
}

async function getActiveConnection(supabase: ReturnType<typeof getSupabase>, email: string) {
  const { data } = await supabase
    .from('c2gen_platform_connections')
    .select('access_token, refresh_token, token_expires_at, open_id')
    .eq('user_email', email)
    .eq('platform', 'tiktok')
    .eq('is_active', true)
    .single();
  return data;
}

async function refreshTokenIfNeeded(supabase: ReturnType<typeof getSupabase>, email: string, connection: any): Promise<string> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  // Refresh if token expires within 5 minutes
  if (expiresAt && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return connection.access_token;
  }

  if (!connection.refresh_token) {
    throw new Error('Token expired and no refresh token available. Please reconnect TikTok.');
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('TikTok OAuth not configured on server');
  }

  const refreshRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }).toString(),
  });

  const refreshData = await refreshRes.json();
  if (!refreshRes.ok || refreshData.error) {
    throw new Error(`Token refresh failed: ${refreshData.error_description || 'unknown error'}`);
  }

  const now = new Date().toISOString();
  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 86400) * 1000).toISOString();

  await supabase.from('c2gen_platform_connections')
    .update({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token || connection.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: now,
    })
    .eq('user_email', email)
    .eq('platform', 'tiktok');

  return refreshData.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const email = await getSessionEmail(supabase, token);
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired session' });
    }

    switch (action) {
      // ── 동영상 업로드 (2-step: init + upload) ──
      case 'tiktok-upload': {
        const { video_base64, caption } = params;
        if (!video_base64) {
          return res.status(400).json({ error: 'video_base64 is required' });
        }

        // Get active TikTok connection
        const connection = await getActiveConnection(supabase, email);
        if (!connection) {
          return res.status(400).json({ error: 'TikTok not connected. Please connect your account first.' });
        }

        // Refresh token if needed
        const accessToken = await refreshTokenIfNeeded(supabase, email, connection);

        // Decode video
        const videoBuffer = Buffer.from(video_base64, 'base64');
        const videoSizeBytes = videoBuffer.length;

        // Step 1: Init upload
        const initBody = {
          post_info: {
            title: caption || 'Created with TubeGen AI',
            privacy_level: 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSizeBytes,
            chunk_size: videoSizeBytes,
            total_chunk_count: 1,
          },
        };

        const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(initBody),
        });

        const initData = await initRes.json();

        if (!initRes.ok || initData.error?.code) {
          console.error('[tiktok-upload] Init failed:', initData);
          return res.status(400).json({
            error: initData.error?.message || 'Upload initialization failed',
            details: initData.error,
          });
        }

        const uploadUrl = initData.data?.upload_url;
        const publishId = initData.data?.publish_id;

        if (!uploadUrl) {
          return res.status(500).json({ error: 'No upload URL returned from TikTok' });
        }

        // Step 2: Upload video file
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${videoSizeBytes - 1}/${videoSizeBytes}`,
            'Content-Length': String(videoSizeBytes),
          },
          body: videoBuffer,
        });

        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.text();
          console.error('[tiktok-upload] Upload failed:', uploadRes.status, uploadErr);
          return res.status(500).json({ error: 'Video file upload failed' });
        }

        // Create upload log entry
        const { data: logEntry } = await supabase.from('c2gen_upload_logs').insert({
          user_email: email,
          platform: 'tiktok',
          platform_video_id: publishId || null,
          title: caption || 'TubeGen AI Video',
          status: 'processing',
          video_size_bytes: videoSizeBytes,
          created_at: new Date().toISOString(),
        }).select('id').single();

        return res.json({
          success: true,
          publishId,
          uploadLogId: logEntry?.id || null,
        });
      }

      // ── 업로드 상태 확인 ──
      case 'tiktok-upload-status': {
        const { uploadLogId } = params;
        if (!uploadLogId) {
          return res.status(400).json({ error: 'uploadLogId is required' });
        }

        const { data: log } = await supabase
          .from('c2gen_upload_logs')
          .select('id, platform, platform_video_id, title, status, created_at, error_message')
          .eq('id', uploadLogId)
          .eq('user_email', email)
          .single();

        if (!log) {
          return res.status(404).json({ error: 'Upload log not found' });
        }

        return res.json(log);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[tiktok-upload] ${action} failed:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
