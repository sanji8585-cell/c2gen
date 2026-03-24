import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GeneratedAsset } from '../types';
import { getSelectedImageModel } from '../services/imageService';
import { LINT_FOCUS_TAGS, type LintFocusId } from '../services/prompts';

interface LintFix {
  sceneIndex: number;
  narration: string;
  reason: string;
  accepted: boolean;
}

interface ScriptReviewBannerProps {
  generatedData: GeneratedAsset[];
  bgmData: string | null;
  userCredits: number;
  userPlan: string;
  onApprove: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onOpenCreditShop: () => void;
  isProcessingRef: React.MutableRefObject<boolean>;
  onUpdateNarration?: (index: number, narration: string) => void;
}

export default function ScriptReviewBanner({
  generatedData, bgmData, userCredits, userPlan,
  onApprove, onRegenerate, onCancel, onOpenCreditShop, isProcessingRef,
  onUpdateNarration,
}: ScriptReviewBannerProps) {
  const { t } = useTranslation();
  const [lintFixes, setLintFixes] = useState<LintFix[]>([]);
  const [isLinting, setIsLinting] = useState(false);
  const [lintDone, setLintDone] = useState(false);
  const [showLintOptions, setShowLintOptions] = useState(false);
  const [selectedTags, setSelectedTags] = useState<LintFocusId[]>([]);
  const [freeInput, setFreeInput] = useState('');

  const toggleTag = (id: LintFocusId) => {
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleLint = useCallback(async () => {
    setIsLinting(true);
    setShowLintOptions(false);
    try {
      const language = (localStorage.getItem('tubegen_language') as string) || 'ko';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const customKey = localStorage.getItem('tubegen_custom_gemini_key');
      if (customKey) headers['x-custom-api-key'] = customKey;
      const sessionToken = localStorage.getItem('c2gen_session_token');
      if (sessionToken) headers['x-session-token'] = sessionToken;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'lintScript',
          scenes: generatedData.map(s => ({
            narration: s.narration,
            analysis: { sentiment: s.analysis?.sentiment, scene_role: s.analysis?.scene_role },
          })),
          language,
          focusTags: selectedTags,
          freeInput: freeInput.trim(),
        }),
      });
      const fixes = await res.json();

      if (Array.isArray(fixes) && fixes.length > 0) {
        setLintFixes(fixes.map((f: any) => ({ ...f, accepted: true })));
      } else {
        setLintFixes([]);
      }
      setLintDone(true);
    } catch (err) {
      console.error('[Lint] 실패:', err);
      setLintDone(true);
    } finally {
      setIsLinting(false);
    }
  }, [generatedData, selectedTags, freeInput]);

  const toggleFix = (idx: number) => {
    setLintFixes(prev => prev.map((f, i) => i === idx ? { ...f, accepted: !f.accepted } : f));
  };

  const applyFixes = () => {
    if (!onUpdateNarration) return;
    for (const fix of lintFixes) {
      if (fix.accepted && fix.sceneIndex >= 0 && fix.sceneIndex < generatedData.length) {
        onUpdateNarration(fix.sceneIndex, fix.narration);
      }
    }
    setLintDone(false);
    setLintFixes([]);
  };

  const sc = generatedData.length;
  const imgModel = getSelectedImageModel();
  const imgPer = imgModel === 'gpt-image-1' ? 21 : 16;
  const totalChars = generatedData.reduce((s, d) => s + (d.narration?.length || 0), 0);
  const scriptCost = 5;
  const imgTotal = sc * imgPer;
  const ttsTotal = Math.max(15, Math.ceil(totalChars / 1000) * 15);
  const autoBgmEnabled = localStorage.getItem('tubegen_auto_bgm') === 'true';
  const bgmCost = (autoBgmEnabled && !bgmData) ? 50 : 0;
  const est = scriptCost + imgTotal + ttsTotal + bgmCost;
  const isInsufficientCredits = userPlan !== 'operator' && userCredits < est;

  // 음식 비유 시스템
  const krwEst = est * 10;
  const foodTiers: { max: number; label: string; quotes: string[] }[] = [
    { max: 100, label: '콜라 한 캔 🥤', quotes: [
      '이거 콜라 한 캔도 안 하네 ㅋㅋ 🥤',
      '동전 몇 개로 콘텐츠를 만든다고? 🪙',
    ]},
    { max: 150, label: '삼각김밥 하나 🍙', quotes: [
      '삼각김밥 하나 참으면 되는 거잖아 🍙',
      '편의점 들를 뻔한 돈으로 뚝딱! 🏪',
    ]},
    { max: 200, label: '햄버거 반개 🍔', quotes: [
      '햄버거 반개 값이라니...! 살도 빼고 개이득! 🍔',
      '라면 보다도 싸다고?? 라면 다 먹기 전에 만들어 준다고!? 🍜',
    ]},
    { max: 300, label: '떡볶이 한 접시 🍢', quotes: [
      '떡볶이 한 접시 값이면 끝! 매운 건 참자 🍢',
      '분식집 한 번 안 가면 되는 거지 뭐~ 🍢',
    ]},
    { max: 400, label: '아메리카노 한 잔 ☕', quotes: [
      '아아 한 잔 참으면 되는 거잖아~ ☕',
      '오늘 커피 한 잔 스킵하면 콘텐츠 완성! ☕',
    ]},
    { max: 500, label: '컵라면 + 김밥 세트 🍜', quotes: [
      '편의점 세트 하나 아끼면 OK 🍜',
      '야식 한 번 참으면 되는 가격 🍜',
    ]},
    { max: 700, label: '볶음밥 한 그릇 🍳', quotes: [
      '볶음밥 한 그릇 포기하면... 충분해! 🍳',
      '김밥천국 한 끼면 해결되는 가격 🍳',
    ]},
    { max: 1000, label: '짜장면 한 그릇 🍜', quotes: [
      '짜장면 한 그릇이냐 콘텐츠냐, 고민할 것도 없지 🍜',
      '배달 한 번 안 시키면 되는 거지~ 🍜',
    ]},
    { max: 1500, label: '햄버거 세트 🍔', quotes: [
      '빅맥 세트 하나 참으면 프로 콘텐츠 완성! 🍔',
      '패스트푸드 한 끼 vs 콘텐츠 한 편... 현명한 선택 🍔',
    ]},
    { max: 2000, label: '치킨 한 마리 🍗', quotes: [
      '치킨 한 마리 vs 프로 콘텐츠... 어렵다 🍗',
      '오늘 치킨 대신 콘텐츠 어때? 🍗',
    ]},
    { max: 3000, label: '피자 라지 🍕', quotes: [
      '피자 한 판이면 콘텐츠가 나오는 세상 🍕',
      '배달 피자 한 판 vs 프로 영상... 고민되네 🍕',
    ]},
    { max: Infinity, label: '스시 오마카세 🍣', quotes: [
      '오마카세 한 끼 생각하면 오히려 싼 거 아냐? 🍣',
      '맛집 한 번 참으면 대작이 탄생! 🍣',
    ]},
  ];
  const tier = foodTiers.find(t => est <= t.max) || foodTiers[foodTiers.length - 1];
  const quote = tier.quotes[Math.floor(Math.random() * tier.quotes.length)];

  return (
    <div className="max-w-7xl mx-auto px-4 mb-6 text-center">
      {/* 견적서 카드 */}
      <div className="mx-auto max-w-lg mb-5 rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(139,92,246,0.06) 100%)' }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
          <span className="text-base">📋</span>
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>{t('scriptReview.estimatedCost')}</span>
          <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
            {tier.label}
          </span>
        </div>
        <div className="px-5 py-2.5 text-center" style={{ borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('scriptReview.description', { count: sc })}
          </p>
        </div>
        <div className="px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}>📝</span>
              <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.scriptGeneration')}</span>
            </div>
            <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{scriptCost}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(96,165,250,0.15)' }}>🖼️</span>
              <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.imagesCount', { count: sc })} <span className="text-[10px] opacity-60">({imgModel === 'gpt-image-1' ? 'GPT' : 'Gemini'} @{imgPer})</span></span>
            </div>
            <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{imgTotal}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>🔊</span>
              <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.ttsChars')} <span className="text-[10px] opacity-60">({totalChars}{t('completion.unit.chars')})</span></span>
            </div>
            <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{ttsTotal}</span>
          </div>
          {bgmCost > 0 && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>🎵</span>
                <span style={{ color: 'var(--text-secondary)' }}>AI BGM <span className="text-[10px] opacity-60">({localStorage.getItem('tubegen_bgm_duration') || '30'}초)</span></span>
              </div>
              <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{bgmCost}</span>
            </div>
          )}
          {bgmData && !autoBgmEnabled && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>🎵</span>
                <span style={{ color: 'var(--text-secondary)' }}>BGM <span className="text-[10px] opacity-60">(선택됨)</span></span>
              </div>
              <span className="font-bold tabular-nums text-green-400" style={{}}>무료</span>
            </div>
          )}
          <div className="border-t pt-2 mt-1 flex items-center justify-between" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
            <span className="text-sm font-black" style={{ color: '#f59e0b' }}>{t('scriptReview.estimatedTotal')}</span>
            <span className="text-lg font-black tabular-nums" style={{ color: '#f59e0b' }}>{est} <span className="text-xs font-bold">{t('common.credits')}</span></span>
          </div>
        </div>
        <div className="px-5 py-2.5 text-center" style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderTop: '1px solid rgba(245,158,11,0.1)' }}>
          <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
            "{quote}"
          </p>
        </div>
      </div>

      {/* 크레딧 부족 경고 */}
      {isInsufficientCredits && (
        <div className="mx-auto max-w-md mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/50 text-center">
          <p className="text-sm font-bold text-red-400 mb-1">
            {t('scriptReview.insufficientCredits')}
          </p>
          <p className="text-xs text-red-300/80">
            {t('scriptReview.insufficientDesc', { est, balance: userCredits.toLocaleString() })}
            <span className="ml-1 opacity-70">({t('scriptReview.insufficientShort', { amount: est - userCredits })})</span>
          </p>
          <button
            onClick={onOpenCreditShop}
            className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {t('scriptReview.chargeCredits')}
          </button>
        </div>
      )}

      {/* AI 검수 옵션 패널 */}
      {showLintOptions && !lintDone && (
        <div className="mx-auto max-w-lg mb-5 rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'linear-gradient(135deg, rgba(34,197,94,0.04) 0%, rgba(59,130,246,0.04) 100%)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#22c55e' }}>검수 포커스 선택</span>
            <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>(선택 안 하면 전체 검토)</span>
          </div>
          <div className="px-4 py-3">
            <div className="flex flex-wrap gap-2 mb-3">
              {LINT_FOCUS_TAGS.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border"
                  style={{
                    borderColor: selectedTags.includes(tag.id) ? '#22c55e' : 'var(--border-default)',
                    backgroundColor: selectedTags.includes(tag.id) ? 'rgba(34,197,94,0.15)' : 'transparent',
                    color: selectedTags.includes(tag.id) ? '#22c55e' : 'var(--text-secondary)',
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={freeInput}
              onChange={e => setFreeInput(e.target.value)}
              placeholder="추가 요청 (예: 좀 더 유머러스하게)"
              className="w-full px-3 py-2 rounded-lg text-xs border"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="px-4 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid rgba(34,197,94,0.1)' }}>
            <button
              onClick={() => setShowLintOptions(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold border"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
            >
              취소
            </button>
            <button
              onClick={handleLint}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: '#22c55e' }}
            >
              🔍 검수 시작
            </button>
          </div>
        </div>
      )}

      {/* AI 검수 결과 */}
      {lintDone && lintFixes.length > 0 && (
        <div className="mx-auto max-w-2xl mb-5 rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(59,130,246,0.06) 100%)' }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
            <span className="text-base">🔍</span>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#22c55e' }}>AI 검수 결과</span>
            <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              {lintFixes.length}개 개선 제안
            </span>
          </div>
          <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
            {lintFixes.map((fix, idx) => (
              <div key={idx} className="rounded-xl p-3 border transition-all" style={{
                borderColor: fix.accepted ? 'rgba(34,197,94,0.3)' : 'rgba(107,114,128,0.3)',
                backgroundColor: fix.accepted ? 'rgba(34,197,94,0.05)' : 'rgba(107,114,128,0.05)',
              }}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleFix(idx)}
                    className="mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs font-bold border transition-all shrink-0"
                    style={{
                      borderColor: fix.accepted ? '#22c55e' : '#6b7280',
                      backgroundColor: fix.accepted ? '#22c55e' : 'transparent',
                      color: fix.accepted ? '#fff' : '#6b7280',
                    }}
                  >
                    {fix.accepted ? '✓' : ''}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold mb-1.5" style={{ color: '#f59e0b' }}>
                      씬 {fix.sceneIndex + 1} — {fix.reason}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div className="text-[9px] font-bold mb-1" style={{ color: '#ef4444' }}>변경 전</div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {generatedData[fix.sceneIndex]?.narration || ''}
                        </p>
                      </div>
                      <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                        <div className="text-[9px] font-bold mb-1" style={{ color: '#22c55e' }}>변경 후</div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                          {fix.narration}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid rgba(34,197,94,0.15)' }}>
            <button
              onClick={() => { setLintDone(false); setLintFixes([]); }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold border transition-all hover:opacity-80"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
            >
              취소
            </button>
            <button
              onClick={applyFixes}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#22c55e' }}
            >
              선택 항목 적용 ({lintFixes.filter(f => f.accepted).length}개)
            </button>
          </div>
        </div>
      )}

      {lintDone && lintFixes.length === 0 && (
        <div className="mx-auto max-w-md mb-5 px-4 py-3 rounded-xl text-center" style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <p className="text-sm font-bold" style={{ color: '#22c55e' }}>✅ 수정 사항 없음 — 대본 품질이 좋습니다!</p>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex justify-center gap-3">
        <button
          onClick={onRegenerate}
          disabled={isProcessingRef.current}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all border hover:opacity-80"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
        >
          {t('scriptReview.regenerateScript')}
        </button>
        <button
          onClick={() => setShowLintOptions(!showLintOptions)}
          disabled={isLinting || isProcessingRef.current}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all border hover:opacity-80"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }}
        >
          {isLinting ? '검수 중...' : '🔍 AI 검수 (5크레딧)'}
        </button>
        <button
          onClick={isInsufficientCredits ? onOpenCreditShop : onApprove}
          className={isInsufficientCredits
            ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black py-3 px-12 rounded-xl transition-all text-base shadow-lg shadow-red-500/40"
            : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-black py-3 px-12 rounded-xl transition-all text-base shadow-lg shadow-cyan-500/40 hover:shadow-cyan-400/60 hover:scale-105 animate-pulse"
          }
        >
          {isInsufficientCredits ? `💳 ${t('scriptReview.chargeButton')}` : `🚀 ${t('scriptReview.startGeneration')}`}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-80"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
