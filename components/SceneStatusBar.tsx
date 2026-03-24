import React from 'react';
import { GeneratedAsset } from '../types';

interface SceneStatusBarProps {
  data: GeneratedAsset[];
  selectedCount?: number;
}

export default function SceneStatusBar({ data, selectedCount = 0 }: SceneStatusBarProps) {
  if (data.length === 0) return null;

  const total = data.length;
  const images = data.filter(d => d.imageData).length;
  const audio = data.filter(d => d.audioData).length;
  const videos = data.filter(d => d.videoData).length;
  const errors = data.filter(d => d.status === 'error').length;
  const generating = data.filter(d => d.status === 'generating').length;

  const imgPct = Math.round((images / total) * 100);
  const audPct = Math.round((audio / total) * 100);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-3 flex-wrap bg-blue-50 dark:bg-slate-800/90 border border-blue-200 dark:border-blue-500/30 shadow-sm">
      {/* 전체 씬 수 */}
      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
        📊 {total}씬
      </span>

      <div className="w-px h-4" style={{ backgroundColor: 'var(--border-default)' }} />

      {/* 이미지 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: images === total ? '#22c55e' : '#60a5fa' }}>🖼️</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: images === total ? '#22c55e' : 'var(--text-secondary)' }}>
          {images}/{total}
        </span>
        {images > 0 && images < total && (
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(96,165,250,0.2)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${imgPct}%`, backgroundColor: '#60a5fa' }} />
          </div>
        )}
        {images === total && <span className="text-[9px]" style={{ color: '#22c55e' }}>✓</span>}
      </div>

      {/* TTS */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: audio === total ? '#22c55e' : '#22c55e80' }}>🔊</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: audio === total ? '#22c55e' : 'var(--text-secondary)' }}>
          {audio}/{total}
        </span>
        {audio > 0 && audio < total && (
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(34,197,94,0.2)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${audPct}%`, backgroundColor: '#22c55e' }} />
          </div>
        )}
        {audio === total && <span className="text-[9px]" style={{ color: '#22c55e' }}>✓</span>}
      </div>

      {/* 영상 */}
      {videos > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs">🎬</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: '#06b6d4' }}>{videos}/{total}</span>
        </div>
      )}

      {/* 생성 중 */}
      {generating > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent animate-spin rounded-full" />
          <span className="text-xs font-bold" style={{ color: '#60a5fa' }}>생성 중 {generating}</span>
        </div>
      )}

      {/* 실패 */}
      {errors > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs">⚠️</span>
          <span className="text-xs font-bold" style={{ color: '#ef4444' }}>실패 {errors}</span>
        </div>
      )}

      {/* 선택된 씬 */}
      {selectedCount > 0 && (
        <>
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-default)' }} />
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
            ☑ {selectedCount}개 선택
          </span>
        </>
      )}
    </div>
  );
}
