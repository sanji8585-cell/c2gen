import React, { useState, useEffect, useCallback } from 'react';
import { ApiKeyServiceStatus, authFetch } from './adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const AdminApiKeys: React.FC<Props> = ({ adminToken, onToast }) => {
  const [status, setStatus] = useState<Record<string, ApiKeyServiceStatus>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await authFetch({ action: 'apiKeyStatus', adminToken });
      if (ok) {
        setStatus(data.status || {});
        setCheckedAt(data.checkedAt);
      } else {
        onToast('error', data.message || '상태를 확인할 수 없습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const services = [
    { key: 'elevenlabs', name: 'ElevenLabs', description: 'TTS 음성 생성', color: 'purple' },
    { key: 'gemini', name: 'Google Gemini', description: '스크립트 / 이미지 생성', color: 'blue' },
    { key: 'fal', name: 'fal.ai', description: 'Flux 이미지 / PixVerse 영상', color: 'amber' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={loadStatus} disabled={loading} className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
          상태 재확인
        </button>
        {checkedAt && <span className="text-[11px] text-slate-600">마지막 확인: {new Date(checkedAt).toLocaleString('ko-KR')}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {services.map(svc => {
          const s = status[svc.key];
          const colorMap: Record<string, { bg: string; border: string; text: string }> = {
            purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
            blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
            amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
          };
          const c = colorMap[svc.color] || colorMap.blue;

          return (
            <div key={svc.key} className={`${c.bg} border ${c.border} rounded-xl p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${s?.configured ? 'bg-green-500' : 'bg-red-500'}`} />
                <h3 className={`text-sm font-medium ${c.text}`}>{svc.name}</h3>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">{svc.description}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">상태</span>
                  <span className={s?.configured ? 'text-green-400' : 'text-red-400'}>
                    {s?.configured ? '설정됨' : '미설정'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">API 키 수</span>
                  <span className="text-slate-300">{s?.keyCount || 0}개</span>
                </div>

                {svc.key === 'elevenlabs' && s?.subscription && (
                  <div className="border-t border-slate-700/30 pt-2 mt-2 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">구독 등급</span>
                      <span className="text-purple-300">{s.subscription.tier}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">잔여 캐릭터</span>
                      <span className="text-slate-300">{s.subscription.remaining?.toLocaleString()}</span>
                    </div>
                    <div className="mt-2">
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, ((s.subscription.characterLimit - s.subscription.characterCount) / s.subscription.characterLimit) * 100))}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">
                        {s.subscription.characterCount?.toLocaleString()} / {s.subscription.characterLimit?.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminApiKeys;
