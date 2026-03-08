
/**
 * fal.ai API 서비스
 * 서버 프록시(/api/fal, /api/fal-poll)를 통해 API 호출
 * - fal.ai 스토리지에 실제 이미지 업로드
 * - 동시 영상 변환 2개 제한 (큐잉)
 * - 폴링 연속 실패 시 조기 종료
 * - 실패 시 크레딧 환불 (서버 측)
 */

import { CONFIG } from '../config';

/**
 * FAL API 키 가져오기 (localStorage, 커스텀 키용)
 */
export function getFalApiKey(): string | null {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_API_KEY) || null;
}

/**
 * FAL API 키 저장
 */
export function setFalApiKey(key: string): void {
  localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_API_KEY, key);
}

/** 프록시 헤더 빌드 */
function buildFalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const customKey = getFalApiKey();
  if (customKey) headers['x-custom-api-key'] = customKey;
  const sessionToken = localStorage.getItem('c2gen_session_token');
  if (sessionToken) headers['x-session-token'] = sessionToken;
  return headers;
}

/** /api/fal 프록시 호출 */
async function callFalProxy(action: string, params: Record<string, any>): Promise<any> {
  const res = await fetch('/api/fal', {
    method: 'POST',
    headers: buildFalHeaders(),
    body: JSON.stringify({ action, ...params }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `FAL API error: ${res.status}`);
  }
  return res.json();
}

// ── 동시 영상 변환 제한 (최대 2개) ──

const MAX_CONCURRENT_VIDEOS = 4;
let activeVideoCount = 0;
const videoQueue: Array<{ resolve: (token: void) => void }> = [];

async function acquireVideoSlot(): Promise<void> {
  if (activeVideoCount < MAX_CONCURRENT_VIDEOS) {
    activeVideoCount++;
    return;
  }
  // 슬롯이 없으면 대기
  return new Promise<void>((resolve) => {
    videoQueue.push({ resolve });
  });
}

function releaseVideoSlot(): void {
  activeVideoCount--;
  if (videoQueue.length > 0) {
    const next = videoQueue.shift()!;
    activeVideoCount++;
    next.resolve();
  }
}

/** 현재 대기 중인 영상 변환 수 */
export function getVideoQueueStatus(): { active: number; waiting: number } {
  return { active: activeVideoCount, waiting: videoQueue.length };
}

/**
 * 이미지를 영상으로 변환 (PixVerse v5.5)
 * submit → poll 패턴 (서버 타임아웃 회피)
 * - 동시 2개 제한, 폴링 연속 실패 시 조기 종료, 실패 시 서버 측 크레딧 환불
 */
export async function generateVideoFromImage(
  imageBase64: string,
  motionPrompt: string,
  _apiKey?: string
): Promise<string | null> {
  // 동시 변환 슬롯 획득 (최대 2개)
  await acquireVideoSlot();

  try {
    // Step 1: 이미지 업로드 (fal.ai 스토리지에 실제 업로드)
    console.log('[FAL] 이미지 업로드 중...');
    const uploadResult = await callFalProxy('uploadImage', { imageBase64 });
    const imageUrl = uploadResult.url;
    if (!imageUrl) {
      console.error('[FAL] 이미지 업로드 실패');
      return null;
    }

    // Step 2: 비디오 생성 제출 (비동기 큐)
    console.log('[FAL] PixVerse v5.5 영상 생성 제출...');
    const submitResult = await callFalProxy('submitVideo', {
      imageUrl,
      motionPrompt,
      duration: 5,
      aspectRatio: '16:9',
      resolution: '720p',
    });

    const requestId = submitResult.requestId;
    const userEmail = submitResult.email; // 환불용 이메일
    if (!requestId) {
      console.error('[FAL] 비디오 제출 실패');
      return null;
    }
    console.log('[FAL] 요청 ID:', requestId);

    // Step 3: 완료까지 폴링 (연속 실패 시 조기 종료)
    const POLL_INTERVAL = 2000;
    const MAX_POLLS = 90;          // 최대 3분 (2초 × 90)
    const MAX_CONSECUTIVE_FAILS = 5; // 연속 5회 폴링 실패 시 조기 종료
    let consecutiveFails = 0;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      const emailParam = userEmail ? `&email=${encodeURIComponent(userEmail)}` : '';
      const pollRes = await fetch(`/api/fal-poll?requestId=${encodeURIComponent(requestId)}${emailParam}`, {
        headers: buildFalHeaders(),
      });

      if (!pollRes.ok) {
        consecutiveFails++;
        console.warn(`[FAL] 폴링 실패 (${consecutiveFails}/${MAX_CONSECUTIVE_FAILS}):`, pollRes.status);
        if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
          console.error('[FAL] 연속 폴링 실패 → 조기 종료');
          return null;
        }
        continue;
      }

      consecutiveFails = 0; // 성공 시 리셋
      const statusData = await pollRes.json();
      console.log(`[FAL] 폴링 ${i + 1}/${MAX_POLLS}: ${statusData.status}`);

      if (statusData.status === 'COMPLETED' && statusData.result?.video?.url) {
        console.log('[FAL] 영상 생성 완료:', statusData.result.video.url);
        return statusData.result.video.url;
      }

      if (statusData.status === 'FAILED') {
        console.error('[FAL] 영상 생성 실패 (fal.ai)', statusData.refunded ? '→ 크레딧 환불됨' : '');
        return null;
      }
    }

    console.error('[FAL] 타임아웃 (3분 초과)');
    return null;
  } catch (error: any) {
    console.error('[FAL] 영상 생성 실패:', error.message);
    return null;
  } finally {
    releaseVideoSlot();
  }
}

/**
 * 영상 URL → base64 (로컬 저장용)
 */
export async function fetchVideoAsBase64(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 여러 이미지 순차 영상 변환
 */
export async function batchGenerateVideos(
  assets: Array<{ imageData: string; visualPrompt: string }>,
  _apiKey?: string,
  onProgress?: (index: number, total: number) => void
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (let i = 0; i < assets.length; i++) {
    onProgress?.(i + 1, assets.length);
    const videoUrl = await generateVideoFromImage(assets[i].imageData, assets[i].visualPrompt);
    results.push(videoUrl);
    if (i < assets.length - 1) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}
