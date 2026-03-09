// services/pilot/saveStep.ts
// C2 PILOT — Save Step
// Uploads assets to Supabase Storage via /api/pilot/save-content
// and creates an approval queue entry with final URLs.

import type { EmotionCurve } from '../../types';
import type {
  PipelineContext,
  PilotScriptScene,
  PilotGeneratedAsset,
  PipelineResult,
} from './types';
import { generateMetadata } from '../metadataEngine';

// ── Constants ──

const API_URL = '/api/pilot/save-content';

// ── Auth helper ──

function getToken(): string {
  const token = localStorage.getItem('c2gen_session_token');
  if (!token) throw new Error('No session token found — please log in');
  return token;
}

// ── API call helper ──

async function callSaveApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  const token = getToken();

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...params }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `save-content ${action} failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

// ── Upload helpers ──

async function uploadSceneAsset(
  queueId: string,
  sceneNumber: number,
  assetType: 'image' | 'audio',
  base64Data: string,
): Promise<string | null> {
  try {
    const { url } = await callSaveApi<{ url: string }>('upload-asset', {
      queueId,
      sceneNumber,
      assetType,
      base64Data,
    });
    return url;
  } catch (err) {
    console.warn(`[saveStep] Failed to upload ${assetType} for scene ${sceneNumber}:`, err);
    return null;
  }
}

async function uploadBgm(
  queueId: string,
  base64Data: string,
): Promise<string | null> {
  try {
    const { url } = await callSaveApi<{ url: string }>('upload-bgm', {
      queueId,
      base64Data,
    });
    return url;
  } catch (err) {
    console.warn('[saveStep] Failed to upload BGM:', err);
    return null;
  }
}

// ── Main Export ──

export async function runSaveStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
  bgmData: string | null,
  emotionCurve: EmotionCurve,
  costs: { script: number; images: number; tts: number; bgm: number; total: number },
  durationMs: number,
): Promise<PipelineResult> {
  const total = assets.length + (bgmData ? 1 : 0) + 2; // assets uploads + bgm + create + update
  let current = 0;

  ctx.onProgress({ step: 'save', current, total, message: 'Saving to approval queue...' });

  // 1. Generate metadata
  const contentMetadata = generateMetadata(ctx.topic, scenes, emotionCurve);

  // 2. Build initial content_data (with base64 still inline for the queue record)
  const initialContentData = {
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    platform: ctx.platform,
    language: ctx.language,
    scenes: scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      narration: s.narration,
      visualPrompt: s.visualPrompt,
      speakerName: s.speakerName,
      emotionTag: s.emotionTag,
    })),
    // Placeholder — will be replaced with URLs after upload
    assets: assets.map((a) => ({
      sceneNumber: a.sceneNumber,
      narration: a.narration,
      imageUrl: null as string | null,
      audioUrl: null as string | null,
      subtitleData: a.subtitleData,
      audioDuration: a.audioDuration,
      status: a.status,
      creditCost: a.creditCost,
    })),
    bgmUrl: null as string | null,
    emotionCurve,
    costs,
    generatedAt: new Date().toISOString(),
    durationMs,
  };

  // 3. Create approval queue entry
  const { item } = await callSaveApi<{ item: { id: string } }>('save-to-queue', {
    campaignId: ctx.campaignId || null,
    contentData: initialContentData,
    emotionCurveUsed: true,
    estimatedCredits: costs.total,
    metadata: {
      youtube: contentMetadata.youtube,
      tiktok: contentMetadata.tiktok,
    },
  });

  const queueId = item.id;
  current++;
  ctx.onProgress({ step: 'save', current, total, message: 'Uploading assets...' });

  // 4. Upload each scene's image and audio in parallel
  const uploadPromises: Promise<void>[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const sceneNumber = asset.sceneNumber;

    uploadPromises.push(
      (async () => {
        // Upload image
        if (asset.imageUrl && asset.imageUrl.startsWith('data:')) {
          const imageStorageUrl = await uploadSceneAsset(queueId, sceneNumber, 'image', asset.imageUrl);
          if (imageStorageUrl) {
            initialContentData.assets[i].imageUrl = imageStorageUrl;
            asset.imageUrl = imageStorageUrl;
          }
        } else {
          // Already a URL (or null)
          initialContentData.assets[i].imageUrl = asset.imageUrl;
        }

        // Upload audio
        if (asset.audioUrl && asset.audioUrl.startsWith('data:')) {
          const audioStorageUrl = await uploadSceneAsset(queueId, sceneNumber, 'audio', asset.audioUrl);
          if (audioStorageUrl) {
            initialContentData.assets[i].audioUrl = audioStorageUrl;
            asset.audioUrl = audioStorageUrl;
          }
        } else {
          initialContentData.assets[i].audioUrl = asset.audioUrl;
        }

        current++;
        ctx.onProgress({
          step: 'save',
          current,
          total,
          message: `Uploaded scene ${sceneNumber} assets`,
        });
      })(),
    );
  }

  await Promise.all(uploadPromises);

  // 5. Upload BGM
  let bgmUrl: string | null = null;
  if (bgmData && bgmData.startsWith('data:')) {
    bgmUrl = await uploadBgm(queueId, bgmData);
    initialContentData.bgmUrl = bgmUrl;
  }
  current++;
  ctx.onProgress({ step: 'save', current, total, message: 'Finalizing...' });

  // 6. Update queue entry with final URLs (strip large data to avoid 413)
  const finalContentData = {
    ...initialContentData,
    // Replace emotionCurve with lightweight summary
    emotionCurve: emotionCurve ? {
      story_arc: emotionCurve.story_arc,
      platform_variant: emotionCurve.platform_variant,
      total_duration: emotionCurve.total_duration,
      point_count: emotionCurve.curve_points?.length || 0,
    } : null,
    // Strip subtitleData from assets (too large for JSON payload)
    assets: initialContentData.assets.map(a => ({
      ...a,
      subtitleData: a.subtitleData ? { wordCount: (a.subtitleData as any)?.words?.length || 0 } : null,
    })),
  };

  await callSaveApi('update-queue', {
    id: queueId,
    contentData: finalContentData,
  });

  current++;
  ctx.onProgress({ step: 'save', current, total, message: 'Save complete' });

  // 7. Build and return PipelineResult
  const result: PipelineResult = {
    success: true,
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    scenes,
    assets,
    bgmUrl,
    emotionCurve,
    metadata: {
      title: contentMetadata.youtube.titles[0]?.text || ctx.topic,
      description: contentMetadata.youtube.description,
      tags: contentMetadata.youtube.tags,
      thumbnailText: contentMetadata.youtube.thumbnail_text,
    },
    costs,
    generatedAt: initialContentData.generatedAt,
    durationMs,
  };

  return result;
}
