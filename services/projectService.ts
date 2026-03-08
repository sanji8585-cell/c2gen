
/**
 * 프로젝트 저장/로드 서비스 (Supabase Storage 버전)
 * - 이미지/오디오 → Supabase Storage 개별 업로드 (4.5MB 제한 없음)
 * - DB에는 URL + 텍스트 메타만 저장 (수 KB)
 * - 레거시(base64 in DB) 프로젝트도 하위 호환 로드
 */

import { CONFIG } from '../config';
import { SavedProject, GeneratedAsset, CostBreakdown } from '../types';
import { getSelectedImageModel } from './imageService';

// ── 레거시 청크 설정 (이전 프로젝트 로드용) ──
const LEGACY_CHUNK_SIZE = 5;

// ── 동시 업로드/다운로드 제한 ──
const CONCURRENCY_LIMIT = 4;

// ── 세션 토큰 ──

function getSessionToken(): string | null {
  return localStorage.getItem('c2gen_session_token');
}

// ── API 호출 헬퍼 ──

async function callProjectsAPI(action: string, params: Record<string, any> = {}): Promise<any> {
  const token = getSessionToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...params }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API 오류: ${res.status}`);
  }
  return res.json();
}

async function callStorageAPI(action: string, params: Record<string, any> = {}): Promise<any> {
  const token = getSessionToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...params }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Storage 오류: ${res.status}`);
  }
  return res.json();
}

// ── 동시성 제한 헬퍼 ──

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  const queue = tasks.map((_, i) => i);

  async function worker() {
    while (queue.length > 0) {
      const i = queue.shift();
      if (i === undefined) break;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── 썸네일 생성 ──

function createThumbnail(base64Image: string, maxWidth: number = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * ratio;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      } else {
        resolve(base64Image.slice(0, 1000));
      }
    };
    img.onerror = () => resolve('');
    img.src = `data:image/png;base64,${base64Image}`;
  });
}

// ── 현재 설정값 ──

function getCurrentSettings() {
  const elevenLabsModel = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_MODEL) || CONFIG.DEFAULT_ELEVENLABS_MODEL;
  return {
    imageModel: getSelectedImageModel(),
    elevenLabsModel
  };
}

// ── URL → base64 변환 ──

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일 다운로드 실패: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // "data:image/jpeg;base64,xxxxx" → "xxxxx"
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ══════════════════════════════════════
// ── 공개 API ──
// ══════════════════════════════════════

/**
 * 프로젝트 저장 (Supabase Storage)
 * 1. 이미지/오디오를 Storage에 개별 업로드 → URL 획득
 * 2. 에셋에서 base64 제거, URL로 대체
 * 3. 경량 메타+에셋을 DB에 단일 저장
 */
export async function saveProject(
  topic: string,
  assets: GeneratedAsset[],
  customName?: string,
  cost?: CostBreakdown
): Promise<SavedProject> {
  const id = `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 썸네일 생성
  let thumbnail: string | null = null;
  const firstImageAsset = assets.find(a => a.imageData);
  if (firstImageAsset?.imageData) {
    thumbnail = await createThumbnail(firstImageAsset.imageData);
  }

  // Storage에 이미지/오디오 개별 업로드
  const uploadTasks: (() => Promise<void>)[] = [];
  const assetUrls: { imageUrl?: string; audioUrl?: string }[] = assets.map(() => ({}));

  assets.forEach((asset, i) => {
    if (asset.imageData) {
      uploadTasks.push(async () => {
        const { url } = await callStorageAPI('upload', {
          projectId: id, sceneIndex: i, type: 'image', data: asset.imageData,
        });
        assetUrls[i].imageUrl = url;
      });
    }
    if (asset.audioData) {
      uploadTasks.push(async () => {
        const { url } = await callStorageAPI('upload', {
          projectId: id, sceneIndex: i, type: 'audio', data: asset.audioData,
        });
        assetUrls[i].audioUrl = url;
      });
    }
  });

  await withConcurrency(uploadTasks, CONCURRENCY_LIMIT);

  // DB에 저장할 경량 에셋 (base64 제거, URL로 대체)
  const lightAssets = assets.map((asset, i) => {
    const { imageData, audioData, ...rest } = asset;
    return {
      ...rest,
      imageData: null,
      audioData: null,
      imageUrl: assetUrls[i].imageUrl || null,
      audioUrl: assetUrls[i].audioUrl || null,
    };
  });

  const meta = {
    id,
    name: customName || `${topic.slice(0, 30)}${topic.length > 30 ? '...' : ''}`,
    createdAt: Date.now(),
    topic,
    settings: getCurrentSettings(),
    thumbnail,
    cost: cost || undefined,
    sceneCount: assets.length,
    storageVersion: 2,
  };

  // 단일 API 호출로 저장 (경량 데이터만)
  await callProjectsAPI('save', { meta, assets: lightAssets });

  return {
    ...meta,
    assets: assets.map(asset => ({ ...asset })),
  };
}

/**
 * 저장된 프로젝트 목록 (메타데이터만)
 */
export async function getSavedProjects(): Promise<SavedProject[]> {
  try {
    const { projects } = await callProjectsAPI('list');
    return (projects || []).map((meta: any) => ({
      ...meta,
      assets: [],
    }));
  } catch (e) {
    console.error('[Project] 프로젝트 목록 로드 실패:', e);
    return [];
  }
}

/**
 * 특정 프로젝트 불러오기
 * - Storage v2: 메타+URL 로드 → URL에서 base64 fetch
 * - 레거시: 기존 청크 분할 로드
 */
export async function getProjectById(id: string): Promise<SavedProject | null> {
  try {
    // 먼저 load-full 시도 (v2 + 레거시 모두 지원)
    const { project } = await callProjectsAPI('load-full', { projectId: id });
    if (!project) return null;

    const assets: GeneratedAsset[] = project.assets || [];

    // Storage v2: URL에서 base64 다운로드
    if (project.storageVersion === 2) {
      const downloadTasks: (() => Promise<void>)[] = [];

      assets.forEach((asset: any) => {
        if (asset.imageUrl && !asset.imageData) {
          downloadTasks.push(async () => {
            try {
              asset.imageData = await fetchAsBase64(asset.imageUrl);
            } catch (e) {
              console.warn(`[Project] 이미지 다운로드 실패:`, e);
            }
          });
        }
        if (asset.audioUrl && !asset.audioData) {
          downloadTasks.push(async () => {
            try {
              asset.audioData = await fetchAsBase64(asset.audioUrl);
            } catch (e) {
              console.warn(`[Project] 오디오 다운로드 실패:`, e);
            }
          });
        }
      });

      if (downloadTasks.length > 0) {
        await withConcurrency(downloadTasks, CONCURRENCY_LIMIT);
      }

      project.assets = assets;
      return project;
    }

    // 레거시: assets에 이미 base64가 포함되어 있으면 그대로 반환
    if (assets.length > 0 && assets[0].imageData) {
      project.assets = assets;
      return project;
    }

    // 레거시: 청크 분할 로드 (load-full에 에셋이 없는 경우)
    const firstChunk = await callProjectsAPI('load-assets', {
      projectId: id, offset: 0, limit: LEGACY_CHUNK_SIZE,
    });

    const allAssets: GeneratedAsset[] = [...firstChunk.assets];

    if (firstChunk.hasMore) {
      const remaining: Promise<any>[] = [];
      for (let offset = LEGACY_CHUNK_SIZE; offset < firstChunk.total; offset += LEGACY_CHUNK_SIZE) {
        remaining.push(callProjectsAPI('load-assets', {
          projectId: id, offset, limit: LEGACY_CHUNK_SIZE,
        }));
      }
      const results = await Promise.all(remaining);
      for (const r of results) {
        allAssets.push(...r.assets);
      }
    }

    project.assets = allAssets;
    return project;
  } catch (e) {
    console.error('[Project] 프로젝트 로드 실패:', e);
    return null;
  }
}

/**
 * 프로젝트 삭제 (DB + Storage는 서버에서 처리)
 */
export async function deleteProject(id: string): Promise<boolean> {
  try {
    await callProjectsAPI('delete', { projectId: id });
    return true;
  } catch (e) {
    console.error('[Project] 프로젝트 삭제 실패:', e);
    return false;
  }
}

/**
 * 프로젝트 이름 변경
 */
export async function renameProject(id: string, newName: string): Promise<boolean> {
  try {
    await callProjectsAPI('rename', { projectId: id, newName });
    return true;
  } catch (e) {
    console.error('[Project] 프로젝트 이름 변경 실패:', e);
    return false;
  }
}

/**
 * JSON 파일에서 프로젝트 가져오기
 */
export async function importProject(project: SavedProject): Promise<SavedProject> {
  const imported: SavedProject = {
    ...project,
    id: `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: project.name.startsWith('[가져오기]') ? project.name : `[가져오기] ${project.name}`,
  };

  return saveProject(imported.topic, imported.assets, imported.name, imported.cost);
}

/**
 * 저장 용량 (클라우드 기반이므로 의미 없지만 호환용)
 */
export async function getStorageUsage(): Promise<{ used: number; available: number; percentage: number }> {
  return { used: 0, available: 0, percentage: 0 };
}
