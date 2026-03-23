import React from 'react';
import { useTranslation } from 'react-i18next';
import { GeneratedAsset } from '../types';
import { getSelectedImageModel } from '../services/imageService';

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
}

export default function ScriptReviewBanner({
  generatedData, bgmData, userCredits, userPlan,
  onApprove, onRegenerate, onCancel, onOpenCreditShop, isProcessingRef
}: ScriptReviewBannerProps) {
  const { t } = useTranslation();

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
