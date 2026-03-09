import React, { useState, useCallback, useEffect } from 'react';
import PresetWizard from './preset/PresetWizard';
import CampaignDashboard from './CampaignDashboard';
import ApprovalQueue from './ApprovalQueue';
import AnalyticsDashboard from './AnalyticsDashboard';
import PlatformUploader from './PlatformUploader';
import { listPresets, deletePreset } from '../services/brandPresetService';
import { listCampaigns } from '../services/campaignService';
import type { BrandPreset, Campaign } from '../types';

type PilotSection = 'overview' | 'presets' | 'campaigns' | 'approval' | 'analytics' | 'settings';

interface PilotDashboardProps {
  onClose: () => void;
}

const NAV_ITEMS: Array<{ key: PilotSection; label: string; icon: string }> = [
  { key: 'overview', label: '대시보드', icon: '◈' },
  { key: 'presets', label: '브랜드 프리셋', icon: '◇' },
  { key: 'campaigns', label: '캠페인', icon: '▷' },
  { key: 'approval', label: '승인 대기열', icon: '☐' },
  { key: 'analytics', label: '성과 분석', icon: '◎' },
  { key: 'settings', label: '플랫폼 설정', icon: '⚙' },
];

export default function PilotDashboard({ onClose }: PilotDashboardProps) {
  const [section, setSection] = useState<PilotSection>('overview');
  const [presets, setPresets] = useState<BrandPreset[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresetWizard, setShowPresetWizard] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BrandPreset | undefined>();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        listPresets().catch(() => []),
        listCampaigns().catch(() => []),
      ]);
      setPresets(p);
      setCampaigns(c);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const pendingCount = 0; // TODO: fetch from approval API

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* ── Sidebar ── */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-20">
            <div className="flex items-center gap-2 mb-6 px-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
                style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}>P</div>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>C2 PILOT</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>자동화 엔진</div>
              </div>
            </div>

            <nav className="space-y-0.5">
              {NAV_ITEMS.map(item => {
                const isActive = section === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setSection(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      isActive ? 'text-white' : ''
                    }`}
                    style={isActive
                      ? { background: 'linear-gradient(135deg, #0891b2, #2563eb)', boxShadow: '0 2px 8px rgba(8,145,178,0.3)' }
                      : { color: 'var(--text-secondary)' }
                    }
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span className="text-sm w-5 text-center">{item.icon}</span>
                    {item.label}
                    {item.key === 'approval' && pendingCount > 0 && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">{pendingCount}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 px-3">
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>프리셋</div>
                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{presets.length}</div>
                <div className="text-[10px] font-medium mb-1 mt-2" style={{ color: 'var(--text-muted)' }}>캠페인</div>
                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{campaigns.length}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Mobile nav ── */}
        <div className="lg:hidden w-full mb-4">
          <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
            {NAV_ITEMS.map(item => {
              const isActive = section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap ${
                    isActive ? 'text-white' : ''
                  }`}
                  style={isActive
                    ? { background: 'linear-gradient(135deg, #0891b2, #2563eb)' }
                    : { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' }
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0">
          {/* Overview */}
          {section === 'overview' && (
            <div>
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>C2 PILOT</h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>자동화 콘텐츠 파이프라인</p>

              {loading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Quick action cards */}
                  <button onClick={() => setSection('presets')}
                    className="rounded-xl border p-5 text-left transition-all hover:shadow-lg group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                    <div className="text-2xl mb-3">◇</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>브랜드 프리셋</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{presets.length}개 프리셋</div>
                  </button>

                  <button onClick={() => setSection('campaigns')}
                    className="rounded-xl border p-5 text-left transition-all hover:shadow-lg group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                    <div className="text-2xl mb-3">▷</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>캠페인</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{campaigns.filter(c => c.status === 'active').length}개 활성</div>
                  </button>

                  <button onClick={() => setSection('approval')}
                    className="rounded-xl border p-5 text-left transition-all hover:shadow-lg group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                    <div className="text-2xl mb-3">☐</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>승인 대기열</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>대기 중 {pendingCount}건</div>
                  </button>

                  <button onClick={() => setSection('analytics')}
                    className="rounded-xl border p-5 text-left transition-all hover:shadow-lg group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                    <div className="text-2xl mb-3">◎</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>성과 분석</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>실시간 대시보드</div>
                  </button>

                  <button onClick={() => setSection('settings')}
                    className="rounded-xl border p-5 text-left transition-all hover:shadow-lg group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                    <div className="text-2xl mb-3">⚙</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>플랫폼 설정</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>YouTube / TikTok 연결</div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Presets */}
          {section === 'presets' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>브랜드 프리셋</h2>
                <button
                  onClick={() => { setEditingPreset(undefined); setShowPresetWizard(true); }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}>
                  + 새 프리셋
                </button>
              </div>
              {presets.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {presets.map(preset => (
                    <div key={preset.id}
                      className="rounded-xl border p-5 transition-all hover:shadow-lg cursor-pointer group"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
                      onClick={() => { setEditingPreset(preset); setShowPresetWizard(true); }}>
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{preset.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          Step {preset.wizard_step || 1}/6
                        </span>
                      </div>
                      {preset.description && <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>{preset.description}</p>}
                      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(preset.updated_at).toLocaleDateString('ko-KR')}</span>
                        <button
                          onClick={async (e) => { e.stopPropagation(); if (confirm('삭제하시겠습니까?')) { await deletePreset(preset.id); loadData(); } }}
                          className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-red-500/10"
                          style={{ color: '#ef4444' }}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>아직 프리셋이 없습니다</p>
                  <button onClick={() => setShowPresetWizard(true)}
                    className="text-sm px-4 py-2 rounded-lg border hover:border-cyan-500/50 transition-colors"
                    style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>프리셋 만들기</button>
                </div>
              )}
            </div>
          )}

          {/* Campaigns */}
          {section === 'campaigns' && (
            <CampaignDashboard onClose={() => setSection('overview')} />
          )}

          {/* Approval */}
          {section === 'approval' && (
            selectedCampaignId ? (
              <ApprovalQueue
                campaignId={selectedCampaignId}
                campaignName={campaigns.find(c => c.id === selectedCampaignId)?.name || ''}
                onBack={() => setSelectedCampaignId(null)}
              />
            ) : (
              <div>
                <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>승인 대기열</h2>
                {campaigns.length > 0 ? (
                  <div className="space-y-2">
                    {campaigns.filter(c => c.status === 'active').map(campaign => (
                      <button key={campaign.id}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        className="w-full flex items-center justify-between rounded-lg border p-4 transition-all hover:shadow-md"
                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                        <div className="text-left">
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{campaign.name}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>생성 {campaign.total_generated} / 게시 {campaign.total_published}</div>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>활성 캠페인이 없습니다</p>
                )}
              </div>
            )
          )}

          {/* Analytics */}
          {section === 'analytics' && (
            selectedCampaignId ? (
              <AnalyticsDashboard
                campaignId={selectedCampaignId}
                campaignName={campaigns.find(c => c.id === selectedCampaignId)?.name || ''}
                onBack={() => setSelectedCampaignId(null)}
              />
            ) : (
              <div>
                <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>성과 분석</h2>
                {campaigns.length > 0 ? (
                  <div className="space-y-2">
                    {campaigns.map(campaign => (
                      <button key={campaign.id}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        className="w-full flex items-center justify-between rounded-lg border p-4 transition-all hover:shadow-md"
                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                        <div className="text-left">
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{campaign.name}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>게시 {campaign.total_published}건</div>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>캠페인이 없습니다</p>
                )}
              </div>
            )
          )}

          {/* Settings */}
          {section === 'settings' && (
            <div>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>플랫폼 설정</h2>
              <PlatformUploader videoBase64={null} title="" description="" tags={[]} onClose={() => setSection('overview')} />
            </div>
          )}
        </main>
      </div>

      {/* Preset Wizard Modal */}
      {showPresetWizard && (
        <PresetWizard
          onClose={() => { setShowPresetWizard(false); loadData(); }}
          onComplete={() => { setShowPresetWizard(false); loadData(); }}
          editPreset={editingPreset}
        />
      )}
    </div>
  );
}
