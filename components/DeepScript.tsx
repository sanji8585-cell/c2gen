import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIG } from '../config';

// ── SSE 진행 상태 타입 ──
interface StepProgress {
  step: number;
  total: number;
  status: 'working' | 'done' | 'complete';
  label?: string;
  icon?: string;
  detail?: string;
  preview?: string;
  charCount?: number;
  auditPreview?: string;
  improvements?: number;
  script?: string;
  error?: string;
  analysis?: ScriptAnalysis;
}

interface CharacterSuggestion {
  role: string;
  gender: 'male' | 'female';
  ageRange: string;
  personality: string;
  visualDescription: string;
  voiceTone: string;
}

interface ScriptAnalysis {
  needsCharacter: boolean;
  characters: CharacterSuggestion[];
  narrationStyle: string;
  overallMood: string;
  recommendedVoiceGender: string;
  recommendedVoiceAge: string;
  recommendedStyles: string[];
}

// ── 화풍 메타데이터 (config.ts의 GEMINI_STYLE_CATEGORIES에서 추출) ──
const STYLE_META: Record<string, { name: string; description: string }> = {
  'gemini-crayon': { name: '크레용', description: '따뜻한 크레용 질감, 손그림 느낌' },
  'gemini-watercolor': { name: '수채화', description: '부드러운 번짐, 몽환적 분위기' },
  'gemini-minimal-flat': { name: '미니멀 플랫', description: '깔끔한 도형, 모던 디자인풍' },
  'gemini-korea-cartoon': { name: '한국 경제 카툰', description: '웹툰풍, 굵은 외곽선' },
  'gemini-infographic': { name: '인포그래픽', description: '차트/데이터 시각화' },
  'gemini-retro-news': { name: '레트로 뉴스', description: '80-90년대 복고풍' },
  'gemini-isometric': { name: '3D 아이소메트릭', description: '미니어처 블록, 입체 도시' },
};

interface DeepScriptProps {
  isAuthenticated: boolean;
  onShowAuthModal: () => void;
  onStartStoryboard?: (script: string, styleId: string, analysis: ScriptAnalysis | null) => void;
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

const DeepScript: React.FC<DeepScriptProps> = ({ isAuthenticated, onShowAuthModal, onStartStoryboard }) => {
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
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [currentStep, setCurrentStep] = useState<StepProgress | null>(null);
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');
  const [savedList, setSavedList] = useState<Array<{ id: string; topic: string; style: string; duration_sec: number; mode: string; scene_count: number; char_count: number; created_at: string }>>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── API 헬퍼 ──
  const apiHeaders = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('c2gen_session_token');
    if (token) h['x-session-token'] = token;
    return h;
  }, []);

  const handleSave = useCallback(async () => {
    if (!result || saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/deep-script-save', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({
          action: 'save', topic, style, durationSec, mode, script: result,
          analysis, sceneCount: result.split(/\n\s*\n/).filter(s => s.trim()).length,
          charCount: result.length,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.message || '저장 실패');
      setSaveStatus('idle');
    }
  }, [result, topic, style, durationSec, mode, analysis, apiHeaders]);

  const loadSavedList = useCallback(async () => {
    try {
      const res = await fetch('/api/deep-script-save', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ action: 'list' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSavedList(data.scripts || []);
    } catch { /* ignore */ }
  }, [apiHeaders]);

  const handleLoad = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/deep-script-save', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ action: 'load', id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setTopic(data.topic);
      setStyle(data.style);
      setDurationSec(data.duration_sec);
      setMode(data.mode);
      setResult(data.script);
      if (data.analysis) {
        setAnalysis(data.analysis);
        setSelectedStyleId(data.analysis.recommendedStyles?.[0] || '');
      }
      setShowSaved(false);
    } catch (err: any) {
      setError(err.message || '불러오기 실패');
    }
  }, [apiHeaders]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch('/api/deep-script-save', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      setSavedList(prev => prev.filter(s => s.id !== id));
    } catch { /* ignore */ }
  }, [apiHeaders]);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated) { onShowAuthModal(); return; }
    if (!topic.trim()) return;

    setIsGenerating(true);
    setError('');
    setResult('');
    setSteps([]);
    setCurrentStep(null);
    setAnalysis(null);
    setSelectedStyleId('');

    abortRef.current = new AbortController();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const customKey = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_API_KEY);
      if (customKey) headers['x-custom-api-key'] = customKey;
      const sessionToken = localStorage.getItem('c2gen_session_token');
      if (sessionToken) headers['x-session-token'] = sessionToken;

      const response = await fetch('/api/deep-script', {
        method: 'POST',
        headers,
        body: JSON.stringify({ topic: topic.trim(), language, style, length: String(durationSec), mode }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const event: StepProgress = JSON.parse(payload);
            if (event.error) {
              setError(event.error);
              continue;
            }

            if (event.status === 'working') {
              setCurrentStep(event);
            } else if (event.status === 'done') {
              // done 이벤트에 script가 있으면 결과 저장 (Step 1 fast / Step 3 deep)
              if (event.script) setResult(event.script);
              setSteps(prev => [...prev, { ...event, ...(currentStep || {}) }]);
              setCurrentStep(null);
            } else if (event.status === 'complete') {
              if (event.script) setResult(event.script);
              if (event.analysis) {
                setAnalysis(event.analysis);
                setSelectedStyleId(event.analysis.recommendedStyles?.[0] || '');
              }
              setSteps(prev => [...prev, event]);
              setCurrentStep(null);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || '대본 생성에 실패했습니다.');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [isAuthenticated, onShowAuthModal, topic, language, style, durationSec, mode]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setCurrentStep(null);
  }, []);

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
          <button
            onClick={() => { setShowSaved(!showSaved); if (!showSaved) loadSavedList(); }}
            className="ml-auto px-3 py-1 rounded-lg text-[11px] font-medium transition-all"
            style={{
              backgroundColor: showSaved ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
              color: showSaved ? '#3b82f6' : 'var(--text-muted)',
              border: `1px solid ${showSaved ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
            }}
          >
            📂 저장된 대본 {savedList.length > 0 ? `(${savedList.length})` : ''}
          </button>
        </h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          주제를 입력하면 AI가 심층 분석 후 완성도 높은 대본을 생성합니다.
        </p>
      </div>

      {/* 저장된 대본 목록 */}
      {showSaved && (
        <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-[12px] font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>
            📂 저장된 심층대본
          </h3>
          {savedList.length === 0 ? (
            <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>저장된 대본이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {savedList.map(s => {
                const styleOpt = STYLE_OPTIONS.find(o => o.value === s.style);
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.topic}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {styleOpt?.icon} {styleOpt?.label || s.style} · {formatDuration(s.duration_sec)} · {s.scene_count}씬 · {s.char_count.toLocaleString()}자 · {new Date(s.created_at).toLocaleDateString('ko')}
                      </p>
                    </div>
                    <button onClick={() => handleLoad(s.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>불러오기</button>
                    <button onClick={async () => { await handleLoad(s.id); }} className="px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>스토리보드</button>
                    <button onClick={() => handleDelete(s.id)} className="px-1.5 py-1 rounded text-[10px]" style={{ color: 'var(--text-muted)' }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                { value: 'fast' as const, label: '⚡ 빠른 생성' },
                { value: 'deep' as const, label: '🔬 심층 생성' },
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
                >
                  {m.label}
                </button>
              ))}
            </div>
            {/* 생성 모드 설명 카드 */}
            <div className="mt-1.5 rounded-md px-3 py-2" style={{ backgroundColor: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
              {mode === 'fast' ? (
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  ⚡ Gemini Pro 1회 호출로 빠르게 대본을 생성합니다.<br />
                  소요시간: 약 15~30초
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  🔬 <strong style={{ color: 'var(--text-secondary)' }}>3단계 Self-Refine</strong> — AI가 초안 작성 → 10가지 기준으로 품질 감사 → 피드백 반영 개선을 거쳐 완성도 높은 대본을 만듭니다.<br />
                  소요시간: 약 40~90초 · Gemini Pro 3회 호출
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 생성 버튼 */}
        {!isGenerating ? (
          <button
            onClick={handleGenerate}
            disabled={!topic.trim()}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              color: '#ffffff',
            }}
          >
            {mode === 'fast' ? '⚡ 빠른 생성' : '🔬 심층대본 생성'}
          </button>
        ) : (
          /* ── 진행 상태 UI ── */
          <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
            {/* 프로그레스 바 */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${currentStep ? ((currentStep.step - 1) / currentStep.total) * 100 : steps.length > 0 ? (steps[steps.length - 1].step / (steps[steps.length - 1].total || 1)) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
                  }}
                />
              </div>
              <button
                onClick={handleAbort}
                className="px-2 py-1 rounded text-[10px] font-medium hover:brightness-110"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                중단
              </button>
            </div>

            {/* 현재 진행 단계 */}
            {currentStep && (
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#a855f7' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                </svg>
                <span className="text-[12px] font-bold" style={{ color: '#a855f7' }}>
                  {currentStep.icon} {currentStep.label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  ({currentStep.step}/{currentStep.total})
                </span>
              </div>
            )}
            {currentStep?.detail && (
              <p className="text-[11px] mb-3 ml-6" style={{ color: 'var(--text-muted)' }}>
                {currentStep.detail}
              </p>
            )}

            {/* 완료된 단계들 */}
            {steps.length > 0 && (
              <div className="space-y-1.5 ml-1">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[11px] flex-shrink-0" style={{ color: '#10b981' }}>✓</span>
                    <div className="flex-1">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {s.step === 1 && `초안 완료`}
                        {s.step === 1 && s.charCount && ` (${s.charCount.toLocaleString()}자)`}
                        {s.step === 2 && s.total > 2 && `품질 감사 완료`}
                        {s.step === 2 && s.total > 2 && s.improvements && ` (개선점 ${s.improvements}건)`}
                        {s.step === 2 && s.total <= 2 && `캐릭터·화풍 분석 완료`}
                        {s.step === 3 && `최종 개선 완료`}
                        {s.step === 3 && s.charCount && ` (${s.charCount.toLocaleString()}자)`}
                        {s.step === 4 && `캐릭터·화풍 분석 완료`}
                      </span>
                      {/* 초안 미리보기 */}
                      {s.step === 1 && s.preview && (
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                          "{s.preview}..."
                        </p>
                      )}
                      {/* 감사 결과 미리보기 */}
                      {s.step === 2 && s.auditPreview && (
                        <p className="text-[10px] mt-0.5 whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>
                          {s.auditPreview.slice(0, 200)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-110"
                style={{
                  backgroundColor: saveStatus === 'saved' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                  color: saveStatus === 'saved' ? '#10b981' : '#3b82f6',
                  border: `1px solid ${saveStatus === 'saved' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`,
                }}
              >
                {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '✓ 저장됨' : '💾 저장'}
              </button>
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

      {/* ── AI 제안 카드 (캐릭터 + 화풍 + 음성) ── */}
      {analysis && result && !isGenerating && (
        <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            🎨 AI 추천 설정
            <span className="text-[10px] px-2 py-0.5 rounded-full font-normal" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              대본 분석 기반
            </span>
          </h3>

          {/* 캐릭터 카드 */}
          {analysis.needsCharacter && analysis.characters.length > 0 && (
            <div className="mb-4">
              <label className="block text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
                👤 등장 캐릭터 · {analysis.narrationStyle}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.characters.map((char, i) => (
                  <div key={i} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px]">{char.gender === 'female' ? '👩' : '👨'}</span>
                      <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{char.role}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                        {char.ageRange} {char.gender === 'female' ? '여성' : '남성'}
                      </span>
                    </div>
                    <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {char.personality}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      👔 {char.visualDescription}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      🎙️ {char.voiceTone} 톤
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!analysis.needsCharacter && (
            <div className="mb-4 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                👤 캐릭터 없음 — 이 대본은 데이터/사물 중심이므로 캐릭터가 등장하지 않습니다.
              </p>
            </div>
          )}

          {/* 화풍 추천 */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
              🎨 추천 화풍
              <span className="ml-1 font-normal">({analysis.overallMood} 분위기 기반)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {analysis.recommendedStyles.map((sid, i) => {
                const meta = STYLE_META[sid];
                if (!meta) return null;
                const isSelected = selectedStyleId === sid;
                return (
                  <button
                    key={sid}
                    onClick={() => setSelectedStyleId(sid)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: isSelected ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                      border: `1px solid ${isSelected ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
                      color: isSelected ? '#a855f7' : 'var(--text-secondary)',
                    }}
                  >
                    {i === 0 && <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(250,204,21,0.15)', color: '#eab308' }}>추천</span>}
                    <div className="text-left">
                      <p className="text-[11px] font-bold">{meta.name}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{meta.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 음성 추천 */}
          <div className="mb-4 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              🎙️ 추천 음성: <strong>{analysis.recommendedVoiceGender === 'female' ? '여성' : '남성'}</strong> · {analysis.recommendedVoiceAge === 'young' ? '젊은' : analysis.recommendedVoiceAge === 'mature' ? '성숙한' : '중간'} 톤
              <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                (스토리보드에서 음성 변경 가능)
              </span>
            </p>
          </div>

          {/* 스토리보드 생성 버튼 */}
          {onStartStoryboard && (
            <button
              onClick={() => onStartStoryboard(result, selectedStyleId, analysis)}
              disabled={!selectedStyleId}
              className="w-full py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-40"
              style={{
                background: selectedStyleId
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'var(--bg-elevated)',
                color: selectedStyleId ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              🚀 이 설정으로 스토리보드 생성
            </button>
          )}
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
