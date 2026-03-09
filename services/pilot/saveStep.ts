// services/pilot/saveStep.ts
// C2 PILOT — Save Step
// 1) Upload assets to Storage (individual API calls per asset)
// 2) Create lightweight approval queue entry with URLs only

import type { EmotionCurve } from '../../types';
import type {
  PipelineContext,
  PilotScriptScene,
  PilotGeneratedAsset,
  PipelineResult,
} from './types';
import { generateMetadata } from '../metadataEngine';

const API_URL = '/api/pilot/save-content';

/**
 * Ensure a value is a proper data URL.
 * API responses often return raw base64 without the `data:...;base64,` prefix.
 * Storage upload requires the full data URL format for MIME detection.
 */
function ensureDataUrl(value: string, defaultMime: string): string {
  if (value.startsWith('data:') || value.startsWith('http')) return value;
  // Raw base64 — wrap with the appropriate data URL prefix
  return `data:${defaultMime};base64,${value}`;
}

function getToken(): string {
  const token = localStorage.getItem('c2gen_session_token');
  if (!token) throw new Error('No session token found — please log in');
  return token;
}

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

// Upload a single base64 asset to Storage via API
async function uploadAsset(
  queueId: string,
  sceneNumber: number,
  assetType: 'image' | 'audio',
  base64Data: string,
): Promise<string | null> {
  try {
    const { url } = await callSaveApi<{ url: string }>('upload-asset', {
      queueId, sceneNumber, assetType, base64Data,
    });
    return url;
  } catch (err) {
    console.warn(`[saveStep] Failed to upload ${assetType} for scene ${sceneNumber}:`, err);
    return null;
  }
}

async function uploadBgm(queueId: string, base64Data: string): Promise<string | null> {
  try {
    const { url } = await callSaveApi<{ url: string }>('upload-bgm', {
      queueId, base64Data,
    });
    return url;
  } catch (err) {
    console.warn('[saveStep] Failed to upload BGM:', err);
    return null;
  }
}

export async function runSaveStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
  bgmData: string | null,
  emotionCurve: EmotionCurve,
  costs: { script: number; images: number; tts: number; bgm: number; total: number },
  durationMs: number,
): Promise<PipelineResult> {
  const totalSteps = assets.length + (bgmData ? 1 : 0) + 1; // uploads + queue create
  let current = 0;

  ctx.onProgress({ step: 'save', current, total: totalSteps, message: '에셋 업로드 중...' });

  // Generate metadata
  const contentMetadata = generateMetadata(ctx.topic, scenes, emotionCurve);

  // ── Step 1: Create a placeholder queue entry to get an ID for Storage paths ──
  const placeholderData = {
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    status: 'uploading',
  };

  const { item } = await callSaveApi<{ item: { id: string } }>('save-to-queue', {
    campaignId: ctx.campaignId || null,
    contentData: placeholderData,
    estimatedCredits: costs.total,
    metadata: { generated_at: new Date().toISOString() },
  });
  const queueId = item.id;

  // ── Step 2: Upload all assets (image + audio per scene) ──
  const assetResults: Array<{
    sceneNumber: number;
    narration: string;
    imageUrl: string | null;
    audioUrl: string | null;
    audioDuration: number | null;
    status: string;
    creditCost: number;
  }> = [];

  for (const asset of assets) {
    let imageUrl = asset.imageUrl;
    let audioUrl = asset.audioUrl;

    // Normalize raw base64 to data URL (APIs return raw base64 without prefix)
    if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
      imageUrl = ensureDataUrl(imageUrl, 'image/png');
    }
    if (audioUrl && !audioUrl.startsWith('data:') && !audioUrl.startsWith('http')) {
      audioUrl = ensureDataUrl(audioUrl, 'audio/mpeg');
    }

    // Upload image
    if (imageUrl && imageUrl.startsWith('data:')) {
      const uploaded = await uploadAsset(queueId, asset.sceneNumber, 'image', imageUrl);
      imageUrl = uploaded || imageUrl; // fallback to base64 if upload fails (won't display in queue though)
    }

    // Upload audio
    if (audioUrl && audioUrl.startsWith('data:')) {
      const uploaded = await uploadAsset(queueId, asset.sceneNumber, 'audio', audioUrl);
      audioUrl = uploaded || audioUrl;
    }

    assetResults.push({
      sceneNumber: asset.sceneNumber,
      narration: asset.narration,
      imageUrl: imageUrl?.startsWith('http') ? imageUrl : null, // only store URLs, not base64
      audioUrl: audioUrl?.startsWith('http') ? audioUrl : null,
      audioDuration: asset.audioDuration,
      status: asset.status,
      creditCost: asset.creditCost,
    });

    current++;
    ctx.onProgress({ step: 'save', current, total: totalSteps, message: `씬 ${asset.sceneNumber} 업로드 완료` });
  }

  // ── Step 3: Upload BGM ──
  let bgmUrl: string | null = null;
  if (bgmData && bgmData.startsWith('data:')) {
    bgmUrl = await uploadBgm(queueId, bgmData);
    current++;
    ctx.onProgress({ step: 'save', current, total: totalSteps, message: 'BGM 업로드 완료' });
  }

  // ── Step 4: Update queue with final lightweight content_data ──
  const finalContentData = {
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    platform: ctx.platform,
    language: ctx.language,
    scenes: scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      narration: s.narration,
      speakerName: s.speakerName,
      emotionTag: s.emotionTag,
    })),
    assets: assetResults,
    bgmUrl,
    metadata: {
      title: contentMetadata.youtube.titles[0]?.text || ctx.topic,
      description: contentMetadata.youtube.description,
      tags: contentMetadata.youtube.tags,
      thumbnailText: contentMetadata.youtube.thumbnail_text,
    },
    costs,
    generatedAt: new Date().toISOString(),
    durationMs,
  };

  await callSaveApi('update-queue', { id: queueId, contentData: finalContentData });

  ctx.onProgress({ step: 'save', current: totalSteps, total: totalSteps, message: '저장 완료' });

  // ── Build result ──
  return {
    success: true,
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    scenes,
    assets: assets.map((a, i) => ({
      ...a,
      imageUrl: assetResults[i]?.imageUrl || a.imageUrl,
      audioUrl: assetResults[i]?.audioUrl || a.audioUrl,
    })),
    bgmUrl,
    emotionCurve,
    metadata: finalContentData.metadata,
    costs,
    generatedAt: finalContentData.generatedAt,
    durationMs,
  };
}
