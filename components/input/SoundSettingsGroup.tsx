import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoiceSettings, { VoiceSettingsHandle } from './VoiceSettings';
import { Language, BGM_MOODS, BGM_LIBRARY, BgmMood } from '../../config';

interface SoundSettingsGroupProps {
  voiceSettingsRef: React.RefObject<VoiceSettingsHandle | null>;
  isDisabled: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  bgmData: string | null;
  onBgmDataChange: (data: string | null) => void;
  bgmVolume: number;
  onBgmVolumeChange: (v: number) => void;
  bgmDuckingEnabled: boolean;
  onBgmDuckingToggle: (v: boolean) => void;
  bgmDuckingAmount: number;
  onBgmDuckingAmountChange: (v: number) => void;
}

const SoundSettingsGroup: React.FC<SoundSettingsGroupProps> = ({
  voiceSettingsRef,
  isDisabled,
  language,
  onLanguageChange,
  bgmData,
  onBgmDataChange,
  bgmVolume,
  onBgmVolumeChange,
  bgmDuckingEnabled,
  onBgmDuckingToggle,
  bgmDuckingAmount,
  onBgmDuckingAmountChange,
}) => {
  const [autoBgm, setAutoBgm] = useState(() =>
    localStorage.getItem('tubegen_auto_bgm') === 'true'
  );
  const [preferredMood, setPreferredMood] = useState<BgmMood | 'auto'>(() =>
    (localStorage.getItem('tubegen_bgm_mood') as BgmMood) || 'auto'
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [selectedLibraryTrackId, setSelectedLibraryTrackId] = useState<string | null>(null);
  const [bgmDuration, setBgmDuration] = useState<30 | 60>(() => {
    const saved = localStorage.getItem('tubegen_bgm_duration');
    return saved === '60' ? 60 : 30;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem('tubegen_auto_bgm', autoBgm ? 'true' : 'false');
  }, [autoBgm]);

  useEffect(() => {
    localStorage.setItem('tubegen_bgm_mood', preferredMood);
  }, [preferredMood]);

  useEffect(() => {
    localStorage.setItem('tubegen_bgm_duration', String(bgmDuration));
  }, [bgmDuration]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      onBgmDataChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBgm = () => {
    onBgmDataChange(null);
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 3단계 토글: 1) 선택+재생 → 2) 정지(선택유지) → 3) 선택해제
  const handleLibraryTrackClick = useCallback((trackId: string, url: string) => {
    if (selectedLibraryTrackId === trackId) {
      // 재생중 → 정지 (선택 유지)
      if (previewTrackId === trackId && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setPreviewTrackId(null);
        return;
      }
      // 정지 상태 → 선택 해제
      setSelectedLibraryTrackId(null);
      onBgmDataChange(null);
      return;
    }
    // 새 트랙 선택 + 재생 → 자동 AI BGM 끄기
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSelectedLibraryTrackId(trackId);
    setUploadedFileName(null);
    if (autoBgm) setAutoBgm(false);
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => onBgmDataChange(reader.result as string);
        reader.readAsDataURL(blob);
      });
    const audio = new Audio(url);
    audio.volume = bgmVolume;
    audio.onended = () => setPreviewTrackId(null);
    audio.play();
    audioRef.current = audio;
    setPreviewTrackId(trackId);
  }, [selectedLibraryTrackId, previewTrackId, bgmVolume, onBgmDataChange, autoBgm]);

  const previewUploadedBgm = useCallback(() => {
    if (!bgmData) return;
    if (previewTrackId === '__uploaded__' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPreviewTrackId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(bgmData);
    audio.volume = bgmVolume;
    audio.onended = () => setPreviewTrackId(null);
    audio.play();
    audioRef.current = audio;
    setPreviewTrackId('__uploaded__');
  }, [bgmData, previewTrackId, bgmVolume]);

  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    color: 'var(--text-muted)',
    marginBottom: 12,
  };

  // 설명 텍스트 — text-secondary (muted보다 밝음)
  const descText: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  };

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    position: 'relative',
    width: 40,
    height: 22,
    borderRadius: 11,
    border: 'none',
    background: active ? 'rgba(96,165,250,0.85)' : 'var(--bg-hover)',
    cursor: isDisabled ? 'default' : 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleThumb = (active: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 3,
    left: active ? 21 : 3,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  const moodChip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? 'rgba(96,165,250,0.4)' : 'var(--border-subtle)',
    background: active ? 'rgba(96,165,250,0.15)' : 'var(--bg-elevated)',
    color: active ? '#60a5fa' : 'var(--text-secondary)',
    cursor: isDisabled ? 'default' : 'pointer',
    transition: 'all 0.15s',
  });

  const sliderTrack: React.CSSProperties = {
    flex: 1,
    height: 4,
    borderRadius: 2,
    appearance: 'none',
    background: 'var(--bg-hover)',
    outline: 'none',
    cursor: isDisabled ? 'default' : 'pointer',
  };

  const cardBox: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── 나레이션 음성 ── */}
      <div>
        <div style={sectionLabel}>🎤 나레이션 음성</div>
        <VoiceSettings
          ref={voiceSettingsRef}
          isDisabled={isDisabled}
          language={language}
          onLanguageChange={onLanguageChange}
        />
      </div>

      {/* ── BGM 설정 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={sectionLabel}>🎵 BGM</div>

        {/* 자동 AI BGM 토글 */}
        <div style={{ ...cardBox, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                자동 AI BGM
              </div>
              <div style={{ ...descText, marginTop: 2 }}>
                AI가 대본 분위기를 분석해 BGM 자동 생성
              </div>
            </div>
            <button type="button" onClick={() => {
              const next = !autoBgm;
              setAutoBgm(next);
              if (next && selectedLibraryTrackId) {
                // 자동 BGM 켜면 라이브러리 선택 해제
                if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                setPreviewTrackId(null);
                setSelectedLibraryTrackId(null);
                onBgmDataChange(null);
              }
            }} disabled={isDisabled} style={toggleBtn(autoBgm)}>
              <div style={toggleThumb(autoBgm)} />
            </button>
          </div>

          {autoBgm && (
            <>
              {/* 안내 문구 */}
              <div style={{
                fontSize: 11,
                color: '#60a5fa',
                fontWeight: 500,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.15)',
                lineHeight: 1.5,
              }}>
                AI BGM은 매번 새롭게 생성되어 독창성이 보장됩니다
              </div>

              {/* 길이 선택 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>길이</span>
                {([30, 60] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setBgmDuration(sec)}
                    disabled={isDisabled}
                    style={moodChip(bgmDuration === sec)}
                  >
                    {sec}초
                  </button>
                ))}
              </div>

              {/* 선호 분위기 칩 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" onClick={() => setPreferredMood('auto')} disabled={isDisabled} style={moodChip(preferredMood === 'auto')}>
                  🤖 AI 자동
                </button>
                {(Object.entries(BGM_MOODS) as [BgmMood, { label: string; emoji: string }][]).map(
                  ([mood, { label, emoji }]) => (
                    <button key={mood} type="button" onClick={() => setPreferredMood(mood)} disabled={isDisabled} style={moodChip(preferredMood === mood)}>
                      {emoji} {label}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* BGM 라이브러리 */}
        <div style={{ ...cardBox, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            BGM 라이브러리
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {BGM_LIBRARY.map((track) => {
              const isSelected = selectedLibraryTrackId === track.id;
              const isPlaying = previewTrackId === track.id;
              const moodInfo = BGM_MOODS[track.mood];
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleLibraryTrackClick(track.id, track.url)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(96,165,250,0.5)' : 'var(--border-subtle)',
                    background: isSelected ? 'rgba(96,165,250,0.15)' : 'var(--bg-surface)',
                    color: isSelected ? '#60a5fa' : 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10 }}>{isPlaying ? '⏸' : isSelected ? '✓' : '▶'}</span>
                  <span>{moodInfo?.emoji} {track.name}</span>
                </button>
              );
            })}
          </div>
          <div style={descText}>
            1클릭: 선택+미리듣기 → 2클릭: 정지 → 3클릭: 선택 해제
          </div>
        </div>

        {/* 직접 업로드 */}
        <div style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            disabled={isDisabled}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              cursor: isDisabled ? 'default' : 'pointer',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            🎧 파일 업로드
          </button>
          {bgmData && uploadedFileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={previewUploadedBgm}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: previewTrackId === '__uploaded__' ? 'rgba(96,165,250,0.2)' : 'var(--bg-hover)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: previewTrackId === '__uploaded__' ? '#60a5fa' : 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              >
                {previewTrackId === '__uploaded__' ? '⏸' : '▶'}
              </button>
              <span style={{
                fontSize: 12,
                color: '#60a5fa',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {uploadedFileName}
              </span>
              <button
                type="button"
                onClick={handleRemoveBgm}
                style={{
                  padding: '2px 6px',
                  fontSize: 11,
                  color: '#f87171',
                  background: 'rgba(239,68,68,0.15)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <span style={descText}>
              MP3, WAV 등 음악 파일을 직접 업로드
            </span>
          )}
        </div>

        {/* 볼륨 & 덕킹 */}
        <div style={{ ...cardBox, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              🔊 볼륨
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bgmVolume * 100)}
              onChange={(e) => onBgmVolumeChange(Number(e.target.value) / 100)}
              disabled={isDisabled}
              style={sliderTrack}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', minWidth: 32, textAlign: 'right' }}>
              {Math.round(bgmVolume * 100)}%
            </span>
          </div>

          {/* 덕킹 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                🔉 오토 덕킹
              </span>
              <span style={descText}>
                나레이션 구간 BGM 자동 감소
              </span>
            </div>
            <button type="button" onClick={() => onBgmDuckingToggle(!bgmDuckingEnabled)} disabled={isDisabled} style={toggleBtn(bgmDuckingEnabled)}>
              <div style={toggleThumb(bgmDuckingEnabled)} />
            </button>
          </div>

          {/* 덕킹 양 */}
          {bgmDuckingEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                감소량
              </span>
              <input
                type="range"
                min={10}
                max={90}
                value={Math.round(bgmDuckingAmount * 100)}
                onChange={(e) => onBgmDuckingAmountChange(Number(e.target.value) / 100)}
                disabled={isDisabled}
                style={sliderTrack}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', minWidth: 32, textAlign: 'right' }}>
                {Math.round(bgmDuckingAmount * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SoundSettingsGroup;
