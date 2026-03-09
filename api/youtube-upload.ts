import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Inlined Utilities ──

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
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email || null;
}

async function logError(action: string, errorMessage: string, options?: {
  severity?: 'info' | 'warn' | 'error' | 'critical';
  stack?: string;
  email?: string;
  context?: Record<string, any>;
}) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from('c2gen_error_logs').insert({
      service: 'youtube-upload', action, error_message: errorMessage,
      severity: options?.severity || 'error',
      stack_trace: options?.stack?.slice(0, 4000),
      email: options?.email,
      request_context: options?.context,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* ignore */ }
}

function getYouTubeConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

/**
 * Get active YouTube connection for a user, auto-refreshing token if expired.
 */
async function getActiveConnection(
  supabase: ReturnType<typeof getSupabase>,
  email: string
): Promise<{ accessToken: string; conn: any } | { error: string }> {
  const { data: conn } = await supabase
    .from('c2gen_platform_connections')
    .select('*')
    .eq('user_email', email)
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .single();

  if (!conn) return { error: 'YouTube not connected. Please connect your account first.' };

  // Check if token is expired (with 5 min buffer)
  const isExpired = conn.token_expires_at &&
    new Date(conn.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired) {
    if (!conn.refresh_token) return { error: 'Token expired and no refresh token available. Please reconnect.' };

    const config = getYouTubeConfig();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: conn.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      return { error: 'Failed to refresh YouTube token. Please reconnect.' };
    }

    const tokens = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    await supabase
      .from('c2gen_platform_connections')
      .update({
        access_token: tokens.access_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_email', email)
      .eq('platform', 'youtube');

    return { accessToken: tokens.access_token, conn };
  }

  return { accessToken: conn.access_token, conn };
}

// ── Handler ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const token = params.token;
    const email = await getSessionEmail(supabase, token);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    switch (action) {

      // ── 1. YouTube 영상 업로드 ──
      case 'youtube-upload': {
        const { video_url, video_base64, title, description, tags, categoryId, privacyStatus } = params;

        if (!title) return res.status(400).json({ error: 'Missing required field: title' });
        if (!video_url && !video_base64) {
          return res.status(400).json({ error: 'Missing required field: video_url or video_base64' });
        }

        // Get active connection (auto-refresh if needed)
        const connResult = await getActiveConnection(supabase, email);
        if ('error' in connResult) return res.status(400).json({ error: connResult.error });
        const { accessToken } = connResult;

        // Get video data
        let videoBuffer: Buffer;
        if (video_base64) {
          videoBuffer = Buffer.from(video_base64, 'base64');
        } else {
          // Fetch video from URL
          const videoRes = await fetch(video_url);
          if (!videoRes.ok) {
            return res.status(400).json({ error: 'Failed to fetch video from URL' });
          }
          const arrayBuf = await videoRes.arrayBuffer();
          videoBuffer = Buffer.from(arrayBuf);
        }

        // Create upload log entry
        const { data: logEntry, error: logInsertErr } = await supabase
          .from('c2gen_upload_logs')
          .insert({
            user_email: email,
            platform: 'youtube',
            title,
            status: 'uploading',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        const uploadLogId = logEntry?.id || null;
        if (logInsertErr) {
          console.error('[api/youtube-upload] Failed to create upload log:', logInsertErr.message);
        }

        // Step 1: Initialize resumable upload
        const initRes = await fetch(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Length': String(videoBuffer.length),
              'X-Upload-Content-Type': 'video/mp4',
            },
            body: JSON.stringify({
              snippet: {
                title,
                description: description || '',
                tags: tags || [],
                categoryId: categoryId || '22',
              },
              status: {
                privacyStatus: privacyStatus || 'private',
                selfDeclaredMadeForKids: false,
              },
            }),
          }
        );

        if (!initRes.ok) {
          const errText = await initRes.text();
          await logError('youtube-upload', `Upload init failed: ${errText}`, { email });

          if (uploadLogId) {
            await supabase.from('c2gen_upload_logs')
              .update({ status: 'failed', error_message: errText, updated_at: new Date().toISOString() })
              .eq('id', uploadLogId);
          }
          return res.status(500).json({ error: 'YouTube upload initialization failed', details: errText });
        }

        const uploadUrl = initRes.headers.get('location');
        if (!uploadUrl) {
          await logError('youtube-upload', 'No upload URL returned from YouTube', { email });
          return res.status(500).json({ error: 'No upload URL returned from YouTube' });
        }

        // Step 2: Upload video data
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(videoBuffer.length),
          },
          body: videoBuffer,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          await logError('youtube-upload', `Upload failed: ${errText}`, { email });

          if (uploadLogId) {
            await supabase.from('c2gen_upload_logs')
              .update({ status: 'failed', error_message: errText, updated_at: new Date().toISOString() })
              .eq('id', uploadLogId);
          }
          return res.status(500).json({ error: 'YouTube upload failed', details: errText });
        }

        const result = await uploadRes.json();
        const videoId = result.id;

        // Update upload log
        if (uploadLogId) {
          await supabase.from('c2gen_upload_logs')
            .update({
              status: 'completed',
              platform_video_id: videoId,
              platform_url: `https://www.youtube.com/watch?v=${videoId}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', uploadLogId);
        }

        return res.json({
          success: true,
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          uploadLogId,
        });
      }

      // ── 2. 업로드 상태 확인 ──
      case 'youtube-upload-status': {
        const { uploadLogId } = params;
        if (!uploadLogId) return res.status(400).json({ error: 'Missing uploadLogId' });

        const { data: log } = await supabase
          .from('c2gen_upload_logs')
          .select('*')
          .eq('id', uploadLogId)
          .eq('user_email', email)
          .single();

        if (!log) return res.status(404).json({ error: 'Upload log not found' });

        return res.json(log);
      }

      // ── 3. 영상 공개 전환 ──
      case 'youtube-set-public': {
        const { platformVideoId } = params;
        if (!platformVideoId) return res.status(400).json({ error: 'Missing platformVideoId' });

        // Get active connection (auto-refresh if needed)
        const connResult = await getActiveConnection(supabase, email);
        if ('error' in connResult) return res.status(400).json({ error: connResult.error });
        const { accessToken } = connResult;

        // Update video privacy status
        const updateRes = await fetch(
          'https://www.googleapis.com/youtube/v3/videos?part=status',
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: platformVideoId,
              status: {
                privacyStatus: 'public',
                selfDeclaredMadeForKids: false,
              },
            }),
          }
        );

        if (!updateRes.ok) {
          const errText = await updateRes.text();
          await logError('youtube-set-public', `Privacy update failed: ${errText}`, { email });
          return res.status(500).json({ error: 'Failed to update video privacy', details: errText });
        }

        // Update upload log
        await supabase.from('c2gen_upload_logs')
          .update({ privacy_status: 'public', updated_at: new Date().toISOString() })
          .eq('platform_video_id', platformVideoId)
          .eq('user_email', email);

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    await logError(action || 'unknown', e.message, { stack: e.stack });
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
