/**
 * 프로젝트 관리 훅 (저장, 불러오기, 삭제, 가져오기)
 */
import { useState, useCallback } from 'react';
import { SavedProject, GeneratedAsset } from '../types';
import { saveProject, getSavedProjects, getProjectById, deleteProject, importProject } from '../services/projectService';
import { CostBreakdown } from '../types';

interface UseProjectManagementReturn {
  savedProjects: SavedProject[];
  refreshProjects: () => Promise<void>;
  handleSaveProject: (topic: string, assets: GeneratedAsset[], cost?: CostBreakdown) => Promise<void>;
  handleDeleteProject: (id: string) => void;
  handleImportProject: (project: SavedProject) => Promise<void>;
  handleLoadProject: (project: SavedProject) => Promise<{
    assets: GeneratedAsset[];
    topic: string;
    hasAudio: boolean;
  } | null>;
}

export function useProjectManagement(): UseProjectManagementReturn {
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const refreshProjects = useCallback(async () => {
    try {
      const projects = await getSavedProjects();
      setSavedProjects(projects);
    } catch (e) {
      console.error('프로젝트 목록 로딩 실패:', e);
    }
  }, []);

  const handleSaveProject = useCallback(async (
    topic: string,
    assets: GeneratedAsset[],
    cost?: CostBreakdown
  ) => {
    await saveProject(topic, assets, undefined, cost);
    await refreshProjects();
  }, [refreshProjects]);

  const handleDeleteProject = useCallback((id: string) => {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
    deleteProject(id).then(() => refreshProjects()).catch(() => refreshProjects());
  }, [refreshProjects]);

  const handleImportProject = useCallback(async (project: SavedProject) => {
    await importProject(project);
    await refreshProjects();
  }, [refreshProjects]);

  const handleLoadProject = useCallback(async (project: SavedProject) => {
    const fullProject = await getProjectById(project.id);
    if (!fullProject) return null;

    return {
      assets: fullProject.assets,
      topic: fullProject.topic,
      hasAudio: fullProject.assets.some(a => a.audioData),
    };
  }, []);

  return {
    savedProjects,
    refreshProjects,
    handleSaveProject,
    handleDeleteProject,
    handleImportProject,
    handleLoadProject,
  };
}
