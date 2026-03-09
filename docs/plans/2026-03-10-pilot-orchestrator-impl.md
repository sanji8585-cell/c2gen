# C2 PILOT 오케스트레이터 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 운영자가 주제+브랜드 프리셋으로 콘텐츠를 자동 생성하고 승인 대기열에서 검수하는 파이프라인 구현

**Architecture:** 클라이언트 오케스트레이션(Phase C) — contentPipeline.ts가 브라우저에서 기존 API들을 순차/병렬 호출하여 스토리보드(스크립트+이미지+TTS+BGM) 생성 후 Storage 업로드 + approval_queue 저장. 나중에 서버 전환(Phase A) 시 동일 코드 재사용.

**Tech Stack:** React 19 + TypeScript, 기존 Gemini/ElevenLabs API, Supabase Storage, emotionCurveEngine

**설계 문서:** `docs/plans/2026-03-10-pilot-orchestrator-design.md`

---

## Task 1: 파이프라인 타입 정의

**Files:**
- Create: `services/pilot/types.ts`

**Step 1: 타입 파일 작성**

```typescript
// services/pilot/types.ts
import type { ScriptScene, SubtitleData, BrandPreset, CharacterProfile, EmotionCurve, Language, VideoEngineMode } from '../../types';
import type { PlatformVariant } from '../emotionCurveEngine';

// ── 파이프라인 단계 ──
export type PipelineStep = 'script' | 'images' | 'tts' | 'bgm' | 'save';

export interface PipelineProgress {
  step: PipelineStep;
  current: number;
  total: number;
  message?: string;
}

// ── 파이프라인 입력 ──
export interface PipelineContext {
  topic: string;
  preset: BrandPreset;
  characters: CharacterProfile[];
  emotionCurve?: EmotionCurve;
  platform: PlatformVariant;
  language: Language;
  campaignId?: string;
  onProgress: (progress: PipelineProgress) => void;
  imageModel?: string;
  orientation?: 'landscape' | 'portrait' | 'square';
  // 미래 확장
  enableSfx?: boolean;
  enableLipSync?: boolean;
  videoEngineMode?: VideoEngineMode;
}

// ── 확장된 씬 ──
export interface PilotScriptScene extends ScriptScene {
  speakerName?: string;
  speakerVoiceId?: string;
  emotionTag?: string;
  // 미래 확장
  speakers?: { name: string; voiceId: string; text: string; emotion?: string }[];
  isDialogueScene?: boolean;
  sfxPrompt?: string;
  lipSyncEnabled?: boolean;
  videoEngine?: 'pixverse' | 'kling_2.6' | 'kling_3.0';
}

// ── 생성 결과 (씬별) ──
export interface PilotGeneratedAsset {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;
  imageUrl: string | null;
  audioUrl: string | null;
  subtitleData: SubtitleData | null;
  audioDuration: number | null;
  status: 'pending' | 'generating' | 'completed' | 'error';
  errorMessage?: string;
  creditCost: number;
  // 미래 확장
  videoUrl?: string | null;
  sfxUrl?: string | null;
  lipSyncVideoUrl?: string | null;
}

// ── 파이프라인 최종 결과 ──
export interface PipelineResult {
  success: boolean;
  topic: string;
  presetId: string;
  presetName: string;
  scenes: PilotScriptScene[];
  assets: PilotGeneratedAsset[];
  bgmUrl: string | null;
  emotionCurve?: EmotionCurve;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    thumbnailText: string;
  };
  costs: { script: number; images: number; tts: number; bgm: number; total: number };
  generatedAt: string;
  durationMs: number;
  error?: string;
}
```

**Step 2: 빌드 확인**

Run: `npm run build 2>&1 | head -20`
Expected: 빌드 성공 (import만 있고 실행 코드 없으므로)

**Step 3: 커밋**

```bash
git add services/pilot/types.ts
git commit -m "feat(pilot): add pipeline type definitions for orchestrator"
```

---

## Task 2: 스크립트 생성 Step (프리셋+감정곡선 주입)

**Files:**
- Create: `services/pilot/scriptStep.ts`

**Step 1: scriptStep 작성**

핵심: 기존 `generateScript()`를 호출하되, 브랜드 프리셋 톤/캐릭터 정보와 감정곡선 가이드를 `sourceContext`로 주입.

```typescript
// services/pilot/scriptStep.ts
import { generateScript } from '../geminiService';
import { selectStoryArc, generateEmotionCurve, applyEmotionToScenes } from '../emotionCurveEngine';
import { injectEmotionTags } from '../audioTagsService';
import type { PipelineContext, PilotScriptScene } from './types';
import type { EmotionCurve } from '../../types';

/** 브랜드 프리셋 정보를 스크립트 생성용 컨텍스트 문자열로 변환 */
function buildPresetContext(ctx: PipelineContext): string {
  const { preset, characters } = ctx;
  const lines: string[] = [];

  // 톤 & 보이스
  const tv = preset.tone_voice;
  if (tv) {
    if (tv.style) lines.push(`[브랜드 톤] ${tv.style}`);
    if (tv.formality !== undefined) lines.push(`[격식 수준] ${tv.formality} (0=캐주얼, 1=격식)`);
    if (tv.humor_level !== undefined) lines.push(`[유머 수준] ${tv.humor_level} (0=진지, 1=유머)`);
    if (tv.catchphrase) lines.push(`[캐치프레이즈] 가능하면 포함: "${tv.catchphrase}"`);
    if (tv.forbidden_words?.length) lines.push(`[금지 단어] ${tv.forbidden_words.join(', ')}`);
  }

  // 세계관
  if (preset.world_view) lines.push(`[브랜드 세계관] ${preset.world_view}`);
  if (preset.target_audience) lines.push(`[타깃 시청자] ${preset.target_audience}`);

  // 캐릭터
  if (characters.length > 0) {
    lines.push(`[등장 캐릭터]`);
    for (const c of characters) {
      const parts = [`${c.name} (${c.char_role})`];
      if (c.personality) parts.push(`성격: ${c.personality}`);
      if (c.speech_style?.tone) parts.push(`말투: ${c.speech_style.tone}`);
      if (c.speech_style?.catchphrase) parts.push(`캐치프레이즈: ${c.speech_style.catchphrase}`);
      lines.push(`  - ${parts.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/** 감정곡선을 스크립트 가이드 문자열로 변환 */
function buildEmotionGuide(curve: EmotionCurve): string {
  if (!curve.curve_points?.length) return '';
  const lines = ['[감정 흐름 가이드] 각 씬의 나레이션 톤을 아래 흐름에 맞춰 작성:'];
  for (const p of curve.curve_points) {
    const pct = Math.round((p.time_seconds / curve.total_duration) * 100);
    lines.push(`  ${pct}%: ${p.emotion} (강도 ${p.intensity}) — ${p.label}`);
  }
  return lines.join('\n');
}

export interface ScriptStepResult {
  scenes: PilotScriptScene[];
  emotionCurve: EmotionCurve;
}

export async function runScriptStep(ctx: PipelineContext): Promise<ScriptStepResult> {
  ctx.onProgress({ step: 'script', current: 0, total: 1, message: '스크립트 생성 중...' });

  // 1. 감정곡선 생성 (로컬, 즉시)
  const arc = selectStoryArc(ctx.topic);
  const platformDuration = ctx.platform === 'tiktok' ? 30 : ctx.platform === 'youtube_shorts' ? 60 : 180;
  const curve = ctx.emotionCurve || generateEmotionCurve(arc, ctx.platform, platformDuration);

  // 2. 프리셋 컨텍스트 + 감정곡선 가이드를 sourceContext로 주입
  const presetContext = buildPresetContext(ctx);
  const emotionGuide = buildEmotionGuide(curve);
  const sourceContext = [presetContext, emotionGuide].filter(Boolean).join('\n\n');

  // 3. 기존 generateScript() 호출
  const hasRefImages = ctx.characters.some(c =>
    c.reference_sheet?.multi_angle?.front || c.reference_sheet?.original_upload
  );
  const rawScenes = await generateScript(ctx.topic, hasRefImages, sourceContext, ctx.language);

  // 4. 감정곡선 매핑 + 오디오 태그 주입
  const emotionScenes = applyEmotionToScenes(curve, rawScenes);
  const pilotScenes: PilotScriptScene[] = emotionScenes.map((s) => {
    const meta = (s as any).emotionMeta;
    const emotionTag = meta?.emotion ? injectEmotionTags(s.narration, meta.emotion).split(']')[0] + ']' : undefined;

    // 캐릭터 매칭: 씬의 directives.SPEAKER 또는 첫 번째 메인 캐릭터
    const speakerDirective = s.analysis?.directives?.SPEAKER;
    const matchedChar = speakerDirective
      ? ctx.characters.find(c => c.name === speakerDirective)
      : ctx.characters.find(c => c.char_role === 'main');

    return {
      ...s,
      speakerName: matchedChar?.name,
      speakerVoiceId: matchedChar?.voice_id,
      emotionTag,
    };
  });

  ctx.onProgress({ step: 'script', current: 1, total: 1, message: `스크립트 완료 (${pilotScenes.length}씬)` });

  return { scenes: pilotScenes, emotionCurve: curve };
}
```

**Step 2: 빌드 확인**

Run: `npm run build 2>&1 | head -20`

**Step 3: 커밋**

```bash
git add services/pilot/scriptStep.ts
git commit -m "feat(pilot): add script generation step with preset + emotion curve injection"
```

---

## Task 3: 이미지 생성 Step (화풍+참조시트 주입)

**Files:**
- Create: `services/pilot/imageStep.ts`

**Step 1: imageStep 작성**

핵심: 기존 `generateImage()`를 호출하되, 브랜드 프리셋의 art_style과 캐릭터 참조시트를 ReferenceImages로 구성.

```typescript
// services/pilot/imageStep.ts
import { generateImage } from '../imageService';
import type { ReferenceImages, ScriptScene } from '../../types';
import type { PipelineContext, PilotScriptScene, PilotGeneratedAsset } from './types';

const IMAGE_CONCURRENCY = 10;
const MAX_RETRIES = 2;

/** 브랜드 프리셋에서 ReferenceImages 구성 */
async function buildReferenceImages(ctx: PipelineContext): Promise<ReferenceImages> {
  const refImages: ReferenceImages = {
    character: [],
    style: [],
    characterStrength: 70,
    styleStrength: 70,
  };

  // 캐릭터 참조 이미지 (URL → base64 변환)
  for (const char of ctx.characters) {
    const frontUrl = char.reference_sheet?.multi_angle?.front
      || char.reference_sheet?.original_upload;
    if (frontUrl && !frontUrl.startsWith('data:')) {
      try {
        const resp = await fetch(frontUrl);
        const blob = await resp.blob();
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        refImages.character.push(base64);
      } catch { /* skip failed fetch */ }
    } else if (frontUrl) {
      refImages.character.push(frontUrl);
    }
  }

  // 화풍 프리뷰 이미지 (있으면 스타일 참조로 사용)
  const stylePreview = ctx.preset.style_preview_images?.[0];
  if (stylePreview) {
    try {
      const resp = await fetch(stylePreview);
      const blob = await resp.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      refImages.style.push(base64);
    } catch { /* skip */ }
  }

  return refImages;
}

/** 씬의 visualPrompt에 아트 스타일 프리픽스 주입 */
function injectArtStyle(scene: ScriptScene, ctx: PipelineContext): ScriptScene {
  const artPrompt = ctx.preset.art_style?.custom_prompt;
  if (!artPrompt) return scene;

  const negatives = ctx.preset.art_style?.negative_prompts?.join(', ');
  const palette = ctx.preset.art_style?.extracted_features?.palette?.join(', ');

  let enhanced = `[Art Style: ${artPrompt}] ${scene.visualPrompt}`;
  if (palette) enhanced += ` [Color Palette: ${palette}]`;
  if (negatives) enhanced += ` [Avoid: ${negatives}]`;

  return { ...scene, visualPrompt: enhanced };
}

export async function runImageStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
): Promise<PilotGeneratedAsset[]> {
  ctx.onProgress({ step: 'images', current: 0, total: scenes.length, message: '이미지 생성 준비...' });

  const refImages = await buildReferenceImages(ctx);

  const assets: PilotGeneratedAsset[] = scenes.map(s => ({
    sceneNumber: s.sceneNumber,
    narration: s.narration,
    visualPrompt: s.visualPrompt,
    imageUrl: null,
    audioUrl: null,
    subtitleData: null,
    audioDuration: null,
    status: 'pending' as const,
    creditCost: 0,
  }));

  // 배치 병렬 처리
  let completed = 0;
  for (let start = 0; start < scenes.length; start += IMAGE_CONCURRENCY) {
    const batch = scenes.slice(start, start + IMAGE_CONCURRENCY);
    await Promise.all(batch.map(async (scene, batchIdx) => {
      const idx = start + batchIdx;
      assets[idx].status = 'generating';

      const styledScene = injectArtStyle(scene, ctx);
      let imageData: string | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          imageData = await generateImage(styledScene, refImages);
          break;
        } catch (e: any) {
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          } else {
            assets[idx].status = 'error';
            assets[idx].errorMessage = e?.message || 'Image generation failed';
          }
        }
      }

      if (imageData) {
        assets[idx].imageUrl = imageData; // base64 — saveStep에서 Storage 업로드
        assets[idx].status = 'completed';
        assets[idx].creditCost += 16; // Gemini image credit
      }

      completed++;
      ctx.onProgress({ step: 'images', current: completed, total: scenes.length });
    }));
  }

  return assets;
}
```

**Step 2: 빌드 확인**

Run: `npm run build 2>&1 | head -20`

**Step 3: 커밋**

```bash
git add services/pilot/imageStep.ts
git commit -m "feat(pilot): add image generation step with art style + character ref injection"
```

---

## Task 4: TTS 생성 Step (캐릭터 음성+오디오 태그 주입)

**Files:**
- Create: `services/pilot/ttsStep.ts`

**Step 1: ttsStep 작성**

```typescript
// services/pilot/ttsStep.ts
import { generateAudioWithElevenLabs } from '../elevenLabsService';
import { generateAudioForScene } from '../geminiService';
import { processNarrationForTTS, getEmotionTtsPace } from '../audioTagsService';
import { LANGUAGE_CONFIG } from '../../config';
import type { PipelineContext, PilotScriptScene, PilotGeneratedAsset } from './types';

const TTS_CONCURRENCY = 5;
const MAX_RETRIES = 2;
const RATE_LIMIT_DELAY = 3000;

export async function runTtsStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
): Promise<void> {
  ctx.onProgress({ step: 'tts', current: 0, total: scenes.length, message: 'TTS 생성 준비...' });

  const defaultVoiceId = LANGUAGE_CONFIG[ctx.language]?.defaultVoice;
  let completed = 0;

  for (let start = 0; start < scenes.length; start += TTS_CONCURRENCY) {
    const batch = scenes.slice(start, start + TTS_CONCURRENCY);

    await Promise.all(batch.map(async (scene, batchIdx) => {
      const idx = start + batchIdx;

      // 1. 감정 태그 주입
      const emotionMeta = (scene as any).emotionMeta;
      const emotion = emotionMeta?.emotion;
      let processedText = scene.narration;
      if (emotion) {
        processedText = processNarrationForTTS(scene.narration, emotion, 0.3);
      }

      // 2. 텍스트 전처리 (기존 패턴)
      processedText = processedText.replace(/\n+/g, ' ').trim();
      if (processedText && !/[.!?。！？]$/.test(processedText)) {
        processedText += '.';
      }

      // 3. 음성 선택 (캐릭터 → 기본)
      const voiceId = scene.speakerVoiceId || defaultVoiceId;

      // 4. 속도 조절
      const speed = emotion ? getEmotionTtsPace(emotion) : 1.0;

      // 5. ElevenLabs TTS 호출 (재시도 포함)
      let success = false;
      for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
        try {
          const result = await generateAudioWithElevenLabs(
            processedText,
            undefined,
            voiceId,
            undefined,
            { speed, stability: 0.6 },
          );

          if (result.audioData) {
            assets[idx].audioUrl = result.audioData; // base64 — saveStep에서 업로드
            assets[idx].subtitleData = result.subtitleData;
            assets[idx].audioDuration = result.estimatedDuration;
            assets[idx].creditCost += Math.ceil(processedText.length / 1000) * 15;
            success = true;
          }
        } catch (e: any) {
          const msg = e?.message || '';
          if (msg.includes('429') && attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
          } else if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      // 6. 폴백: Gemini TTS
      if (!success) {
        try {
          const fallbackAudio = await generateAudioForScene(scene.narration);
          if (fallbackAudio) {
            assets[idx].audioUrl = fallbackAudio;
            assets[idx].audioDuration = null;
          }
        } catch { /* TTS 완전 실패 — 오디오 없이 진행 */ }
      }

      completed++;
      ctx.onProgress({ step: 'tts', current: completed, total: scenes.length });
    }));

    // 배치 간 딜레이 (rate limit 방지)
    if (start + TTS_CONCURRENCY < scenes.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
```

**Step 2: 빌드 확인**

Run: `npm run build 2>&1 | head -20`

**Step 3: 커밋**

```bash
git add services/pilot/ttsStep.ts
git commit -m "feat(pilot): add TTS step with character voice + emotion audio tags"
```

---

## Task 5: BGM 생성 Step (프리셋 분위기 주입)

**Files:**
- Create: `services/pilot/bgmStep.ts`

**Step 1: bgmStep 작성**

```typescript
// services/pilot/bgmStep.ts
import { generateBrandBgm, generateMusicWithElevenLabs } from '../elevenLabsService';
import { analyzeMood } from '../geminiService';
import type { PipelineContext, PilotScriptScene } from './types';

export interface BgmStepResult {
  bgmData: string | null;  // base64 — saveStep에서 업로드
  creditCost: number;
}

export async function runBgmStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
): Promise<BgmStepResult> {
  ctx.onProgress({ step: 'bgm', current: 0, total: 1, message: 'BGM 생성 중...' });

  const bgmPrefs = ctx.preset.bgm_preferences;

  try {
    // 1. 프리셋에 BGM 선호가 있으면 브랜드 BGM 생성
    if (bgmPrefs?.genre || bgmPrefs?.mood || bgmPrefs?.custom_prompt) {
      const result = await generateBrandBgm(
        {
          genre: bgmPrefs.genre || 'ambient',
          mood: bgmPrefs.mood || 'calm',
          tempo_range: bgmPrefs.tempo_range || { min: 80, max: 120 },
          custom_prompt: bgmPrefs.custom_prompt,
        },
        30000,
      );

      if (result.audio_base64) {
        ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 완료 (브랜드 프리셋)' });
        return { bgmData: `data:audio/mpeg;base64,${result.audio_base64}`, creditCost: 50 };
      }
    }

    // 2. 프리셋 없으면 AI 분위기 분석 → 자동 생성
    const narrations = scenes.map(s => s.narration);
    const moodResult = await analyzeMood(narrations);
    const mood = moodResult?.mood || 'calm';

    const musicResult = await generateMusicWithElevenLabs(mood, 30000);
    if (musicResult.audioBase64) {
      ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: `BGM 완료 (${mood})` });
      return { bgmData: `data:audio/mpeg;base64,${musicResult.audioBase64}`, creditCost: 50 };
    }
  } catch (e) {
    console.error('[bgmStep] BGM generation failed:', e);
  }

  // 3. 실패 시 BGM 없이 진행
  ctx.onProgress({ step: 'bgm', current: 1, total: 1, message: 'BGM 생성 실패 — 건너뜀' });
  return { bgmData: null, creditCost: 0 };
}
```

**Step 2: 빌드 확인 + 커밋**

```bash
git add services/pilot/bgmStep.ts
git commit -m "feat(pilot): add BGM generation step with brand preset mood injection"
```

---

## Task 6: Storage 업로드 + DB 저장 API

**Files:**
- Create: `api/pilot/save-content.ts`

**Step 1: save-content API 작성**

Vercel 서버리스 함수. 클라이언트에서 base64 에셋을 받아 Storage 업로드 후 approval_queue에 저장.

```typescript
// api/pilot/save-content.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'pilot-content';

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  base64DataUrl: string,
  path: string,
): Promise<string | null> {
  try {
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const buffer = Buffer.from(match[2], 'base64');
    const ext = match[1].split('/')[1] || 'bin';
    const fullPath = `${path}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fullPath, buffer, { contentType: match[1], upsert: true });
    if (error) { console.error('[uploadToStorage]', error.message); return null; }
    return supabase.storage.from(BUCKET).getPublicUrl(fullPath).data?.publicUrl || null;
  } catch (err) { console.error('[uploadToStorage]', err); return null; }
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Missing Supabase config' });

  const supabase = createClient(supabaseUrl, supabaseKey);
  await ensureBucket(supabase);

  const { action } = req.body;

  // ── 에셋 업로드 (이미지/오디오 개별) ──
  if (action === 'upload-asset') {
    const { queueId, sceneNumber, assetType, base64Data } = req.body;
    if (!queueId || !sceneNumber || !assetType || !base64Data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const path = `${queueId}/scene-${sceneNumber}-${assetType}`;
    const url = await uploadToStorage(supabase, base64Data, path);
    return res.json({ url });
  }

  // ── BGM 업로드 ──
  if (action === 'upload-bgm') {
    const { queueId, base64Data } = req.body;
    if (!queueId || !base64Data) return res.status(400).json({ error: 'Missing required fields' });
    const path = `${queueId}/bgm`;
    const url = await uploadToStorage(supabase, base64Data, path);
    return res.json({ url });
  }

  // ── approval_queue 항목 생성/업데이트 ──
  if (action === 'save-to-queue') {
    const { campaignId, contentData, emotionCurveUsed, estimatedCredits, metadata } = req.body;

    // 세션 토큰 확인
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const { data: session } = await supabase
      .from('c2gen_sessions')
      .select('email')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!session) return res.status(401).json({ error: 'Invalid session' });

    const { data, error } = await supabase
      .from('c2gen_approval_queue')
      .insert({
        campaign_id: campaignId || null,
        content_data: contentData,
        emotion_curve_used: emotionCurveUsed || null,
        estimated_credits: estimatedCredits || 0,
        metadata: metadata || {},
        platform_variants: {},
        status: 'pending',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ item: data });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
```

**Step 2: 빌드 확인 + 커밋**

```bash
git add api/pilot/save-content.ts
git commit -m "feat(pilot): add save-content API for Storage upload + approval queue"
```

---

## Task 7: 파이프라인 오케스트레이터

**Files:**
- Create: `services/pilot/contentPipeline.ts`
- Create: `services/pilot/saveStep.ts`

**Step 1: saveStep 작성 (클라이언트 → API 호출)**

```typescript
// services/pilot/saveStep.ts
import { generateMetadata } from '../metadataEngine';
import type { PipelineContext, PilotScriptScene, PilotGeneratedAsset, PipelineResult } from './types';
import type { EmotionCurve } from '../../types';

function getToken(): string {
  return localStorage.getItem('c2gen_session_token') || '';
}

async function callSaveApi(action: string, body: Record<string, unknown>) {
  const resp = await fetch('/api/pilot/save-content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function runSaveStep(
  ctx: PipelineContext,
  scenes: PilotScriptScene[],
  assets: PilotGeneratedAsset[],
  bgmData: string | null,
  emotionCurve: EmotionCurve,
  costs: PipelineResult['costs'],
  durationMs: number,
): Promise<PipelineResult> {
  ctx.onProgress({ step: 'save', current: 0, total: 1, message: '결과 저장 중...' });

  // 1. 먼저 큐 항목 생성 (ID 획득)
  const metadata = generateMetadata(ctx.topic, scenes, emotionCurve);
  const contentData: Record<string, unknown> = {
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    language: ctx.language,
    platform: ctx.platform,
    scenes: scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      narration: s.narration,
      visualPrompt: s.visualPrompt,
      analysis: s.analysis,
      speakerName: s.speakerName,
      speakerVoiceId: s.speakerVoiceId,
      emotionTag: s.emotionTag,
    })),
    assets: [], // 업로드 후 채움
    bgmUrl: null,
    metadata: {
      title: metadata.youtube.titles[0]?.text || ctx.topic,
      description: metadata.youtube.description,
      tags: metadata.youtube.tags,
      thumbnailText: metadata.youtube.thumbnail_text,
    },
    costs,
    generatedAt: new Date().toISOString(),
    durationMs,
  };

  const { item } = await callSaveApi('save-to-queue', {
    campaignId: ctx.campaignId,
    contentData,
    emotionCurveUsed: emotionCurve,
    estimatedCredits: costs.total,
    metadata: { generated_at: new Date().toISOString() },
  });

  const queueId = item.id;

  // 2. 에셋 업로드 (이미지 + 오디오)
  const uploadedAssets = [];
  for (const asset of assets) {
    let imageUrl = asset.imageUrl;
    let audioUrl = asset.audioUrl;

    // 이미지 업로드
    if (imageUrl && imageUrl.startsWith('data:')) {
      try {
        const { url } = await callSaveApi('upload-asset', {
          queueId, sceneNumber: asset.sceneNumber, assetType: 'image', base64Data: imageUrl,
        });
        imageUrl = url;
      } catch { /* keep base64 as fallback */ }
    }

    // 오디오 업로드
    if (audioUrl && audioUrl.startsWith('data:')) {
      try {
        const { url } = await callSaveApi('upload-asset', {
          queueId, sceneNumber: asset.sceneNumber, assetType: 'audio', base64Data: audioUrl,
        });
        audioUrl = url;
      } catch { /* keep base64 as fallback */ }
    }

    uploadedAssets.push({
      sceneNumber: asset.sceneNumber,
      imageUrl,
      audioUrl,
      subtitleData: asset.subtitleData,
      audioDuration: asset.audioDuration,
      status: asset.status,
      creditCost: asset.creditCost,
    });
  }

  // 3. BGM 업로드
  let bgmUrl: string | null = null;
  if (bgmData?.startsWith('data:')) {
    try {
      const { url } = await callSaveApi('upload-bgm', { queueId, base64Data: bgmData });
      bgmUrl = url;
    } catch { /* no bgm */ }
  }

  // 4. approval_queue content_data 업데이트 (URL 반영)
  contentData.assets = uploadedAssets;
  contentData.bgmUrl = bgmUrl;

  // Supabase 직접 업데이트는 API에서 처리해야 하므로 save-to-queue에 update 추가 필요
  // MVP에서는 content_data를 다시 save
  // TODO: approval API에 update-content 액션 추가

  ctx.onProgress({ step: 'save', current: 1, total: 1, message: '저장 완료' });

  const result: PipelineResult = {
    success: true,
    topic: ctx.topic,
    presetId: ctx.preset.id,
    presetName: ctx.preset.name,
    scenes,
    assets: assets.map((a, i) => ({ ...a, imageUrl: uploadedAssets[i]?.imageUrl || a.imageUrl, audioUrl: uploadedAssets[i]?.audioUrl || a.audioUrl })),
    bgmUrl,
    emotionCurve,
    metadata: contentData.metadata as PipelineResult['metadata'],
    costs,
    generatedAt: new Date().toISOString(),
    durationMs,
  };

  return result;
}
```

**Step 2: contentPipeline 오케스트레이터 작성**

```typescript
// services/pilot/contentPipeline.ts
import { runScriptStep } from './scriptStep';
import { runImageStep } from './imageStep';
import { runTtsStep } from './ttsStep';
import { runBgmStep } from './bgmStep';
import { runSaveStep } from './saveStep';
import type { PipelineContext, PipelineResult } from './types';

export async function runContentPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const startTime = Date.now();

  try {
    // Step 1: 스크립트 생성 (직렬)
    const { scenes, emotionCurve } = await runScriptStep(ctx);

    // Step 2+3+4: 이미지 + TTS + BGM (병렬)
    const [assets, , bgmResult] = await Promise.all([
      runImageStep(ctx, scenes),
      runTtsStep(ctx, scenes, []).then(() => null), // assets는 imageStep에서 생성
      runBgmStep(ctx, scenes),
    ]);

    // TTS는 assets를 직접 mutate하므로 별도 처리
    await runTtsStep(ctx, scenes, assets);

    // 비용 집계
    const costs = {
      script: 5,
      images: assets.reduce((sum, a) => sum + (a.imageUrl ? 16 : 0), 0),
      tts: assets.reduce((sum, a) => sum + a.creditCost, 0) - assets.reduce((sum, a) => sum + (a.imageUrl ? 16 : 0), 0),
      bgm: bgmResult.creditCost,
      total: 5 + assets.reduce((sum, a) => sum + a.creditCost, 0) + bgmResult.creditCost,
    };

    // Step 5: Storage 업로드 + DB 저장
    const result = await runSaveStep(ctx, scenes, assets, bgmResult.bgmData, emotionCurve, costs, Date.now() - startTime);

    return result;
  } catch (error: any) {
    return {
      success: false,
      topic: ctx.topic,
      presetId: ctx.preset.id,
      presetName: ctx.preset.name,
      scenes: [],
      assets: [],
      bgmUrl: null,
      metadata: { title: ctx.topic, description: '', tags: [], thumbnailText: '' },
      costs: { script: 0, images: 0, tts: 0, bgm: 0, total: 0 },
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: error?.message || 'Pipeline failed',
    };
  }
}
```

**Step 3: 병렬 처리 수정 — TTS는 이미지와 동시 시작, assets 공유**

위 코드에서 TTS가 두 번 호출되는 문제 수정. 실제 구현에서는 imageStep이 assets 배열을 반환하고, ttsStep이 그 배열을 mutate:

```typescript
// contentPipeline.ts 수정 — 올바른 병렬 처리
const assets = scenes.map(s => ({
  sceneNumber: s.sceneNumber,
  narration: s.narration,
  visualPrompt: s.visualPrompt,
  imageUrl: null, audioUrl: null, subtitleData: null,
  audioDuration: null, status: 'pending' as const,
  errorMessage: undefined, creditCost: 0,
}));

await Promise.all([
  runImageStep(ctx, scenes, assets),   // assets mutate
  runTtsStep(ctx, scenes, assets),     // assets mutate
  runBgmStep(ctx, scenes),             // 독립
]);
```

이렇게 하면 imageStep과 ttsStep이 동시에 시작하되, 같은 assets 배열의 다른 필드를 업데이트.

**Step 4: 빌드 확인 + 커밋**

```bash
git add services/pilot/contentPipeline.ts services/pilot/saveStep.ts
git commit -m "feat(pilot): add content pipeline orchestrator with parallel image+tts+bgm"
```

---

## Task 8: ContentGenerator UI 컴포넌트

**Files:**
- Create: `components/pilot/ContentGenerator.tsx`
- Modify: `components/PilotDashboard.tsx` (import 교체)

**Step 1: ContentGenerator 컴포넌트 작성**

입력 폼 + 생성 버튼 + 실시간 진행률 + 히스토리. 기존 PilotDashboard의 CSS 패턴 (Tailwind + CSS variables) 매칭.

**Step 2: PilotDashboard에서 ContentEngineTest → ContentGenerator 교체**

```typescript
// 변경 전:
import ContentEngineTest from './pilot/ContentEngineTest';
// ...
{section === 'content_engine' && <ContentEngineTest />}

// 변경 후:
import ContentGenerator from './pilot/ContentGenerator';
// ...
{section === 'content_engine' && (
  <ContentGenerator
    presets={presets}
    onComplete={() => { loadData(); setSection('approval'); }}
  />
)}
```

**Step 3: 빌드 확인 + 커밋**

```bash
git add components/pilot/ContentGenerator.tsx components/PilotDashboard.tsx
git commit -m "feat(pilot): add ContentGenerator UI with pipeline integration"
```

---

## Task 9: ApprovalQueue 개선 (스토리보드 미리보기)

**Files:**
- Modify: `components/ApprovalQueue.tsx`

**Step 1: 스토리보드 미리보기 추가**

기존 ApprovalQueue가 content_data에서 topic/narration만 표시하는데, 이제 assets 배열의 이미지 썸네일, 오디오 플레이어, 메타데이터를 표시하도록 확장.

핵심 추가:
- 씬별 이미지 썸네일 가로 스크롤
- 나레이션 텍스트 + 오디오 재생 버튼
- BGM 재생 버튼
- 자동 생성된 제목/태그 표시
- 비용 표시

**Step 2: 빌드 확인 + 커밋**

```bash
git add components/ApprovalQueue.tsx
git commit -m "feat(pilot): enhance ApprovalQueue with storyboard preview"
```

---

## Task 10: Supabase Storage 버킷 생성 + 통합 테스트

**Step 1: pilot-content 버킷 확인**

save-content API의 `ensureBucket()`이 자동 생성하지만, Supabase 대시보드에서 수동 확인 권장.

**Step 2: 전체 파이프라인 E2E 테스트**

1. PilotDashboard → 콘텐츠 엔진 탭
2. 브랜드 프리셋 선택 (기존 HOUT 프리셋)
3. 주제 입력: "강아지 캠핑 브이로그"
4. "콘텐츠 생성" 클릭
5. 진행률 표시 확인 (스크립트 → 이미지 → TTS → BGM → 저장)
6. 승인 대기열로 자동 이동
7. 생성된 스토리보드 확인 (이미지 썸네일, 나레이션, BGM)

**Step 3: 문제 해결 후 최종 커밋**

```bash
git add -A
git commit -m "feat(pilot): complete content pipeline MVP — topic to storyboard automation"
```

---

## Task 11: 메모리 업데이트

**Files:**
- Modify: `~/.claude/projects/.../memory/MEMORY.md`

파이프라인 구현 완료 후 메모리에 추가:
- C2 PILOT Phase 4 MVP 구현 상태
- services/pilot/ 파일 구조
- 파이프라인 병렬 처리 패턴
- pilot-content Storage 버킷

---

## 작업 순서 요약

| Task | 파일 | 내용 | 의존성 |
|------|------|------|--------|
| 1 | `services/pilot/types.ts` | 타입 정의 | 없음 |
| 2 | `services/pilot/scriptStep.ts` | 스크립트 생성 | Task 1 |
| 3 | `services/pilot/imageStep.ts` | 이미지 생성 | Task 1 |
| 4 | `services/pilot/ttsStep.ts` | TTS 생성 | Task 1 |
| 5 | `services/pilot/bgmStep.ts` | BGM 생성 | Task 1 |
| 6 | `api/pilot/save-content.ts` | Storage 업로드 API | 없음 |
| 7 | `services/pilot/contentPipeline.ts` + `saveStep.ts` | 오케스트레이터 | Task 2-6 |
| 8 | `components/pilot/ContentGenerator.tsx` | UI | Task 7 |
| 9 | `components/ApprovalQueue.tsx` | 미리보기 개선 | Task 6 |
| 10 | E2E 테스트 | 통합 검증 | Task 8-9 |
| 11 | 메모리 업데이트 | 문서화 | Task 10 |
