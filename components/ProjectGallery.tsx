
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedProject } from '../types';
import { formatKRW } from '../config';
import { getProjectById } from '../services/projectService';

interface ProjectGalleryProps {
  projects: SavedProject[];
  onBack: () => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onLoad: (project: SavedProject) => void;
  onImport?: (project: SavedProject) => void;
}

const ProjectGallery: React.FC<ProjectGalleryProps> = ({
  projects,
  onBack,
  onDelete,
  onRefresh,
  onLoad,
  onImport,
}) => {
  const { t } = useTranslation();
  const [selectedProject, setSelectedProject] = useState<SavedProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 프로젝트 상세 보기 (클라우드에서 전체 데이터 로드)
  const handleSelectProject = async (project: SavedProject) => {
    setDetailLoading(true);
    try {
      const full = await getProjectById(project.id);
      setSelectedProject(full || project);
    } catch {
      setSelectedProject(project);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExportProject = (project: SavedProject) => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[\/\\:*?"<>|]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const project = JSON.parse(text) as SavedProject;
      // 최소한의 유효성 검사
      if (!project.id || !project.name || !Array.isArray(project.assets)) {
        throw new Error('올바른 프로젝트 파일이 아닙니다');
      }
      await onImport?.(project);
      onRefresh();
    } catch (e: any) {
      setImportError(e.message || '가져오기 실패');
    }
    e.target.value = '';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(id);
      setConfirmDelete(null);
      if (selectedProject?.id === id) {
        setSelectedProject(null);
      }
      onRefresh();
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // 로딩 중
  if (detailLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent animate-spin rounded-full"></div>
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // 프로젝트 상세 보기
  if (selectedProject) {
    const assets = selectedProject.assets || [];

    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setSelectedProject(null)}
            className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.close')}
          </button>

          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedProject.name}</h2>

          <button
            onClick={() => onLoad(selectedProject)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-bold"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('gallery.loadProject')}
          </button>
        </div>

        {/* 설정 정보 */}
        <div className="rounded-xl p-4 mb-6 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>{formatDate(selectedProject.createdAt)}</span>
            <span className="px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {selectedProject.settings?.imageModel?.includes('flux') ? 'Flux' : 'Gemini'}
            </span>
            {selectedProject.settings?.imageModel?.includes('flux') && (
              <span className="px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                {(selectedProject.settings as any)?.fluxStyle}
              </span>
            )}
            <span className="px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {selectedProject.settings?.elevenLabsModel}
            </span>
            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
              {assets.filter(a => a.imageData).length}/{assets.length} 이미지
            </span>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">
              {assets.filter(a => a.audioData).length}/{assets.length} 오디오
            </span>
          </div>

          {/* 비용 상세 (있는 경우만) */}
          {selectedProject.cost && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-default)' }}>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>비용:</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  이미지 {selectedProject.cost.imageCount}장 {formatKRW(selectedProject.cost.images)}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  TTS {selectedProject.cost.ttsCharacters}자 {formatKRW(selectedProject.cost.tts)}
                </span>
                {selectedProject.cost.videoCount > 0 && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    영상 {selectedProject.cost.videoCount}개 {formatKRW(selectedProject.cost.videos)}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 font-bold rounded">
                  총 {formatKRW(selectedProject.cost.total)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 씬 목록 */}
        <div className="grid gap-6">
          {assets.map((asset, index) => (
            <div
              key={index}
              className="rounded-xl overflow-hidden border"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <div className="flex flex-col md:flex-row">
                {/* 이미지 */}
                <div className="md:w-1/3 flex-shrink-0">
                  {asset.imageData ? (
                    <img
                      src={`data:image/png;base64,${asset.imageData}`}
                      alt={`Scene ${asset.sceneNumber}`}
                      className="w-full h-48 md:h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 md:h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('gallery.noProjects')}</span>
                    </div>
                  )}
                </div>

                {/* 내용 */}
                <div className="p-4 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-brand-500/20 text-brand-400 text-xs font-bold rounded">
                      씬 {asset.sceneNumber}
                    </span>
                    {asset.audioData && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                        오디오 있음
                      </span>
                    )}
                    {asset.subtitleData && (
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                        자막 있음
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>나레이션</h4>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {asset.narration}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>비주얼 프롬프트</h4>
                    <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                      {asset.visualPrompt}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 프로젝트 목록
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('common.close')}
        </button>

        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('gallery.title')}</h2>

        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{projects.length}개 프로젝트</span>
          {/* JSON 가져오기 버튼 */}
          <label className="flex items-center gap-2 px-3 py-2 bg-blue-800/50 hover:bg-blue-700/50 border border-blue-700/50 text-blue-300 text-xs font-bold rounded-lg cursor-pointer transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('gallery.importProject')}
            <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
      </div>

      {/* 가져오기 오류 */}
      {importError && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <span>⚠️ {importError}</span>
          <button onClick={() => setImportError(null)} className="text-red-500 hover:text-red-300 ml-4">✕</button>
        </div>
      )}

      {/* 프로젝트 목록 */}
      {projects.length === 0 ? (
        <div className="text-center py-20 relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <span key={i} className="idle-particle absolute" style={{ left: `${20 + Math.random() * 60}%`, top: `${30 + Math.random() * 40}%`, animationDelay: `${i * 0.7}s` }}>✨</span>
            ))}
          </div>
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('gallery.noProjects')}</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <div
              key={project.id}
              className="rounded-xl overflow-hidden border hover:border-[var(--border-subtle)] transition-all group"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              {/* 썸네일 */}
              <div
                className="h-40 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
                onClick={() => handleSelectProject(project)}
              >
                {project.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${project.thumbnail}`}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl" style={{ color: 'var(--text-muted)' }}>🖼️</span>
                  </div>
                )}

                {/* 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('gallery.loadProject')}</span>
                </div>
              </div>

              {/* 정보 */}
              <div className="p-4">
                <h3
                  className="font-bold mb-2 truncate cursor-pointer hover:text-brand-400 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => handleSelectProject(project)}
                  title={project.name}
                >
                  {project.name}
                </h3>

                {/* 날짜 */}
                <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(project.createdAt)}
                </div>

                {/* 모델 정보 */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {/* 이미지 모델 */}
                  {project.settings?.imageModel?.includes('flux') ? (
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold rounded">
                      Flux
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded">
                      Gemini
                    </span>
                  )}

                  {/* Flux 화풍 (Flux일 때만) */}
                  {project.settings?.imageModel?.includes('flux') && (project.settings as any)?.fluxStyle && (
                    <span className="px-2 py-0.5 text-[10px] rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      {(project.settings as any)?.fluxStyle === 'custom' ? '커스텀' : (project.settings as any)?.fluxStyle}
                    </span>
                  )}

                  {/* 씬 수 */}
                  <span className="px-2 py-0.5 text-[10px] rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                    {(project.sceneCount || project.assets?.length || 0)}씬
                  </span>

                  {/* 비용 (있는 경우만) */}
                  {project.cost && (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded">
                      {formatKRW(project.cost.total)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoad(project);
                    }}
                    className="flex-1 px-3 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 text-xs font-bold rounded transition-colors"
                  >
                    {t('gallery.loadProject')}
                  </button>

                  {/* JSON 내보내기 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportProject(project);
                    }}
                    className="p-2 rounded transition-colors hover:bg-blue-900/50 hover:text-blue-400"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    title={t('gallery.exportJson')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    className={`p-2 rounded transition-colors ${
                      confirmDelete === project.id
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'hover:bg-red-500/20 hover:text-red-400'
                    }`}
                    style={confirmDelete === project.id ? undefined : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    title={confirmDelete === project.id ? t('result.confirmDelete') : t('gallery.deleteProject')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectGallery;
