import React, { useState, useEffect, useCallback } from 'react';
import { CREDIT_CONFIG } from '../config';
import type { CreditTransaction } from '../types';

interface CreditShopProps {
  onClose: () => void;
  currentCredits: number;
  currentPlan: string;
}

type Tab = 'packs' | 'plans' | 'history';

const CreditShop: React.FC<CreditShopProps> = ({ onClose, currentCredits, currentPlan }) => {
  const [activeTab, setActiveTab] = useState<Tab>('packs');
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'toss' | 'stripe'>('toss');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('c2gen_session_token');
      if (!token) return;
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCreditHistory', token, limit: 50 }),
      });
      const d = await r.json();
      setHistory(d.transactions || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  const handlePurchase = async () => {
    const pack = CREDIT_CONFIG.PACKS.find(p => p.id === selectedPack);
    if (!pack) return;

    setProcessing(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('c2gen_session_token');
      const r = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': token || '',
        },
        body: JSON.stringify({
          action: paymentMethod === 'toss' ? 'toss-prepare' : 'stripe-checkout',
          packId: pack.id,
          credits: pack.credits,
          amount: pack.price_krw,
        }),
      });

      const data = await r.json();

      if (data.error) {
        setMessage({ type: 'error', text: data.error });
        return;
      }

      // 토스: 결제창 열기
      if (paymentMethod === 'toss' && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Stripe: 체크아웃 세션으로 이동
      if (paymentMethod === 'stripe' && data.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }

      setMessage({ type: 'error', text: '결제 준비에 실패했습니다.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || '결제 오류가 발생했습니다.' });
    } finally {
      setProcessing(false);
    }
  };

  const tabClass = (tab: Tab) =>
    activeTab === tab
      ? `px-4 py-2 text-sm font-bold transition-colors relative text-brand-400`
      : `px-4 py-2 text-sm font-bold transition-colors relative`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
              {currentPlan === 'operator' ? '운영자 계정' : '크레딧 충전'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {currentPlan === 'operator' ? (
                <span className="font-bold text-orange-400">크레딧 무제한 (운영자)</span>
              ) : (
                <>
                  현재 잔액: <span className={`font-bold ${currentCredits <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {currentCredits.toLocaleString()} 크레딧
                  </span>
                  {currentPlan !== 'free' && (
                    <span className="ml-2 px-1.5 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[9px] font-bold uppercase">
                      {currentPlan}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >✕</button>
        </div>

        {/* 운영자 계정 안내 */}
        {currentPlan === 'operator' ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-orange-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>운영자 계정</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>모든 기능을 크레딧 차감 없이 무제한 사용할 수 있습니다.</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>4K 해상도, 워터마크 제거 등 프로 기능 전체 포함</p>
          </div>
        ) : (
        <>
        {/* 탭 */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--border-default)' }}>
          <button className={tabClass('packs')} onClick={() => setActiveTab('packs')} style={activeTab !== 'packs' ? { color: 'var(--text-secondary)' } : undefined}>
            크레딧 팩
            {activeTab === 'packs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
          </button>
          <button className={tabClass('plans')} onClick={() => setActiveTab('plans')} style={activeTab !== 'plans' ? { color: 'var(--text-secondary)' } : undefined}>
            구독 요금제
            {activeTab === 'plans' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
          </button>
          <button className={tabClass('history')} onClick={() => setActiveTab('history')} style={activeTab !== 'history' ? { color: 'var(--text-secondary)' } : undefined}>
            사용 내역
            {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="p-6 overflow-y-auto max-h-[55vh]">
          {message && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
                : 'bg-red-900/30 border border-red-700/50 text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* 크레딧 팩 */}
          {activeTab === 'packs' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {CREDIT_CONFIG.PACKS.map(pack => (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPack(pack.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      selectedPack === pack.id
                        ? 'border-brand-500 bg-brand-500/10'
                        : ''
                    }`}
                    style={selectedPack !== pack.id ? { borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' } : undefined}
                  >
                    <div className="text-left">
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{pack.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        1크레딧 = {(pack.price_krw / pack.credits).toFixed(1)}원
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-lg text-brand-400">
                        {pack.price_krw.toLocaleString()}원
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* 결제 수단 */}
              {selectedPack && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>결제 수단</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPaymentMethod('toss')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                        paymentMethod === 'toss'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : ''
                      }`}
                      style={paymentMethod !== 'toss' ? { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' } : undefined}
                    >
                      토스페이먼츠
                      <div className="text-[10px] opacity-60 mt-0.5">카드/카카오/네이버/토스</div>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('stripe')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                        paymentMethod === 'stripe'
                          ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                          : ''
                      }`}
                      style={paymentMethod !== 'stripe' ? { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' } : undefined}
                    >
                      Stripe
                      <div className="text-[10px] opacity-60 mt-0.5">해외 카드/PayPal</div>
                    </button>
                  </div>

                  <button
                    onClick={handlePurchase}
                    disabled={processing}
                    className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? '처리 중...' : `${CREDIT_CONFIG.PACKS.find(p => p.id === selectedPack)?.price_krw.toLocaleString()}원 결제하기`}
                  </button>
                </div>
              )}

              {/* 크레딧 비용 안내 */}
              <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
                <div className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>크레딧 사용 안내</div>
                <div className="grid grid-cols-2 gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <div>이미지 (Gemini): <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>5 크레딧</span></div>
                  <div>이미지 (GPT): <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>7 크레딧</span></div>
                  <div>TTS (1000자): <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>5 크레딧</span></div>
                  <div>영상 변환: <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>22 크레딧</span></div>
                </div>
              </div>
            </div>
          )}

          {/* 구독 요금제 */}
          {activeTab === 'plans' && (
            <div className="space-y-3">
              {Object.entries(CREDIT_CONFIG.PLANS).map(([key, plan]) => {
                const isCurrentPlan = currentPlan === key;
                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrentPlan
                        ? 'border-brand-500 bg-brand-500/10'
                        : ''
                    }`}
                    style={!isCurrentPlan ? { borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)', backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' } : undefined}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-black" style={{ color: 'var(--text-primary)' }}>{plan.name}</span>
                        {isCurrentPlan && (
                          <span className="ml-2 px-2 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[10px] font-bold">
                            현재 플랜
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        {plan.price_krw === 0 ? (
                          <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>무료</span>
                        ) : (
                          <span className="font-black text-lg text-brand-400">
                            {plan.price_krw.toLocaleString()}원<span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>/월</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {plan.monthly_credits > 0 && (
                      <div className="text-sm text-emerald-400 font-bold mb-1">
                        매월 {plan.monthly_credits.toLocaleString()} 크레딧
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <span className="text-emerald-500 text-[10px]">+</span> {f}
                        </li>
                      ))}
                    </ul>
                    {!isCurrentPlan && plan.price_krw > 0 && (
                      <button
                        className="mt-3 w-full py-2 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 text-xs font-bold border border-brand-500/30 transition-all"
                        onClick={() => setMessage({ type: 'error', text: '구독 기능은 준비 중입니다. 크레딧 팩을 이용해주세요.' })}
                      >
                        {plan.name} 구독하기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 사용 내역 */}
          {activeTab === 'history' && (
            <div>
              {historyLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>로딩 중...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>사용 내역이 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {history.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)'; }}>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tx.description || tx.type}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(tx.created_at).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tx.balance_after.toLocaleString()} 잔액</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default CreditShop;
