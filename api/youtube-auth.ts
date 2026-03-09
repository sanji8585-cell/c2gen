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
      service: 'youtube-auth', action, error_message: errorMessage,
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
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI must be set');
  }
  return { clientId, clientSecret, redirectUri };
}

// ── Handler ──

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ── GET: OAuth callback redirect from Google ──
  if (req.method === 'GET') {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
      }

      const config = getYouTubeConfig();
      const supabase = getSupabase();

      // Validate session from state parameter
      const sessionToken = state as string;
      const email = await getSessionEmail(supabase, sessionToken);
      if (!email) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        await logError('GET-callback', `Token exchange failed: ${err}`, { email });
        return res.status(500).json({ error: 'Token exchange failed' });
      }

      const tokens = await tokenRes.json();

      // Fetch channel info
      const channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const channelData = await channelRes.json();
      const channelName = channelData.items?.[0]?.snippet?.title || 'Unknown Channel';
      const channelId = channelData.items?.[0]?.id || null;

      // Calculate token expiry
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      // Upsert platform connection
      await supabase
        .from('c2gen_platform_connections')
        .upsert({
          user_email: email,
          platform: 'youtube',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: expiresAt,
          platform_user_id: channelId,
          platform_user_name: channelName,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_email,platform' });

      // Redirect back to app
      const appUrl = config.redirectUri.replace(/\/api\/youtube-auth\/?$/, '') || '/';
      return res.redirect(302, `${appUrl}?youtube=connected`);
    } catch (e: any) {
      await logError('GET-callback', e.message, { stack: e.stack });
      return res.status(500).json({ error: e.message || 'OAuth callback failed' });
    }
  }

  // ── POST: Action-based switch ──
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const token = params.token;
    const email = await getSessionEmail(supabase, token);

    switch (action) {

      // ── 1. YouTube OAuth URL 생성 ──
      case 'youtube-init-auth': {
        if (!email) return res.status(401).json({ error: 'Unauthorized' });

        const config = getYouTubeConfig();
        const scopes = [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
        ];

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: scopes.join(' '),
            access_type: 'offline',
            prompt: 'consent',
            state: token,
          }).toString();

        return res.json({ authUrl });
      }

      // ── 2. OAuth 콜백 (POST 방식) ──
      case 'youtube-callback': {
        if (!email) return res.status(401).json({ error: 'Unauthorized' });

        const { code } = params;
        if (!code) return res.status(400).json({ error: 'Missing authorization code' });

        const config = getYouTubeConfig();

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          await logError('youtube-callback', `Token exchange failed: ${err}`, { email });
          return res.status(500).json({ error: 'Token exchange failed' });
        }

        const tokens = await tokenRes.json();

        // Fetch channel info
        const channelRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const channelData = await channelRes.json();
        const channelName = channelData.items?.[0]?.snippet?.title || 'Unknown Channel';
        const channelId = channelData.items?.[0]?.id || null;

        // Calculate token expiry
        const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

        // Upsert platform connection
        await supabase
          .from('c2gen_platform_connections')
          .upsert({
            user_email: email,
            platform: 'youtube',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            token_expires_at: expiresAt,
            platform_user_id: channelId,
            platform_user_name: channelName,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_email,platform' });

        return res.json({ success: true, channel_name: channelName });
      }

      // ── 3. 토큰 갱신 ──
      case 'youtube-refresh': {
        if (!email) return res.status(401).json({ error: 'Unauthorized' });

        const { data: conn } = await supabase
          .from('c2gen_platform_connections')
          .select('*')
          .eq('user_email', email)
          .eq('platform', 'youtube')
          .eq('is_active', true)
          .single();

        if (!conn) return res.status(404).json({ error: 'YouTube not connected' });
        if (!conn.refresh_token) return res.status(400).json({ error: 'No refresh token available' });

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
          const err = await tokenRes.text();
          await logError('youtube-refresh', `Token refresh failed: ${err}`, { email });
          return res.status(500).json({ error: 'Token refresh failed' });
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

        return res.json({ success: true });
      }

      // ── 4. YouTube 연결 해제 ──
      case 'youtube-disconnect': {
        if (!email) return res.status(401).json({ error: 'Unauthorized' });

        await supabase
          .from('c2gen_platform_connections')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_email', email)
          .eq('platform', 'youtube');

        return res.json({ success: true });
      }

      // ── 5. YouTube 연결 상태 확인 ──
      case 'youtube-status': {
        if (!email) return res.status(401).json({ error: 'Unauthorized' });

        const { data: conn } = await supabase
          .from('c2gen_platform_connections')
          .select('platform_user_name, is_active, token_expires_at')
          .eq('user_email', email)
          .eq('platform', 'youtube')
          .single();

        if (!conn) {
          return res.json({ connected: false });
        }

        return res.json({
          connected: conn.is_active,
          channel_name: conn.platform_user_name,
          is_active: conn.is_active,
          token_expires_at: conn.token_expires_at,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    await logError(action || 'unknown', e.message, { stack: e.stack });
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
