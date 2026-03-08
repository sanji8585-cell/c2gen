import React, { useState, useEffect } from 'react';
import { initYoutubeAuth, checkYoutubeStatus, disconnectYoutube, uploadToYoutube } from '../services/youtubeUploadService';
import { initTiktokAuth, checkTiktokStatus, disconnectTiktok, uploadToTiktok } from '../services/tiktokUploadService';

interface PlatformUploaderProps {
  videoBase64: string | null;
  title: string;
  description: string;
  tags: string[];
  onClose: () => void;
}

interface PlatformStatus {
  connected: boolean;
  channelName?: string;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  videoId?: string;
  videoUrl?: string;
  error?: string;
}

type YTPrivacy = 'private' | 'public' | 'unlisted';
const PRIVACY_LABELS: Record<YTPrivacy, string> = { private: '비공개', public: '공개', unlisted: '미등록' };

const PlatformUploader: React.FC<PlatformUploaderProps> = ({ videoBase64, title: defaultTitle, description: defaultDesc, tags: defaultTags, onClose }) => {
  const [ytStatus, setYtStatus] = useState<PlatformStatus>({ connected: false });
  const [ttStatus, setTtStatus] = useState<PlatformStatus>({ connected: false });
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDesc);
  const [tagsText, setTagsText] = useState(defaultTags.join(', '));
  const [useYoutube, setUseYoutube] = useState(false);
  const [useTiktok, setUseTiktok] = useState(false);
  const [privacy, setPrivacy] = useState<YTPrivacy>('private');

  const [ytUpload, setYtUpload] = useState<UploadState>({ status: 'idle' });
  const [ttUpload, setTtUpload] = useState<UploadState>({ status: 'idle' });

  const isUploading = ytUpload.status === 'uploading' || ttUpload.status === 'uploading';
  const hasUploadTarget = (useYoutube && ytStatus.connected) || (useTiktok && ttStatus.connected);

  useEffect(() => {
    const fetchStatus = async () => {
      setLoading(true);
      try {
        const [yt, tt] = await Promise.all([checkYoutubeStatus(), checkTiktokStatus()]);
        setYtStatus(yt);
        setTtStatus(tt);
        if (yt.connected) setUseYoutube(true);
        if (tt.connected) setUseTiktok(true);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStatus();
  }, []);

  const handleConnect = async (platform: 'youtube' | 'tiktok') => {
    try {
      const url = platform === 'youtube' ? await initYoutubeAuth() : await initTiktokAuth();
      const popup = window.open(url, `${platform}_auth`, 'width=600,height=700');
      const interval = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(interval);
          const status = platform === 'youtube' ? await checkYoutubeStatus() : await checkTiktokStatus();
          if (platform === 'youtube') { setYtStatus(status); if (status.connected) setUseYoutube(true); }
          else { setTtStatus(status); if (status.connected) setUseTiktok(true); }
        }
      }, 1000);
    } catch { /* ignore */ }
  };

  const handleDisconnect = async (platform: 'youtube' | 'tiktok') => {
    try {
      if (platform === 'youtube') { await disconnectYoutube(); setYtStatus({ connected: false }); setUseYoutube(false); }
      else { await disconnectTiktok(); setTtStatus({ connected: false }); setUseTiktok(false); }
    } catch { /* ignore */ }
  };

  const handleUpload = async () => {
    if (!videoBase64 || !hasUploadTarget) return;
    const parsedTags = tagsText.split(',').map(t => t.trim()).filter(Boolean);

    if (useYoutube && ytStatus.connected) {
      setYtUpload({ status: 'uploading' });
      try {
        const res = await uploadToYoutube({ videoBase64, title, description, tags: parsedTags, privacy });
        setYtUpload({ status: 'success', videoId: res.videoId, videoUrl: res.videoUrl });
      } catch (e: unknown) {
        setYtUpload({ status: 'error', error: e instanceof Error ? e.message : '업로드 실패' });
      }
    }

    if (useTiktok && ttStatus.connected) {
      setTtUpload({ status: 'uploading' });
      try {
        const res = await uploadToTiktok({ videoBase64, title, description, tags: parsedTags });
        setTtUpload({ status: 'success', videoId: res.videoId, videoUrl: res.videoUrl });
      } catch (e: unknown) {
        setTtUpload({ status: 'error', error: e instanceof Error ? e.message : '업로드 실패' });
      }
    }
  };

  const renderPlatformCard = (platform: 'youtube' | 'tiktok', status: PlatformStatus, icon: string, color: string) => {
    const label = platform === 'youtube' ? 'YouTube' : 'TikTok';
    return (
      <div className="flex-1 rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</h3>
            {status.connected && status.channelName && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{status.channelName}</p>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
            {status.connected ? '연결됨' : '미연결'}
          </span>
        </div>
        {status.connected ? (
          <button onClick={() => handleDisconnect(platform)} className="w-full text-xs py-1.5 rounded-lg border transition-colors hover:bg-red-500/10" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
            연결 해제
          </button>
        ) : (
          <button onClick={() => handleConnect(platform)} className="w-full text-xs py-1.5 rounded-lg font-medium text-white transition-opacity hover:opacity-90" style={{ background: color }}>
            연결
          </button>
        )}
      </div>
    );
  };

  const renderUploadStatus = (label: string, state: UploadState, retryFn: () => void) => {
    if (state.status === 'idle') return null;
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
        {state.status === 'uploading' && <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />}
        {state.status === 'success' && <span className="text-emerald-400 shrink-0">&#10003;</span>}
        {state.status === 'error' && <span className="text-red-400 shrink-0">&#10007;</span>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {state.status === 'uploading' && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>업로드 중...</p>}
          {state.status === 'success' && state.videoUrl && (
            <a href={state.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:underline truncate block">{state.videoUrl}</a>
          )}
          {state.status === 'error' && <p className="text-xs text-red-400">{state.error}</p>}
        </div>
        {state.status === 'error' && (
          <button onClick={retryFn} className="text-xs px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors shrink-0">재시도</button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>플랫폼 업로드</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>&#x2715;</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Platform Cards */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>플랫폼 연결</h3>
            {loading ? (
              <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="flex gap-3">
                {renderPlatformCard('youtube', ytStatus, '\u25B6', 'linear-gradient(135deg, #FF0000, #CC0000)')}
                {renderPlatformCard('tiktok', ttStatus, '\u266B', 'linear-gradient(135deg, #00f2ea, #ff0050)')}
              </div>
            )}
          </div>

          {/* Upload Form */}
          {(ytStatus.connected || ttStatus.connected) && videoBase64 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>업로드 설정</h3>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>제목</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={isUploading}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>설명</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={isUploading}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-cyan-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>태그 (쉼표 구분)</label>
                <input type="text" value={tagsText} onChange={e => setTagsText(e.target.value)} disabled={isUploading}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-sm" style={{ color: ytStatus.connected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={useYoutube} onChange={e => setUseYoutube(e.target.checked)} disabled={!ytStatus.connected || isUploading} className="accent-cyan-500" />
                  YouTube
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: ttStatus.connected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={useTiktok} onChange={e => setUseTiktok(e.target.checked)} disabled={!ttStatus.connected || isUploading} className="accent-cyan-500" />
                  TikTok
                </label>

                {useYoutube && ytStatus.connected && (
                  <select value={privacy} onChange={e => setPrivacy(e.target.value as YTPrivacy)} disabled={isUploading}
                    className="ml-auto rounded-lg border px-3 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
                    {(Object.entries(PRIVACY_LABELS) as [YTPrivacy, string][]).map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {!videoBase64 && (
            <div className="text-center py-6 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              <p className="text-sm">렌더링된 영상이 없습니다. 먼저 영상을 렌더링해주세요.</p>
            </div>
          )}

          {/* Upload Progress */}
          {(ytUpload.status !== 'idle' || ttUpload.status !== 'idle') && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>업로드 진행</h3>
              {renderUploadStatus('YouTube', ytUpload, handleUpload)}
              {renderUploadStatus('TikTok', ttUpload, handleUpload)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button onClick={onClose} disabled={isUploading} className="px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
            닫기
          </button>
          <button onClick={handleUpload} disabled={!hasUploadTarget || !videoBase64 || isUploading}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}>
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlatformUploader;
