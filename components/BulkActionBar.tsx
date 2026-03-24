import React, { useState } from 'react';
import { GeneratedAsset } from '../types';

interface BulkActionBarProps {
  selectedIndices: Set<number>;
  data: GeneratedAsset[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkRegenerateImages: (indices: number[]) => void;
  onBulkRegenerateAudio: (indices: number[]) => void;
  onBulkGenerateAnimation: (indices: number[]) => void;
  onBulkDelete: (indices: number[]) => void;
  onBulkMuteToggle: (indices: number[]) => void;
  userCredits?: number;
}

type DialogType = 'image' | 'audio' | 'animation' | 'delete' | 'mute' | null;

export default function BulkActionBar({
  selectedIndices, data, onSelectAll, onDeselectAll,
  onBulkRegenerateImages, onBulkRegenerateAudio,
  onBulkGenerateAnimation, onBulkDelete, onBulkMuteToggle,
  userCredits = 0,
}: BulkActionBarProps) {
  const [dialog, setDialog] = useState<DialogType>(null);
  const count = selectedIndices.size;
  const indices = Array.from(selectedIndices).sort((a, b) => a - b);

  if (count === 0) return null;

  // 영상 변환 시 이미지 없는 씬 체크
  const noImageScenes = indices.filter(i => !data[i]?.imageData);
  const animatableCount = count - noImageScenes.length;
  const animationCost = animatableCount * 73;
  const imageCost = count * 16;
  const ttsCost = Math.max(15, Math.ceil(indices.reduce((s, i) => s + (data[i]?.narration?.length || 0), 0) / 1000) * 15);

  const handleConfirm = () => {
    switch (dialog) {
      case 'image': onBulkRegenerateImages(indices); break;
      case 'audio': onBulkRegenerateAudio(indices); break;
      case 'animation': onBulkGenerateAnimation(indices.filter(i => data[i]?.imageData)); break;
      case 'delete': onBulkDelete(indices); break;
      case 'mute': onBulkMuteToggle(indices); break;
    }
    setDialog(null);
  };

  return (
    <>
      {/* 플로팅 액션 바 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl"
        style={{ backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.4)' }}>

        <span className="text-xs font-bold px-2.5 py-1 rounded-full mr-1" style={{ backgroundColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
          {count}개 선택
        </span>

        <button onClick={() => setDialog('image')} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }} title="이미지 일괄 재생성">
          🖼️ 이미지
        </button>

        <button onClick={() => setDialog('audio')} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }} title="TTS 일괄 재생성">
          🔊 TTS
        </button>

        <button onClick={() => setDialog('animation')} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(6,182,212,0.15)', color: '#06b6d4' }} title="영상 일괄 변환">
          🎬 영상
        </button>

        <button onClick={() => setDialog('mute')} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }} title="일괄 음소거 토글">
          🔇 음소거
        </button>

        <div className="w-px h-6 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />

        <button onClick={() => setDialog('delete')} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }} title="일괄 삭제">
          🗑️ 삭제
        </button>

        <button onClick={onDeselectAll} className="px-2 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
          style={{ color: 'rgba(255,255,255,0.5)' }} title="선택 해제">
          ✕
        </button>
      </div>

      {/* 확인 다이얼로그 */}
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDialog(null)}>
          <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden border shadow-2xl"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}
            onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                {dialog === 'image' && '🖼️ 이미지 일괄 재생성'}
                {dialog === 'audio' && '🔊 TTS 일괄 재생성'}
                {dialog === 'animation' && '🎬 영상 일괄 변환'}
                {dialog === 'delete' && '🗑️ 씬 일괄 삭제'}
                {dialog === 'mute' && '🔇 일괄 음소거 토글'}
              </h3>
            </div>

            {/* 내용 */}
            <div className="px-6 py-4 space-y-3">
              {dialog === 'image' && (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    선택하신 <strong>{count}개 씬</strong>의 이미지를 새로 만들어 드릴게요! ✨
                  </p>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>예상 비용</span>
                    <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{imageCost} 크레딧</span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    💡 기존 이미지는 새 이미지로 교체돼요. 마음에 드는 이미지가 있다면 선택에서 빼주세요!
                  </p>
                </>
              )}

              {dialog === 'audio' && (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    선택하신 <strong>{count}개 씬</strong>의 음성을 새로 녹음해 드릴게요! 🎤
                  </p>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>예상 비용</span>
                    <span className="text-sm font-bold" style={{ color: '#22c55e' }}>{ttsCost} 크레딧</span>
                  </div>
                </>
              )}

              {dialog === 'animation' && (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    선택하신 씬의 이미지를 움직이는 영상으로 변환해 드릴게요! 🎥
                  </p>

                  {noImageScenes.length > 0 && (
                    <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                      <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                        ⚠️ 이미지가 없는 씬이 있어요
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        씬 {noImageScenes.map(i => i + 1).join(', ')}번은 이미지가 없어서 건너뛸게요.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>변환 대상</span>
                    <span className="text-sm font-bold" style={{ color: '#06b6d4' }}>{animatableCount}개 씬</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>예상 비용</span>
                    <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>{animationCost} 크레딧 (73 × {animatableCount})</span>
                  </div>

                  {animationCost > 300 && (
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      💡 비용이 높아요! 꼭 필요한 핵심 씬(훅, 클라이맥스)만 선택하시면 크레딧을 아낄 수 있어요.
                    </p>
                  )}

                  {animatableCount === 0 && (
                    <p className="text-sm font-bold text-center" style={{ color: '#ef4444' }}>
                      변환할 수 있는 씬이 없어요. 이미지를 먼저 생성해주세요! 🖼️
                    </p>
                  )}
                </>
              )}

              {dialog === 'delete' && (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    선택하신 <strong>{count}개 씬</strong>을 삭제할게요.
                  </p>
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    ⚠️ 삭제된 씬은 되돌릴 수 없어요. 신중하게 결정해주세요!
                  </p>
                </>
              )}

              {dialog === 'mute' && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  선택하신 <strong>{count}개 씬</strong>의 음소거 상태를 토글해요. 🔇
                </p>
              )}

              {/* 잔액 표시 */}
              {(dialog === 'image' || dialog === 'audio' || dialog === 'animation') && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>현재 잔액</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>💰 {userCredits.toLocaleString()} 크레딧</span>
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border-default)' }}>
              <button onClick={() => setDialog(null)}
                className="px-5 py-2 rounded-xl text-sm font-bold border transition-all hover:opacity-80"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
                아니요, 취소할게요
              </button>
              <button onClick={handleConfirm}
                disabled={dialog === 'animation' && animatableCount === 0}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: dialog === 'delete' ? '#ef4444' : '#3b82f6' }}>
                {dialog === 'delete' ? '네, 삭제할게요' : '네, 진행할게요!'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
