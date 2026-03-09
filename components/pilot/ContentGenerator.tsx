import React, { useState } from 'react';
import type { BrandPreset, PlatformVariant } from '../../types';
import type { Language } from '../../config';
import type { PipelineContext, PipelineProgress } from '../../services/pilot/types';
import { runContentPipeline } from '../../services/pilot/contentPipeline';
import { listCharacters } from '../../services/characterService';

// ── Props ──

interface ContentGeneratorProps {
  presets: BrandPreset[];
  onComplete: () => void;
}

// ── Constants ──

const PLATFORM_OPTIONS: { id: PlatformVariant; label: string }[] = [
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube_long', label: 'YouTube Long' },
];

const LANGUAGE_OPTIONS: { id: Language; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
];

const STEP_LABELS: Record<string, string> = {
  script: '스크립트 생성',
  images: '이미지 생성',
  tts: 'TTS 생성',
  bgm: 'BGM 생성',
  save: '저장',
};

const STEP_ORDER = ['script', 'images', 'tts', 'bgm', 'save'];

// ── Styles ──

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-surface)',
  padding: '24px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
};

// ── Component ──

export default function ContentGenerator({ presets, onComplete }: ContentGeneratorProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<PlatformVariant>('youtube_shorts');
  const [language, setLanguage] = useState<Language>('ko');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Derived ──

  const selectedPreset = presets.find((p) => p.id === selectedPresetId);
  const canGenerate = !!selectedPreset && topic.trim().length > 0 && !isGenerating;

  // ── Compute progress percentage ──

  const getProgressPercent = (): number => {
    if (!progress) return 0;
    const stepIdx = STEP_ORDER.indexOf(progress.step);
    if (stepIdx === -1) return 0;
    const stepWeight = 100 / STEP_ORDER.length;
    const stepProgress = progress.total > 0 ? progress.current / progress.total : 0;
    return Math.round(stepIdx * stepWeight + stepProgress * stepWeight);
  };

  // ── Get step status icon ──

  const getStepIcon = (step: string): string => {
    if (!progress) return '';
    const currentIdx = STEP_ORDER.indexOf(progress.step);
    const stepIdx = STEP_ORDER.indexOf(step);
    if (stepIdx < currentIdx) return '\u2705'; // completed
    if (stepIdx === currentIdx) return '\uD83D\uDD04'; // in progress
    return '\u23F3'; // waiting
  };

  // ── Get step status text ──

  const getStepStatus = (step: string): string => {
    if (!progress) return '';
    const currentIdx = STEP_ORDER.indexOf(progress.step);
    const stepIdx = STEP_ORDER.indexOf(step);
    if (stepIdx < currentIdx) return '완료';
    if (stepIdx === currentIdx) {
      if (progress.total > 0) return `${progress.current}/${progress.total}`;
      return progress.message || '진행중...';
    }
    return '대기';
  };

  // ── Generate handler ──

  const handleGenerate = async () => {
    if (!selectedPreset || !topic.trim()) return;

    setIsGenerating(true);
    setError(null);
    setProgress(null);

    try {
      const characters = await listCharacters(selectedPreset.id);

      const ctx: PipelineContext = {
        topic: topic.trim(),
        preset: selectedPreset,
        characters,
        platform,
        language,
        onProgress: (p) => setProgress(p),
      };

      const result = await runContentPipeline(ctx);

      setIsGenerating(false);

      if (result.success) {
        onComplete();
      } else {
        setError(result.error || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // ── Render ──

  const progressPercent = getProgressPercent();

  return (
    <div>
      {/* Header */}
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        콘텐츠 생성
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        브랜드 프리셋 기반으로 스크립트, 이미지, 나레이션, BGM을 자동 생성합니다.
      </p>

      {/* Input Card */}
      <div style={cardStyle} className="mb-4">
        {/* Preset selector */}
        <div className="mb-4">
          <label style={labelStyle}>브랜드 프리셋</label>
          {presets.length > 0 ? (
            <select
              value={selectedPresetId || ''}
              onChange={(e) => setSelectedPresetId(e.target.value || null)}
              style={selectStyle}
              disabled={isGenerating}
            >
              <option value="">프리셋을 선택하세요</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.description ? ` — ${p.description}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="text-sm py-3 px-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              프리셋이 없습니다. 먼저 브랜드 프리셋을 생성해주세요.
            </div>
          )}
        </div>

        {/* Topic */}
        <div className="mb-4">
          <label style={labelStyle}>주제</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: AI 투자 방법, 다이어트 팁, 주식 시장 전망..."
            style={inputStyle}
            disabled={isGenerating}
          />
        </div>

        {/* Platform + Language row */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label style={labelStyle}>플랫폼</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformVariant)}
              style={selectStyle}
              disabled={isGenerating}
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label style={labelStyle}>언어</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              style={selectStyle}
              disabled={isGenerating}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all"
          style={{
            background: canGenerate
              ? 'linear-gradient(135deg, #0891b2, #2563eb)'
              : 'var(--bg-elevated)',
            color: canGenerate ? '#fff' : 'var(--text-muted)',
            cursor: canGenerate ? 'pointer' : 'not-allowed',
            opacity: canGenerate ? 1 : 0.6,
            border: 'none',
          }}
        >
          {isGenerating ? '생성 중...' : '콘텐츠 생성'}
        </button>
      </div>

      {/* Progress Card */}
      {isGenerating && progress && (
        <div style={cardStyle} className="mb-4">
          <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            생성 진행 상황
          </div>

          <div className="space-y-2 mb-4">
            {STEP_ORDER.map((step) => {
              const icon = getStepIcon(step);
              const status = getStepStatus(step);
              const isCurrent = progress.step === step;
              return (
                <div
                  key={step}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{
                    backgroundColor: isCurrent ? 'rgba(8, 145, 178, 0.08)' : 'transparent',
                    border: isCurrent ? '1px solid rgba(8, 145, 178, 0.2)' : '1px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {STEP_LABELS[step] || step}
                    </span>
                    {isCurrent && progress.message && (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {progress.message}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {status}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 6, backgroundColor: 'var(--bg-elevated)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: 'linear-gradient(135deg, #0891b2, #2563eb)',
              }}
            />
          </div>
          <div className="text-right mt-1">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {progressPercent}%
            </span>
          </div>
        </div>
      )}

      {/* Error Card */}
      {error && !isGenerating && (
        <div
          style={{
            ...cardStyle,
            borderColor: 'rgba(239, 68, 68, 0.3)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
          }}
          className="mb-4"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0">&#x274C;</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>
                생성 실패
              </div>
              <div className="text-[13px] break-words" style={{ color: 'var(--text-secondary)' }}>
                {error}
              </div>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, #0891b2, #2563eb)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
