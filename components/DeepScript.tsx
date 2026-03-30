import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateDeepScript } from '../services/geminiService';
import { CONFIG } from '../config';

interface DeepScriptProps {
  isAuthenticated: boolean;
  onShowAuthModal: () => void;
}

const STYLE_OPTIONS = [
  {
    value: 'auto', label: '자동', icon: '🎯', summary: 'AI 자동 판단',
    description: '주제를 분석하여 가장 적합한 스타일을 AI가 자동으로 선택합니다.',
    examples: ['어떤 주제든 자동으로 최적화', '스타일 고민 없이 빠르게 시작'],
  },
  {
    value: 'documentary', label: '다큐멘터리', icon: '🎬', summary: '팩트 중심',
    description: '넷플릭스 다큐 PD처럼, 팩트와 데이터 중심으로 객관적이고 신뢰감 있는 대본을 작성합니다.',
    examples: ['반도체 전쟁의 숨겨진 진실', '한국 출산율 0.6명의 경제적 충격', 'AI가 바꿀 미래 직업 지도'],
  },
  {
    value: 'storytelling', label: '스토리텔링', icon: '📖', summary: '감성 서사',
    description: '100만 구독자 스토리텔러처럼, 1인칭 경험담과 감정 고저로 시청자를 몰입시킵니다.',
    examples: ['부모님이 알려주지 않은 인생 교훈', '30대에 깨달은 돈의 진짜 의미', '그날 이후 삶이 완전히 바뀌었다'],
  },
  {
    value: 'educational', label: '교육용', icon: '📚', summary: '단계 설명',
    description: 'TED 강연 연출가처럼, 복잡한 개념을 비유와 단계적 설명으로 쉽게 풀어냅니다.',
    examples: ['초보자를 위한 커피 홈브루잉 가이드', '블록체인을 5살도 이해하게 설명하기', '주식 차트 읽는 법 완전 정복'],
  },
  {
    value: 'viral', label: '바이럴', icon: '🔥', summary: '훅+반전',
    description: 'MrBeast 스타일 콘텐츠 디렉터. 골든 3초 훅과 패턴 인터럽트, 도파민 루프를 설계합니다.',
    examples: ['이걸 모르면 당신은 이미 돈을 잃고 있습니다', '절대 먹으면 안 되는 건강식품 3가지', '1분 만에 인생이 바뀌는 습관'],
  },
  {
    value: 'investigative', label: '탐사/추적', icon: '🔍', summary: '단서→진실',
    description: '탐사 저널리스트처럼, 단서를 하나씩 공개하며 진실에 접근하는 긴장감 있는 대본을 작성합니다.',
    examples: ['삼성전자 반도체 적자의 숨겨진 이유', '사라진 1조원을 추적하다', '가짜 건강식품의 진실을 파헤치다'],
  },
  {
    value: 'countdown', label: '랭킹', icon: '🏆', summary: 'TOP N',
    description: '에스컬레이션 전문가. 순위가 올라갈수록 강도를 높여 1위에서 폭발시키는 구성입니다.',
    examples: ['역대 최악의 기업 실수 TOP 10', '한국에서 가장 연봉 높은 직업 5선', '세계에서 가장 위험한 음식 랭킹'],
  },
  {
    value: 'comparison', label: '비교/대결', icon: '⚔️', summary: 'A vs B',
    description: '공정한 심판관처럼, A와 B를 항목별로 대결시키고 예상을 뒤집는 판정을 내립니다.',
    examples: ['아이폰 vs 갤럭시 — 2026년 최종 승자', '한국 vs 일본 직장문화 비교', '넷플릭스 vs 유튜브 프리미엄'],
  },
  {
    value: 'transformation', label: '변화/성장', icon: '🦋', summary: '비포애프터',
    description: '비포애프터 연출가. 최악의 상태에서 시작해 반전의 성공을 보여주는 서사를 만듭니다.',
    examples: ['빚 2억에서 자산 10억까지', '3개월 만에 체지방 30%→15%', '영어 왕초보가 통역사가 된 과정'],
  },
  {
    value: 'horror_warning', label: '공포/경고', icon: '⚠️', summary: '위기 경보',
    description: '위기 경보 전문가. 긴장을 극대화하고 충격적 사실로 경각심을 유발합니다.',
    examples: ['당신의 개인정보가 이미 팔리고 있다', '절대 무시하면 안 되는 몸의 신호 5가지', '이 투자 사기에 10만 명이 당했다'],
  },
  {
    value: 'humor', label: '유머', icon: '😂', summary: '펀치라인',
    description: '코미디 작가처럼, 설정을 쌓고 기대를 배반하는 펀치라인으로 웃음을 설계합니다.',
    examples: ['한국 직장인의 하루를 외국인에게 설명하면', '부모님 세대 vs MZ세대 연애 차이', 'AI한테 나의 인생 상담을 맡겨봤다'],
  },
  {
    value: 'conspiracy', label: '음모/떡밥', icon: '🕳️', summary: '열린 결말',
    description: '미완결의 대가. 증거를 나열하되 결론은 시청자에게 던지는 열린 구조로 댓글을 폭발시킵니다.',
    examples: ['아무도 말하지 않는 대기업의 비밀', '이 사건은 왜 뉴스에 안 나왔을까', '우리가 모르는 역사의 숨겨진 진실'],
  },
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
  const [mode, setMode] = useState<'fast' | 'deep'>('deep');
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
      const script = await generateDeepScript(topic.trim(), language, style, String(durationSec), mode);
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

        {/* 스타일 그리드 */}
        <div className="mb-4">
          <label className="block text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted)' }}>스타일</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
            {STYLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStyle(opt.value)}
                disabled={isGenerating}
                className={`flex flex-col items-center px-2 py-2 rounded-lg text-center transition-all ${
                  style === opt.value ? 'ring-1 ring-purple-500' : ''
                }`}
                style={{
                  backgroundColor: style === opt.value ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                  color: style === opt.value ? '#a855f7' : 'var(--text-secondary)',
                  border: `1px solid ${style === opt.value ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
                }}
              >
                <span className="text-base">{opt.icon}</span>
                <span className="text-[11px] font-bold mt-0.5 leading-tight">{opt.label}</span>
                <span className="text-[9px] mt-0.5 leading-tight" style={{ color: style === opt.value ? '#c084fc' : 'var(--text-muted)' }}>
                  {opt.summary}
                </span>
              </button>
            ))}
          </div>

          {/* 선택된 스타일 설명 카드 */}
          {(() => {
            const selected = STYLE_OPTIONS.find(o => o.value === style);
            if (!selected || selected.value === 'auto') return null;
            return (
              <div className="mt-2 rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {selected.icon} {selected.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.examples.map((ex, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:brightness-110 transition-all"
                      style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}
                      onClick={() => !isGenerating && setTopic(ex)}
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 옵션 행 */}
        <div className="flex flex-wrap gap-3 mb-4">

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

          {/* 생성 모드 */}
          <div className="min-w-[100px]">
            <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>생성 모드</label>
            <div className="flex gap-1.5">
              {([
                { value: 'fast' as const, label: '빠른 생성', desc: '1회 생성' },
                { value: 'deep' as const, label: '심층 생성', desc: '생성→감사→개선' },
              ]).map(m => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  disabled={isGenerating}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{
                    backgroundColor: mode === m.value ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                    color: mode === m.value ? '#a855f7' : 'var(--text-secondary)',
                    border: `1px solid ${mode === m.value ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
                  }}
                  title={m.desc}
                >
                  {m.label}
                </button>
              ))}
            </div>
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
