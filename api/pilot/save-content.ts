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

// Ensure the pilot-content bucket exists (auto-create if missing)
async function ensureBucket(supabase: ReturnType<typeof getSupabase>): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b: { name: string }) => b.name === 'pilot-content');
  if (!exists) {
    await supabase.storage.createBucket('pilot-content', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    });
  }
}

// Upload base64 data to Supabase Storage and return public URL
async function uploadToStorage(
  supabase: ReturnType<typeof getSupabase>,
  base64DataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.split('/')[1] || 'bin';
    const fullPath = `${path}.${ext}`;

    await ensureBucket(supabase);

    const { error } = await supabase.storage
      .from('pilot-content')
      .upload(fullPath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('[uploadToStorage] error:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('pilot-content')
      .getPublicUrl(fullPath);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('[uploadToStorage] exception:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = params.token;

  try {
    const supabase = getSupabase();

    switch (action) {

      // ══════════════════════════════════════════
      // Asset Uploads
      // ══════════════════════════════════════════

      // ── Upload scene image or audio ──
      case 'upload-asset': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { queueId, sceneNumber, assetType, base64Data } = params;
        if (!queueId || sceneNumber == null || !assetType || !base64Data) {
          return res.status(400).json({ error: 'queueId, sceneNumber, assetType, and base64Data are required' });
        }

        if (assetType !== 'image' && assetType !== 'audio') {
          return res.status(400).json({ error: 'assetType must be "image" or "audio"' });
        }

        const path = `${queueId}/scene-${sceneNumber}-${assetType}`;
        const url = await uploadToStorage(supabase, base64Data, path);
        if (!url) return res.status(500).json({ error: 'Failed to upload asset' });

        return res.json({ url });
      }

      // ── Upload BGM ──
      case 'upload-bgm': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { queueId, base64Data } = params;
        if (!queueId || !base64Data) {
          return res.status(400).json({ error: 'queueId and base64Data are required' });
        }

        const path = `${queueId}/bgm`;
        const url = await uploadToStorage(supabase, base64Data, path);
        if (!url) return res.status(500).json({ error: 'Failed to upload BGM' });

        return res.json({ url });
      }

      // ══════════════════════════════════════════
      // Approval Queue Operations
      // ══════════════════════════════════════════

      // ── Create approval queue entry ──
      case 'save-to-queue': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { campaignId, contentData, emotionCurveUsed, estimatedCredits, metadata } = params;
        if (!contentData || estimatedCredits == null) {
          return res.status(400).json({ error: 'contentData and estimatedCredits are required' });
        }

        const insertPayload: Record<string, unknown> = {
          content_data: contentData,
          estimated_credits: estimatedCredits,
          platform_variants: {},
          status: 'pending',
        };

        if (campaignId) insertPayload.campaign_id = campaignId;
        if (emotionCurveUsed != null) insertPayload.emotion_curve_used = emotionCurveUsed;
        if (metadata) insertPayload.metadata = metadata;
        // Store creator email in metadata for tracking
        insertPayload.metadata = { ...(metadata || {}), creator_email: email };

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .insert(insertPayload)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ item: data });
      }

      // ── Update existing queue item content_data ──
      case 'update-queue': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id, contentData } = params;
        if (!id || !contentData) {
          return res.status(400).json({ error: 'id and contentData are required' });
        }

        const { data, error } = await supabase
          .from('c2gen_approval_queue')
          .update({ content_data: contentData })
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ item: data });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    console.error('[save-content] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
