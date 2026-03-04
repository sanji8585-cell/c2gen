import React, { useState, useEffect, useCallback } from 'react';
import {
  UserInfo, UserProject, authFetch, projectsFetch,
  formatCost, timeAgo, getProjectCost,
} from './adminUtils';
import AdminProjectViewer from './AdminProjectViewer';

interface Props {
  users: UserInfo[];
  adminToken: string;
  initialUserEmail?: string;
  onRefresh: () => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminProjects: React.FC<Props> = ({ users, adminToken, initialUserEmail, onRefresh, onToast }) => {
  const [selectedEmail, setSelectedEmail] = useState<string>(initialUserEmail || '');
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewProject, setViewProject] = useState<UserProject | null>(null);

  const loadProjects = useCallback(async (email: string) => {
    if (!email) { setProjects([]); return; }
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'userProjects', adminToken, email });
      if (ok) setProjects(data.projects || []);
      else onToast('error', data.message || '프로젝트를 불러올 수 없습니다.');
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => {
    if (selectedEmail) loadProjects(selectedEmail);
  }, [selectedEmail, loadProjects]);

  useEffect(() => {
    if (initialUserEmail) setSelectedEmail(initialUserEmail);
  }, [initialUserEmail]);

  const handleDeleteProject = useCallback(async (projectId: string, projectName: string) => {
    if (!confirm(`"${projectName}" 프로젝트를 삭제하시겠습니까?`)) return;
    try {
      const { ok } = await projectsFetch({
        action: 'admin-delete-project',
        adminToken,
        projectId,
        token: adminToken,
      });
      if (ok) {
        onToast('success', '프로젝트가 삭제되었습니다.');
        setProjects(prev => prev.filter(p => p.id !== projectId));
        if (viewProject?.id === projectId) setViewProject(null);
        onRefresh();
      }
    } catch {
      onToast('error', '프로젝트 삭제에 실패했습니다.');
    }
  }, [adminToken, viewProject, onRefresh, onToast]);

  const filteredProjects = search
    ? projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.topic.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  const usersWithProjects = users.filter(u => u.projectCount > 0);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedEmail}
          onChange={e => setSelectedEmail(e.target.value)}
          className="min-w-[220px] px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="">회원 선택...</option>
          {usersWithProjects.map(u => (
            <option key={u.email} value={u.email}>
              {u.name} ({u.email}) - {u.projectCount}개
            </option>
          ))}
        </select>

        {selectedEmail && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="프로젝트 이름/주제 검색..."
            className="flex-1 min-w-[200px] px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        )}

        {selectedEmail && (
          <button
            onClick={() => loadProjects(selectedEmail)}
            disabled={loading}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
          >
            {loading ? '로딩...' : '새로고침'}
          </button>
        )}

        {selectedEmail && (
          <span className="text-[11px] text-slate-600">
            {filteredProjects.length}개 프로젝트
          </span>
        )}
      </div>

      {/* 프로젝트 그리드 */}
      {!selectedEmail ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <div className="text-slate-600 text-3xl mb-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto opacity-30"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p className="text-sm text-slate-500">왼쪽에서 회원을 선택하면 프로젝트 목록이 표시됩니다.</p>
          <p className="text-[11px] text-slate-600 mt-1">프로젝트가 있는 회원: {usersWithProjects.length}명</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-sm text-slate-500">
            {projects.length === 0 ? '저장된 프로젝트가 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(proj => (
            <div key={proj.id} className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all group">
              {/* 썸네일 */}
              <div className="aspect-video bg-slate-800/50 relative overflow-hidden">
                {proj.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${proj.thumbnail}`}
                    alt={proj.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs">
                    No thumbnail
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => setViewProject(proj)}
                    className="text-[11px] px-2 py-1 bg-slate-900/90 text-cyan-400 border border-cyan-600/30 rounded-md backdrop-blur-sm"
                  >
                    열람
                  </button>
                  <button
                    onClick={() => handleDeleteProject(proj.id, proj.name)}
                    className="text-[11px] px-2 py-1 bg-slate-900/90 text-red-400 border border-red-600/30 rounded-md backdrop-blur-sm"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 정보 */}
              <div className="p-3">
                <p className="text-sm font-medium text-slate-200 truncate">{proj.name}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{proj.topic}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className="text-slate-600">{proj.sceneCount || '?'}씬</span>
                  <span className="text-cyan-400/70">{formatCost(getProjectCost(proj.cost))}</span>
                  <span className="text-slate-600">{timeAgo(proj.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 프로젝트 뷰어 모달 */}
      {viewProject && (
        <AdminProjectViewer
          project={viewProject}
          adminToken={adminToken}
          onClose={() => setViewProject(null)}
          onDelete={handleDeleteProject}
        />
      )}
    </div>
  );
};

export default AdminProjects;
