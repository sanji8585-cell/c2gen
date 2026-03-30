import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateDeepScript } from '../services/geminiService';
import { CONFIG } from '../config';

interface DeepScriptProps {
  isAuthenticated: boolean;
  onShowAuthModal: () => void;
}

const STYLE_OPTIONS = [
  { value: 'auto', label: '자동', icon: '🎯' },
  { value: 'documentary', label: '다큐멘터리', icon: '🎬' },
  { value: 'storytelling', label: '스토리텔링', icon: '📖' },
  { value: 'educational', label: '교육용', icon: '📚' },
  { value: 'viral', label: '바이럴', icon: '🔥' },
] as const;

const DURATION_PRESETS = [
  { seconds: 30, label: '30초' },
  { seconds: 60, label: '1분' },
  { seconds: 180, label: '3분' },
  { seconds: 300, label: '5분' },
  { seconds: 600, label: '10분' },
] as const;

const MIN_DURATION = 20;
const MAX_DURATION = 1200;
const SEC_PER_SCENE = 12;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

function estimateScenes(sec: number): string {
  const min = Math.max(1, Math.floor(sec / (SEC_PER_SCENE + 3)));
  const max = Math.max(min, Math.ceil(sec / (SEC_PER_SCENE - 3)));
  return min === max ? `${min}씬` : `${min}~${max}씬`;
}

const DeepScript: React.FC<DeepScriptProps> = ({ isAuthenticated, onShowAuthModal }) => {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('auto');
  const [durationSec, setDurationSec] = useState(180);
  const [language, setLanguage] = useState<string>(() => {
    try { return localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) || 'ko'; } catch { return 'ko'; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    if (!isAuthenticated) { onShowAuthModal(); return; }
    if (!topic.trim()) return;

    setIsGenerating(true);
    setError('');
    setResult('');

    try {
      const script = await generateDeepScript(topic.trim(), language, style, String(durationSec));
      setResult(script);
    } catch (err: any) {
      setError(err.message || '대본 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      resultRef.current?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sceneCount = result ? result.split(/\n\s*\n/).filter(s => s.trim()).length : 0;
  const charCount = result.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
            DP
          </span>
          심층대본
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
            OPERATOR
          </span>
        </h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          주제를 입력하면 AI가 심층 분석 후 완성도 높은 대본을 생성합니다. 생성된 대본을 복사하여 수동 탭에서 활용하세요.
        </p>
      </div>

      {/* 입력 영역 */}
      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        {/* 주제 입력 */}
        <div className="mb-4">
          <label className="block text-[12px] font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            주제 / 키워드
          </label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="예: 2026년 AI가 바꿀 직업 TOP 10&#10;예: 테슬라 주가 전망과 투자 전략&#10;예: 초보자를 위한 커피 홈브루잉 가이드"
            className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-none transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              minHeight: '80px',
            }}
            disabled={isGenerating}
          />
          <div className="text-right text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {topic.length}자
          </div>
        </div>

        {/* 옵션 행 */}
        <div className="flex flex-wrap gap-3 mb-4">
          {/* 스타일 */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>스타일</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  disabled={isGenerating}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    style === opt.value ? 'ring-1 ring-purple-500' : ''
                  }`}
                  style={{
                    backgroundColor: style === opt.value ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                    color: style === opt.value ? '#a855f7' : 'var(--text-secondary)',
                    border: `1px solid ${style === opt.value ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 영상 길이 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              영상 길이
              <span className="ml-2 font-normal" style={{ color: 'var(--text-secondary)' }}>
                {formatDuration(durationSec)} · 약 {estimateScenes(durationSec)}
              </span>
            </label>
            {/* 슬라이더 */}
            <input
              type="range"
              min={MIN_DURATION}
              max={MAX_DURATION}
              step={5}
              value={durationSec}
              onChange={e => setDurationSec(Number(e.target.value))}
              disabled={isGenerating}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #a855f7 ${((durationSec - MIN_DURATION) / (MAX_DURATION - MIN_DURATION)) * 100}%, var(--border-subtle) 0%)`,
                accentColor: '#a855f7',
              }}
            />
            {/* 프리셋 + 직접 입력 */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.seconds}
                  onClick={() => setDurationSec(p.seconds)}
                  disabled={isGenerating}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{
                    backgroundColor: durationSec === p.seconds ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                    color: durationSec === p.seconds ? '#a855f7' : 'var(--text-muted)',
                    border: `1px solid ${durationSec === p.seconds ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="number"
                min={MIN_DURATION}
                max={MAX_DURATION}
                value={durationSec}
                onChange={e => {
                  const v = Math.max(MIN_DURATION, Math.min(MAX_DURATION, Number(e.target.value) || MIN_DURATION));
                  setDurationSec(v);
                }}
                disabled={isGenerating}
                className="w-14 px-1.5 py-0.5 rounded text-[10px] text-center"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>초</span>
            </div>
          </div>

          {/* 언어 */}
          <div className="min-w-[80px]">
            <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>언어</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              disabled={isGenerating}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !topic.trim()}
          className="w-full py-2.5 rounded-lg text-[13px] font-bold transition-all disabled:opacity-40"
          style={{
            background: isGenerating
              ? 'var(--bg-elevated)'
              : 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: isGenerating ? 'var(--text-muted)' : '#ffffff',
          }}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
              </svg>
              AI가 심층 대본을 작성 중입니다...
            </span>
          ) : (
            '심층대본 생성'
          )}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg px-4 py-3 mb-4 text-[12px] font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* 결과 영역 */}
      {result && (
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          {/* 결과 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>생성 결과</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                {sceneCount}씬 / {charCount.toLocaleString()}자
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-110"
              style={{
                backgroundColor: copied ? 'rgba(16,185,129,0.15)' : 'rgba(168,85,247,0.15)',
                color: copied ? '#10b981' : '#a855f7',
                border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(168,85,247,0.3)'}`,
              }}
            >
              {copied ? (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> 복사됨</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> 복사하기</>
              )}
            </button>
          </div>

          {/* 대본 내용 */}
          <textarea
            ref={resultRef}
            value={result}
            onChange={e => setResult(e.target.value)}
            className="w-full px-4 py-3 text-[13px] leading-relaxed resize-none focus:outline-none"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              minHeight: '400px',
              border: 'none',
            }}
          />

          {/* 안내 */}
          <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
            위 대본을 복사한 후, <strong style={{ color: 'var(--text-secondary)' }}>스토리보드 &gt; 수동</strong> 탭에 붙여넣어 이미지/음성을 생성하세요.
            대본을 직접 수정할 수도 있습니다.
          </div>
        </div>
      )}

      {/* 빈 상태 — 결과 없을 때 가이드 */}
      {!result && !isGenerating && (
        <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: 'rgba(168,85,247,0.1)' }}>
            DP
          </div>
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            주제를 입력하고 심층대본을 생성하세요
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Gemini 2.5 Pro가 깊이 있는 리서치 기반 대본을 작성합니다
          </p>
        </div>
      )}
    </div>
  );
};

export default DeepScript;
