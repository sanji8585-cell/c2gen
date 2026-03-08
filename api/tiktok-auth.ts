import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── GET: OAuth redirect callback ──
  if (req.method === 'GET') {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        return res.redirect(`/?tiktok_error=${encodeURIComponent(String(oauthError))}`);
      }

      if (!code || !state) {
        return res.redirect('/?tiktok_error=missing_code_or_state');
      }

      const supabase = getSupabase();

      // Decode state to get session token
      const sessionToken = Buffer.from(String(state), 'base64url').toString('utf-8');
      const email = await getSessionEmail(supabase, sessionToken);
      if (!email) {
        return res.redirect('/?tiktok_error=invalid_session');
      }

      // Exchange code for tokens
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
      const redirectUri = process.env.TIKTOK_REDIRECT_URI;

      if (!clientKey || !clientSecret || !redirectUri) {
        return res.redirect('/?tiktok_error=server_not_configured');
      }

      const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code: String(code),
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        console.error('[tiktok-auth] Token exchange failed:', tokenData);
        return res.redirect(`/?tiktok_error=${encodeURIComponent(tokenData.error_description || 'token_exchange_failed')}`);
      }

      // Store tokens in c2gen_platform_connections
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
      const refreshExpiresAt = new Date(Date.now() + (tokenData.refresh_expires_in || 86400 * 365) * 1000).toISOString();

      await supabase.from('c2gen_platform_connections').upsert({
        user_email: email,
        platform: 'tiktok',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        refresh_token_expires_at: refreshExpiresAt,
        open_id: tokenData.open_id || null,
        scope: tokenData.scope || 'video.upload,video.list',
        is_active: true,
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'user_email,platform' });

      return res.redirect('/?tiktok_connected=true');
    } catch (error: any) {
      console.error('[tiktok-auth] GET callback error:', error.message);
      return res.redirect(`/?tiktok_error=${encodeURIComponent(error.message)}`);
    }
  }

  // ── POST: Actions ──
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const supabase = getSupabase();
    const email = await getSessionEmail(supabase, token);
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired session' });
    }

    switch (action) {
      // ── TikTok OAuth URL 생성 ──
      case 'tiktok-init-auth': {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const redirectUri = process.env.TIKTOK_REDIRECT_URI;

        if (!clientKey || !redirectUri) {
          return res.status(500).json({ error: 'TikTok OAuth not configured on server' });
        }

        // Encode session token as state for callback
        const state = Buffer.from(token).toString('base64url');
        const csrfState = crypto.randomBytes(16).toString('hex');

        const authUrl = `https://www.tiktok.com/v2/auth/authorize/?` +
          `client_key=${encodeURIComponent(clientKey)}` +
          `&scope=video.upload,video.list` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${state}`;

        return res.json({ authUrl });
      }

      // ── OAuth 코드 교환 (수동 콜백용) ──
      case 'tiktok-callback': {
        const { code } = params;
        if (!code) {
          return res.status(400).json({ error: 'Authorization code is required' });
        }

        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        const redirectUri = process.env.TIKTOK_REDIRECT_URI;

        if (!clientKey || !clientSecret || !redirectUri) {
          return res.status(500).json({ error: 'TikTok OAuth not configured on server' });
        }

        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }).toString(),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error) {
          console.error('[tiktok-auth] Token exchange failed:', tokenData);
          return res.status(400).json({
            error: tokenData.error_description || 'Token exchange failed',
          });
        }

        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
        const refreshExpiresAt = new Date(Date.now() + (tokenData.refresh_expires_in || 86400 * 365) * 1000).toISOString();

        await supabase.from('c2gen_platform_connections').upsert({
          user_email: email,
          platform: 'tiktok',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          refresh_token_expires_at: refreshExpiresAt,
          open_id: tokenData.open_id || null,
          scope: tokenData.scope || 'video.upload,video.list',
          is_active: true,
          connected_at: now,
          updated_at: now,
        }, { onConflict: 'user_email,platform' });

        return res.json({ success: true });
      }

      // ── 연결 해제 ──
      case 'tiktok-disconnect': {
        await supabase.from('c2gen_platform_connections')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_email', email)
          .eq('platform', 'tiktok');

        return res.json({ success: true });
      }

      // ── 연결 상태 확인 ──
      case 'tiktok-status': {
        const { data: connection } = await supabase
          .from('c2gen_platform_connections')
          .select('is_active, connected_at, token_expires_at, open_id')
          .eq('user_email', email)
          .eq('platform', 'tiktok')
          .single();

        if (!connection || !connection.is_active) {
          return res.json({ connected: false });
        }

        const isExpired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();

        return res.json({
          connected: true,
          open_id: connection.open_id,
          connected_at: connection.connected_at,
          token_expired: isExpired,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[tiktok-auth] ${action} failed:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
