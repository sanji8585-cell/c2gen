import React, { useState, useEffect, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { UserProject, ProjectAsset, projectsFetch } from './adminUtils';
import { GeneratedAsset } from '../../types';
import PreviewPlayer from '../PreviewPlayer';

interface Props {
  project: UserProject;
  adminToken: string;
  onClose: () => void;
  onDelete: (projectId: string, projectName: string) => void;
}

// 이미지/오디오 URL 판별 헬퍼
function resolveMediaSrc(data?: string, url?: string, mimePrefix?: string): string | null {
  if (url) return url;
  if (!data) return null;
  if (data.startsWith('http://') || data.startsWith('https://')) return data;
  if (data.startsWith('data:')) return data;
  return `data:${mimePrefix};base64,${data}`;
}

// data URI → Blob
function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// URL 또는 data URI → Blob
async function fetchAsBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) return dataUriToBlob(src);
  const res = await fetch(src);
  return res.blob();
}

// 파일 확장자 추론
function getExt(src: string, fallback: string): string {
  if (src.startsWith('data:')) {
    const mime = src.match(/data:(.*?);/)?.[1] || '';
    if (mime.includes('png')) return 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('mp4')) return 'mp4';
  }
  const urlExt = src.split('?')[0].split('.').pop()?.toLowerCase();
  if (urlExt && ['png', 'jpg', 'jpeg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(urlExt)) return urlExt;
  return fallback;
}

// 단일 파일 다운로드
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const AdminProjectViewer: React.FC<Props> = ({ project, adminToken, onClose, onDelete }) => {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { ok, data } = await projectsFetch({
          action: 'admin-load-project',
          adminToken,
          projectId: project.id,
          token: adminToken,
        });
        if (ok) {
          const firstAssets = data.assets || [];
          setAssets(firstAssets);
          setTotal(data.total || 0);
          setLoadedCount(firstAssets.length);

          if (data.hasMore) {
            const CHUNK = 5;
            for (let offset = CHUNK; offset < data.total; offset += CHUNK) {
              const r = await projectsFetch({
                action: 'admin-load-assets',
                adminToken,
                projectId: project.id,
                offset,
                limit: CHUNK,
                token: adminToken,
              });
              if (r.ok) {
                const more = r.data.assets || [];
                setAssets(prev => [...prev, ...more]);
                setLoadedCount(prev => prev + more.length);
              }
            }
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, [adminToken, project.id]);

  // ProjectAsset[] → GeneratedAsset[] 변환 (미리보기용)
  const previewAssets = useMemo(() => {
    return assets
      .filter(a => a.imageData || a.imageUrl)
      .map((a, idx) => ({
        sceneNumber: idx + 1,
        narration: a.narration || '',
        visualPrompt: a.visualPrompt || '',
        analysis: { charPresence: 'NO_CHAR' as const, composition: 'STANDARD' as const, cameraAngle: 'EYE' as const, colorMood: '', keyElement: '' } as unknown as GeneratedAsset['analysis'],
        imageData: resolveMediaSrc(a.imageData, a.imageUrl, 'image/png'),
        audioData: resolveMediaSrc(a.audioData, a.audioUrl, 'audio/mp3'),
        imageUrl: a.imageUrl || null,
        audioUrl: a.audioUrl || null,
        audioDuration: a.audioDuration || a.videoDuration || null,
        subtitleData: a.subtitleData || null,
        videoData: a.videoData
          ? (a.videoData.startsWith('http') ? a.videoData : `data:video/mp4;base64,${a.videoData}`)
          : null,
        videoDuration: a.videoDuration || null,
        status: 'completed' as const,
        customDuration: a.customDuration,
        zoomEffect: (a.zoomEffect as any) || 'zoomIn',
        transition: (a.transition as any) || 'crossfade',
      })) as GeneratedAsset[];
  }, [assets]);

  // 개별 다운로드
  const handleDownload = useCallback(async (src: string, filename: string) => {
    try {
      const blob = await fetchAsBlob(src);
      downloadBlob(blob, filename);
    } catch {
      alert('다운로드에 실패했습니다.');
    }
  }, []);

  // 전체 ZIP 다운로드
  const handleZipDownload = useCallback(async () => {
    if (assets.length === 0) return;
    setZipping(true);
    setZipProgress('ZIP 생성 준비 중...');

    try {
      const zip = new JSZip();
      const projectFolder = zip.folder(project.name || 'project')!;

      let scriptText = `# ${project.name}\n# 주제: ${project.topic}\n\n`;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const sceneNum = String(i + 1).padStart(2, '0');
        setZipProgress(`씬 ${i + 1}/${assets.length} 처리 중...`);

        const imageSrc = resolveMediaSrc(asset.imageData, asset.imageUrl, 'image/png');
        const audioSrc = resolveMediaSrc(asset.audioData, asset.audioUrl, 'audio/mp3');
        const videoSrc = asset.videoData
          ? (asset.videoData.startsWith('http') ? asset.videoData : `data:video/mp4;base64,${asset.videoData}`)
          : null;

        if (imageSrc) {
          try {
            const blob = await fetchAsBlob(imageSrc);
            const ext = getExt(imageSrc, 'png');
            projectFolder.file(`scene_${sceneNum}_image.${ext}`, blob);
          } catch {}
        }
        if (audioSrc) {
          try {
            const blob = await fetchAsBlob(audioSrc);
            const ext = getExt(audioSrc, 'mp3');
            projectFolder.file(`scene_${sceneNum}_audio.${ext}`, blob);
          } catch {}
        }
        if (videoSrc) {
          try {
            const blob = await fetchAsBlob(videoSrc);
            const ext = getExt(videoSrc, 'mp4');
            projectFolder.file(`scene_${sceneNum}_video.${ext}`, blob);
          } catch {}
        }

        scriptText += `## 씬 ${i + 1}\n`;
        if (asset.narration) scriptText += `${asset.narration}\n`;
        if (asset.visualPrompt) scriptText += `[Visual] ${asset.visualPrompt}\n`;
        scriptText += '\n';
      }

      projectFolder.file('script.txt', scriptText);

      setZipProgress('ZIP 압축 중...');
      const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        setZipProgress(`압축 ${Math.round(meta.percent)}%`);
      });

      const safeName = (project.name || 'project').replace(/[^\w가-힣\s-]/g, '').trim();
      downloadBlob(blob, `${safeName}.zip`);
    } catch {
      alert('ZIP 다운로드에 실패했습니다.');
    }
    setZipping(false);
    setZipProgress('');
  }, [assets, project.name, project.topic]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-200">{project.name}</h3>
            <p className="text-xs text-slate-500">
              {project.topic} | {total || project.sceneCount}씬
              {loading && loadedCount > 0 && ` (${loadedCount}/${total} 로드됨)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 미리보기 */}
            <button
              onClick={() => setShowPreview(true)}
              disabled={loading || previewAssets.length === 0}
              className="text-[11px] px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-600/30 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              미리보기
            </button>
            {/* ZIP 전체 다운로드 */}
            <button
              onClick={handleZipDownload}
              disabled={loading || zipping || assets.length === 0}
              className="text-[11px] px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
              </svg>
              {zipping ? zipProgress || '처리 중...' : '전체 다운로드 (ZIP)'}
            </button>
            <button
              onClick={() => onDelete(project.id, project.name)}
              className="text-[11px] px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition-all"
            >
              프로젝트 삭제
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg px-2 leading-none">&times;</button>
          </div>
        </div>

        {/* 미리보기 플레이어 */}
        {showPreview && previewAssets.length > 0 && (
          <div className="px-4 pt-4 flex-shrink-0">
            <PreviewPlayer
              assets={previewAssets}
              sceneGap={0.5}
              onClose={() => setShowPreview(false)}
            />
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && assets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-3" />
              <p className="text-slate-500 text-sm">프로젝트 로딩 중...</p>
            </div>
          ) : assets.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-12">에셋이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {assets.map((asset, idx) => {
                const imageSrc = resolveMediaSrc(asset.imageData, asset.imageUrl, 'image/png');
                const audioSrc = resolveMediaSrc(asset.audioData, asset.audioUrl, 'audio/mp3');
                const videoSrc = asset.videoData
                  ? (asset.videoData.startsWith('http') ? asset.videoData : `data:video/mp4;base64,${asset.videoData}`)
                  : null;
                const sceneNum = String(idx + 1).padStart(2, '0');

                return (
                  <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700/30 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-cyan-400">씬 {idx + 1}</span>
                        {asset.status && <span className="text-[10px] text-slate-600">{asset.status}</span>}
                      </div>

                      {/* 씬별 개별 다운로드 버튼 */}
                      <div className="flex items-center gap-1.5">
                        {imageSrc && (
                          <button
                            onClick={() => handleDownload(imageSrc, `scene_${sceneNum}_image.${getExt(imageSrc, 'png')}`)}
                            className="text-[10px] px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-600/20 rounded transition-all"
                            title="이미지 다운로드"
                          >
                            이미지
                          </button>
                        )}
                        {audioSrc && (
                          <button
                            onClick={() => handleDownload(audioSrc, `scene_${sceneNum}_audio.${getExt(audioSrc, 'mp3')}`)}
                            className="text-[10px] px-2 py-1 bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 border border-purple-600/20 rounded transition-all"
                            title="오디오 다운로드"
                          >
                            오디오
                          </button>
                        )}
                        {videoSrc && (
                          <button
                            onClick={() => handleDownload(videoSrc, `scene_${sceneNum}_video.${getExt(videoSrc, 'mp4')}`)}
                            className="text-[10px] px-2 py-1 bg-orange-600/15 hover:bg-orange-600/30 text-orange-400 border border-orange-600/20 rounded transition-all"
                            title="영상 다운로드"
                          >
                            영상
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 flex gap-4">
                      {/* 미디어 */}
                      <div className="w-56 flex-shrink-0">
                        {videoSrc ? (
                          <video src={videoSrc} className="w-full rounded-lg" controls muted />
                        ) : imageSrc ? (
                          <img src={imageSrc} alt={`씬 ${idx + 1}`} className="w-full rounded-lg" />
                        ) : (
                          <div className="w-full aspect-video bg-slate-700/50 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                            이미지 없음
                          </div>
                        )}
                        {audioSrc && (
                          <audio src={audioSrc} className="w-full mt-2" controls style={{ height: '28px' }} />
                        )}
                      </div>

                      {/* 텍스트 */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {asset.narration && (
                          <div>
                            <p className="text-[10px] text-slate-500 mb-0.5">나레이션</p>
                            <p className="text-sm text-slate-300 leading-relaxed">{asset.narration}</p>
                          </div>
                        )}
                        {asset.visualPrompt && (
                          <div>
                            <p className="text-[10px] text-slate-500 mb-0.5">Visual Prompt</p>
                            <p className="text-[11px] text-slate-500 leading-relaxed">{asset.visualPrompt}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 로딩 진행률 */}
              {loading && loadedCount < total && (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
                  <p className="text-slate-500 text-xs">{loadedCount} / {total} 씬 로드됨...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProjectViewer;
