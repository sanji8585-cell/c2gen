import React, { useState, useMemo, useCallback } from 'react';
import {
  UserInfo, authFetch, formatCost, timeAgo,
  getStatusStyle, getStatusLabel,
} from './adminUtils';
import AdminUserDetailModal from './AdminUserDetailModal';

interface Props {
  users: UserInfo[];
  adminToken: string;
  loading: boolean;
  initialFilter?: string;
  onRefresh: () => void;
  onViewProjects: (user: UserInfo) => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}

type SortKey = 'name' | 'status' | 'credits' | 'totalCostUsd' | 'todayCostUsd' | 'projectCount' | 'lastLoginAt' | 'createdAt' | 'level';
type SortDir = 'asc' | 'desc';

const AdminUsers: React.FC<Props> = ({ users, adminToken, loading, initialFilter, onRefresh, onViewProjects, onToast }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || 'all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [detailUser, setDetailUser] = useState<UserInfo | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (statusFilter !== 'all') {
      list = list.filter(u => u.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (av == null) av = 0;
      if (bv == null) bv = 0;
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [users, statusFilter, search, sortKey, sortDir]);

  const handleUserAction = useCallback(async (action: 'approveUser' | 'rejectUser' | 'deleteUser', email: string, userName: string) => {
    if (action === 'deleteUser') {
      if (!confirm(`${userName} 님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    }
    try {
      const { ok, data } = await authFetch({ action, adminToken, email });
      if (ok) {
        onToast('success', data.message);
        onRefresh();
      } else {
        onToast('error', data.message || '처리에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  }, [adminToken, onRefresh, onToast]);

  const handleSetOperator = useCallback(async (email: string, isOperator: boolean) => {
    try {
      const { ok, data } = await authFetch({ action: 'setOperator', adminToken, email, isOperator });
      if (ok) {
        onToast('success', data.message);
        onRefresh();
      } else {
        onToast('error', data.message || '처리에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
  }, [adminToken, onRefresh, onToast]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-slate-700 ml-1">&#8597;</span>;
    return <span className="text-cyan-400 ml-1">{sortDir === 'asc' ? '&#9650;' : '&#9660;'}</span>;
  };

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이름 또는 이메일 검색..."
          className="flex-1 min-w-[200px] px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />

        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {[
            { id: 'all', label: '전체' },
            { id: 'pending', label: '대기' },
            { id: 'approved', label: '승인' },
            { id: 'rejected', label: '거부' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                statusFilter === f.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
        >
          {loading ? '로딩...' : '새로고침'}
        </button>

        <span className="text-[11px] text-slate-600">
          {filteredUsers.length} / {users.length}명
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('name')}>
                  이름 <SortIcon col="name" />
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('status')}>
                  상태 <SortIcon col="status" />
                </th>
                <th className="text-center px-4 py-3 font-medium">플랜</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('credits')}>
                  크레딧 <SortIcon col="credits" />
                </th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('totalCostUsd')}>
                  누적 비용 <SortIcon col="totalCostUsd" />
                </th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('todayCostUsd')}>
                  오늘 <SortIcon col="todayCostUsd" />
                </th>
                <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('projectCount')}>
                  프로젝트 <SortIcon col="projectCount" />
                </th>
                <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('level')}>
                  레벨 <SortIcon col="level" />
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('createdAt')}>
                  가입일 <SortIcon col="createdAt" />
                </th>
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-slate-300" onClick={() => handleSort('lastLoginAt')}>
                  마지막 접속 <SortIcon col="lastLoginAt" />
                </th>
                <th className="text-right px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-slate-600 text-xs">
                    {users.length === 0 ? '등록된 회원이 없습니다.' : '검색 결과가 없습니다.'}
                  </td>
                </tr>
              ) : filteredUsers.map(user => (
                <tr key={user.email} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  {/* 이름/이메일 */}
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-slate-200 font-medium">{user.name}</p>
                        {user.oauthProvider === 'google' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">G</span>
                        )}
                        {user.oauthProvider === 'kakao' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium">K</span>
                        )}
                        {user.plan === 'operator' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">운영자</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{user.email}</p>
                    </div>
                  </td>

                  {/* 상태 */}
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${getStatusStyle(user.status)}`}>
                      {getStatusLabel(user.status)}
                    </span>
                  </td>

                  {/* 플랜 */}
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const plan = user.plan || 'free';
                      const styles: Record<string, string> = {
                        free: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
                        basic: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
                        pro: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
                        operator: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
                      };
                      const labels: Record<string, string> = { free: 'Free', basic: 'Basic', pro: 'Pro', operator: '운영자' };
                      return (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${styles[plan] || styles.free}`}>
                          {labels[plan] || plan}
                        </span>
                      );
                    })()}
                  </td>

                  {/* 크레딧 */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-emerald-400 text-[12px] font-medium">{user.credits.toLocaleString()}</span>
                  </td>

                  {/* 누적 비용 */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-cyan-400/80 text-[12px]">{formatCost(user.totalCostUsd)}</span>
                  </td>

                  {/* 오늘 비용 */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-amber-400/70 text-[12px]">{formatCost(user.todayCostUsd)}</span>
                  </td>

                  {/* 프로젝트 수 */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-slate-400 text-[12px]">{user.projectCount}</span>
                  </td>

                  {/* 레벨 */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-purple-400 text-[12px] font-medium">Lv.{user.level}</span>
                    <span className="text-slate-600 text-[10px] ml-1">({user.xp}xp)</span>
                    {user.streakCount >= 2 && (
                      <span className="text-orange-400 text-[10px] ml-1">🔥{user.streakCount}d</span>
                    )}
                  </td>

                  {/* 가입일 */}
                  <td className="px-4 py-3">
                    <span className="text-slate-500 text-[12px]">{timeAgo(user.createdAt)}</span>
                  </td>

                  {/* 마지막 접속 */}
                  <td className="px-4 py-3">
                    <span className="text-slate-500 text-[12px]">{timeAgo(user.lastLoginAt)}</span>
                  </td>

                  {/* 관리 버튼 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setDetailUser(user)}
                        className="text-[11px] px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 rounded-md transition-all"
                        title="상세"
                      >
                        상세
                      </button>
                      <button
                        onClick={() => onViewProjects(user)}
                        className="text-[11px] px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-600/30 rounded-md transition-all"
                        title="프로젝트"
                      >
                        프로젝트
                      </button>

                      {user.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUserAction('approveUser', user.email, user.name)}
                            className="text-[11px] px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 rounded-md transition-all"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => handleUserAction('rejectUser', user.email, user.name)}
                            className="text-[11px] px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-md transition-all"
                          >
                            거부
                          </button>
                        </>
                      )}
                      {user.status === 'approved' && (
                        <>
                          <button
                            onClick={() => handleSetOperator(user.email, user.plan !== 'operator')}
                            className={`text-[11px] px-2 py-1 rounded-md transition-all ${
                              user.plan === 'operator'
                                ? 'bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 border border-orange-600/30'
                                : 'bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 border border-teal-600/30'
                            }`}
                          >
                            {user.plan === 'operator' ? '운영자 해제' : '운영자 지정'}
                          </button>
                          <button
                            onClick={() => handleUserAction('rejectUser', user.email, user.name)}
                            className="text-[11px] px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border border-yellow-600/30 rounded-md transition-all"
                          >
                            차단
                          </button>
                        </>
                      )}
                      {user.status === 'rejected' && (
                        <button
                          onClick={() => handleUserAction('approveUser', user.email, user.name)}
                          className="text-[11px] px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 rounded-md transition-all"
                        >
                          승인
                        </button>
                      )}

                      <button
                        onClick={() => handleUserAction('deleteUser', user.email, user.name)}
                        className="text-[11px] px-2 py-1 bg-slate-700/50 hover:bg-red-900/50 text-slate-500 hover:text-red-400 rounded-md transition-all"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 유저 상세 모달 */}
      {detailUser && (
        <AdminUserDetailModal
          user={detailUser}
          adminToken={adminToken}
          onClose={() => setDetailUser(null)}
          onToast={onToast}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

export default AdminUsers;
