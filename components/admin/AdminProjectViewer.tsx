import React, { useState, useEffect } from 'react';
import { UserProject, ProjectAsset, projectsFetch } from './adminUtils';

interface Props {
  project: UserProject;
  adminToken: string;
  onClose: () => void;
  onDelete: (projectId: string, projectName: string) => void;
}

const AdminProjectViewer: React.FC<Props> = ({ project, adminToken, onClose, onDelete }) => {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [total, setTotal] = useState(0);

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
          setAssets(data.assets || []);
          setTotal(data.total || 0);

          if (data.hasMore) {
            const CHUNK = 5;
            const remaining: Promise<any>[] = [];
            for (let offset = CHUNK; offset < data.total; offset += CHUNK) {
              remaining.push(projectsFetch({
                action: 'admin-load-assets',
                adminToken,
                projectId: project.id,
                offset,
                limit: CHUNK,
                token: adminToken,
              }));
            }
            const results = await Promise.all(remaining);
            const moreAssets: ProjectAsset[] = [];
            for (const r of results) {
              if (r.ok) moreAssets.push(...(r.data.assets || []));
            }
            setAssets(prev => [...prev, ...moreAssets]);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, [adminToken, project.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-200">{project.name}</h3>
            <p className="text-xs text-slate-500">{project.topic} | {project.sceneCount || total}씬</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(project.id, project.name)}
              className="text-[11px] px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition-all"
            >
              프로젝트 삭제
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg px-2 leading-none">&times;</button>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full mx-auto mb-3" />
              <p className="text-slate-500 text-sm">프로젝트 로딩 중...</p>
            </div>
          ) : assets.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-12">에셋이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {assets.map((asset, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700/30 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/20">
                    <span className="text-xs font-medium text-cyan-400">씬 {idx + 1}</span>
                    {asset.status && <span className="text-[10px] text-slate-600 ml-2">{asset.status}</span>}
                  </div>

                  <div className="p-4 flex gap-4">
                    {/* 미디어 */}
                    <div className="w-56 flex-shrink-0">
                      {asset.videoData ? (
                        <video
                          src={`data:video/mp4;base64,${asset.videoData}`}
                          className="w-full rounded-lg"
                          controls
                          muted
                        />
                      ) : asset.imageData ? (
                        <img
                          src={`data:image/png;base64,${asset.imageData}`}
                          alt={`씬 ${idx + 1}`}
                          className="w-full rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-slate-700/50 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                          이미지 없음
                        </div>
                      )}
                      {asset.audioData && (
                        <audio
                          src={`data:audio/mp3;base64,${asset.audioData}`}
                          className="w-full mt-2"
                          controls
                          style={{ height: '28px' }}
                        />
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProjectViewer;
