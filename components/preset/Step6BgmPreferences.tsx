import React, { useState } from 'react';
import type { BrandPreset, BgmPreferences } from '../../types';
import { BGM_MOODS } from '../../config';
import type { BgmMood } from '../../config';
import { generateBrandBgm } from '../../services/elevenLabsService';

interface Step6Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

const GENRES = [
  { id: 'acoustic', label: '어쿠스틱' },
  { id: 'electronic', label: '일렉트로닉' },
  { id: 'orchestra', label: '오케스트라' },
  { id: 'piano', label: '피아노' },
  { id: 'pop', label: '팝' },
  { id: 'jazz', label: '재즈' },
  { id: 'ambient', label: '앰비언트' },
  { id: 'hiphop', label: '힙합' },
] as const;

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const moodKeys = Object.keys(BGM_MOODS) as BgmMood[];

export default function Step6BgmPreferences({ data, onUpdate, presetId: _presetId }: Step6Props) {
  const prefs: BgmPreferences = data.bgm_preferences || {
    genre: '',
    mood: '',
    tempo_range: { min: 80, max: 120 },
    custom_prompt: '',
  };
  const [bgmSamples, setBgmSamples] = useState<Array<{ audio: string; prompt: string }>>([]);
  const [bgmLoading, setBgmLoading] = useState(false);
  const [bgmError, setBgmError] = useState<string | null>(null);
  const [selectedBgmIndex, setSelectedBgmIndex] = useState<number | null>(null);

  const updatePrefs = (updates: Partial<BgmPreferences>) => {
    onUpdate({ bgm_preferences: { ...prefs, ...updates } });
  };

  const handleSampleGenerate = async () => {
    setBgmLoading(true);
    setBgmError(null);
    try {
      const result = await generateBrandBgm(prefs, 30000);
      const audioData = (result as any).audio_base64 || (result as any).audioBase64;
      if (!audioData) throw new Error((result as any).error || 'BGM 오디오 데이터를 받지 못했습니다.');
      // Build prompt description for display
      const promptDesc = [prefs.genre, prefs.mood, `${Math.round((prefs.tempo_range.min + prefs.tempo_range.max) / 2)} BPM`, prefs.custom_prompt].filter(Boolean).join(', ');
      setBgmSamples((prev) => [...prev, { audio: audioData, prompt: promptDesc }]);
    } catch (err) {
      setBgmError(err instanceof Error ? err.message : 'BGM 생성에 실패했습니다.');
    } finally {
      setBgmLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          BGM 설정
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          브랜드에 어울리는 배경음악 스타일을 선택해주세요.
        </p>
      </div>

      {/* Genre Selection */}
      <div>
        <label style={labelStyle}>장르</label>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => {
            const selected = prefs.genre === g.id;
            return (
              <button
                key={g.id}
                onClick={() => updatePrefs({ genre: g.id })}
                className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105"
                style={{
                  background: selected
                    ? 'linear-gradient(135deg, #0891b2, #2563eb)'
                    : 'var(--bg-surface)',
                  color: selected ? '#fff' : 'var(--text-secondary)',
                  border: selected ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mood Selection */}
      <div>
        <label style={labelStyle}>분위기</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {moodKeys.map((key) => {
            const mood = BGM_MOODS[key];
            const selected = prefs.mood === key;
            return (
              <button
                key={key}
                onClick={() => updatePrefs({ mood: key })}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: selected ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  border: selected ? '2px solid #0891b2' : '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  boxShadow: selected ? '0 0 0 1px rgba(8,145,178,0.2)' : 'none',
                }}
              >
                <span className="text-lg">{mood.emoji}</span>
                <span>{mood.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tempo Range */}
      <div>
        <label style={labelStyle}>템포 범위 (BPM)</label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[12px] mb-1 block" style={{ color: 'var(--text-muted)' }}>최소</label>
            <input
              type="number"
              min={40}
              max={200}
              value={prefs.tempo_range.min}
              onChange={(e) => {
                updatePrefs({ tempo_range: { ...prefs.tempo_range, min: Number(e.target.value) } });
              }}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                const val = Math.max(40, Math.min(prefs.tempo_range.max, Number(e.target.value) || 40));
                updatePrefs({ tempo_range: { ...prefs.tempo_range, min: val } });
              }}
            />
          </div>
          <span className="mt-5 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>~</span>
          <div className="flex-1">
            <label className="text-[12px] mb-1 block" style={{ color: 'var(--text-muted)' }}>최대</label>
            <input
              type="number"
              min={40}
              max={200}
              value={prefs.tempo_range.max}
              onChange={(e) => {
                updatePrefs({ tempo_range: { ...prefs.tempo_range, max: Number(e.target.value) } });
              }}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                const val = Math.max(prefs.tempo_range.min, Math.min(200, Number(e.target.value) || 200));
                updatePrefs({ tempo_range: { ...prefs.tempo_range, max: val } });
              }}
            />
          </div>
        </div>
        <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #0891b2, #2563eb)',
              marginLeft: `${((prefs.tempo_range.min - 40) / 160) * 100}%`,
              width: `${((prefs.tempo_range.max - prefs.tempo_range.min) / 160) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>40</span>
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>200</span>
        </div>
      </div>

      {/* Custom Prompt */}
      <div>
        <label style={labelStyle}>추가 지시사항</label>
        <textarea
          rows={3}
          value={prefs.custom_prompt || ''}
          onChange={(e) => updatePrefs({ custom_prompt: e.target.value })}
          placeholder="예: 따뜻한 어쿠스틱 기타, 잔잔한 피아노"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
        />
      </div>

      {/* Sample BGM Preview */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <label style={labelStyle}>샘플 BGM 미리듣기</label>
        <button
          onClick={handleSampleGenerate}
          disabled={bgmLoading || bgmSamples.length >= 3}
          className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 mb-3"
          style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}
        >
          {bgmLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              생성 중...
            </span>
          ) : bgmSamples.length >= 3 ? (
            '최대 3개 샘플 생성 완료'
          ) : (
            `샘플 BGM 생성 (50 크레딧) — ${bgmSamples.length}/3`
          )}
        </button>

        {bgmError && (
          <div
            className="mb-3 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {bgmError}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {bgmSamples.length === 0 && !bgmLoading && (
            <div
              className="flex items-center justify-center py-6 rounded-lg"
              style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                위 버튼을 눌러 BGM 샘플을 생성해보세요.
              </p>
            </div>
          )}

          {bgmLoading && bgmSamples.length === 0 && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <span className="inline-block w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>BGM 생성 중...</p>
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>30초 분량 생성에 시간이 걸릴 수 있습니다.</p>
              </div>
            </div>
          )}

          {bgmSamples.map((sample, idx) => {
            const isSelected = selectedBgmIndex === idx;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-lg transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  border: isSelected ? '2px solid #0891b2' : '1px solid var(--border-subtle)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(8,145,178,0.2)' : 'none',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    샘플 {idx + 1}
                  </p>
                  <audio
                    controls
                    src={`data:audio/mpeg;base64,${sample.audio}`}
                    className="w-full"
                    style={{ height: 32 }}
                    preload="none"
                  />
                </div>
                <button
                  onClick={() => setSelectedBgmIndex(idx)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium shrink-0 transition-all"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, #0891b2, #2563eb)'
                      : 'var(--bg-elevated)',
                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                    border: isSelected ? 'none' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  {isSelected ? '선택됨' : '이 BGM 사용'}
                </button>
              </div>
            );
          })}

          {bgmLoading && bgmSamples.length > 0 && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)' }}
            >
              <span className="inline-block w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>추가 샘플 생성 중...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
