import React from 'react';
import { SystemStats, UserInfo, formatUsd, formatKrw, getStatusStyle, getStatusLabel } from './adminUtils';

interface Props {
  stats: SystemStats | null;
  users: UserInfo[];
  loading: boolean;
  onNavigateToUsers: (filter?: string) => void;
}

const AdminOverview: React.FC<Props> = ({ stats, users, loading, onNavigateToUsers }) => {
  const pendingUsers = users.filter(u => u.status === 'pending');

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 핵심 메트릭 카드 */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 총 회원 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <p className="text-xs text-slate-500">총 회원</p>
              </div>
              <p className="text-2xl font-bold text-slate-200">{stats.totalUsers}</p>
              <div className="flex gap-3 mt-2 text-[11px]">
                <span className="text-green-400">승인 {stats.approvedUsers}</span>
                <span className="text-yellow-400">대기 {stats.pendingUsers}</span>
              </div>
            </div>

            {/* 오늘 비용 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <p className="text-xs text-slate-500">오늘 비용</p>
              </div>
              <p className="text-2xl font-bold text-cyan-400">{formatUsd(stats.todayCostUsd)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{formatKrw(stats.todayCostUsd)}</p>
            </div>

            {/* 총 비용 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <p className="text-xs text-slate-500">누적 비용</p>
              </div>
              <p className="text-2xl font-bold text-amber-400">{formatUsd(stats.totalCostUsd)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{formatKrw(stats.totalCostUsd)}</p>
            </div>

            {/* 프로젝트 / 세션 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <p className="text-xs text-slate-500">프로젝트</p>
              </div>
              <p className="text-2xl font-bold text-slate-200">{stats.totalProjects}</p>
              <p className="text-[11px] text-blue-400 mt-1">활성 세션 {stats.activeSessions}개</p>
            </div>
          </div>

          {/* 게이미피케이션 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 평균 레벨 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-lg">
                  🎮
                </div>
                <p className="text-xs text-slate-500">평균 레벨</p>
              </div>
              <p className="text-2xl font-bold text-green-400">Lv.{stats.avgLevel ?? 0}</p>
              <p className="text-[11px] text-slate-500 mt-1">승인 회원 기준</p>
            </div>

            {/* 활성 스트릭 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-lg">
                  🔥
                </div>
                <p className="text-xs text-slate-500">활성 스트릭</p>
              </div>
              <p className="text-2xl font-bold text-orange-400">{stats.activeStreaks ?? 0}명</p>
              <p className="text-[11px] text-slate-500 mt-1">2일 이상 연속 접속</p>
            </div>

            {/* 총 뽑기 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-lg">
                  🎰
                </div>
                <p className="text-xs text-slate-500">총 뽑기</p>
              </div>
              <p className="text-2xl font-bold text-pink-400">{(stats.totalGachaPulls ?? 0).toLocaleString()}회</p>
              <p className="text-[11px] text-slate-500 mt-1">누적 뽑기 횟수</p>
            </div>

            {/* 활성 이벤트 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-lg">
                  📅
                </div>
                <p className="text-xs text-slate-500">활성 이벤트</p>
              </div>
              <p className="text-2xl font-bold text-indigo-400">{stats.activeEvents ?? 0}개</p>
              <p className="text-[11px] text-slate-500 mt-1">진행 중 이벤트</p>
            </div>
          </div>
        </>
      )}

      {/* 대기 중 사용자 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">승인 대기 회원</h3>
          {pendingUsers.length > 0 && (
            <button
              onClick={() => onNavigateToUsers('pending')}
              className="text-[11px] px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border border-yellow-600/30 rounded-lg transition-all"
            >
              전체 보기 ({pendingUsers.length})
            </button>
          )}
        </div>

        {pendingUsers.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">대기 중인 회원이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {pendingUsers.slice(0, 5).map(user => (
              <div key={user.email} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-4 py-2.5 border border-slate-700/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-400 text-xs font-medium">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm text-slate-200">{user.name}</p>
                    <p className="text-[11px] text-slate-500">{user.email}</p>
                  </div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${getStatusStyle(user.status)}`}>
                  {getStatusLabel(user.status)}
                </span>
              </div>
            ))}
            {pendingUsers.length > 5 && (
              <p className="text-[11px] text-slate-600 text-center pt-1">
                +{pendingUsers.length - 5}명 더...
              </p>
            )}
          </div>
        )}
      </div>

      {/* 비용 상위 & 레벨 상위 */}
      {users.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 비용 상위 회원 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">비용 상위 회원</h3>
            <div className="space-y-2">
              {[...users]
                .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
                .slice(0, 5)
                .map((user, i) => (
                  <div key={user.email} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-4 py-2.5 border border-slate-700/20">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-600 w-5 text-center">{i + 1}</span>
                      <div>
                        <p className="text-sm text-slate-200">{user.name}</p>
                        <p className="text-[11px] text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-cyan-400">{formatUsd(user.totalCostUsd)}</p>
                      <p className="text-[10px] text-slate-500">{formatKrw(user.totalCostUsd)}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* 레벨 상위 회원 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">레벨 상위 회원</h3>
            <div className="space-y-2">
              {[...users]
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .slice(0, 5)
                .map((user, i) => (
                  <div key={user.email} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-4 py-2.5 border border-slate-700/20">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-600 w-5 text-center">{i + 1}</span>
                      <div>
                        <p className="text-sm text-slate-200">{user.name}</p>
                        <p className="text-[11px] text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-400">Lv.{user.level}</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[10px] text-slate-500">{user.xp.toLocaleString()} XP</span>
                        {user.streakCount >= 2 && (
                          <span className="text-[10px] text-orange-400">🔥{user.streakCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOverview;
