import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PaymentSuccessProps {
  orderId: string;
  onDone: () => void;
}

const PaymentSuccess: React.FC<PaymentSuccessProps> = ({ orderId, onDone }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify-payment', orderId }),
        });
        const d = await r.json();
        if (d.status === 'completed') {
          setStatus('success');
          setCredits(d.credits || 0);
        } else if (d.status === 'pending') {
          // 토스 리다이렉트 후 confirm 필요
          const urlParams = new URLSearchParams(window.location.search);
          const paymentKey = urlParams.get('paymentKey');
          const amount = urlParams.get('amount');

          const parsedAmount = amount ? parseInt(amount, 10) : NaN;
          if (paymentKey && !isNaN(parsedAmount)) {
            const token = localStorage.getItem('c2gen_session_token') || '';
            const confirmR = await fetch('/api/payments', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-token': token,
              },
              body: JSON.stringify({
                action: 'toss-confirm',
                paymentKey,
                orderId,
                amount: parsedAmount,
              }),
            });
            const confirmD = await confirmR.json();
            if (confirmD.success) {
              setStatus('success');
              setCredits(confirmD.credits || 0);
            } else {
              setStatus('failed');
            }
          } else {
            // Stripe 웹훅 대기 (최대 10초)
            for (let i = 0; i < 5; i++) {
              await new Promise(r => setTimeout(r, 2000));
              const checkR = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify-payment', orderId }),
              });
              const checkD = await checkR.json();
              if (checkD.status === 'completed') {
                setStatus('success');
                setCredits(checkD.credits || 0);
                return;
              }
            }
            setStatus('failed');
          }
        } else {
          setStatus('failed');
        }
      } catch {
        setStatus('failed');
      }
    })();
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="border rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)' }}>
        {status === 'verifying' && (
          <>
            <div className="w-12 h-12 border-3 border-brand-500 border-t-transparent animate-spin rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-black mb-2" style={{ color: 'var(--text-primary)' }}>{t('creditShop.verifyingPayment')}</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('creditShop.pleaseWait')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">+</span>
            </div>
            <h3 className="text-lg font-black text-emerald-400 mb-2">{t('creditShop.chargeComplete')}</h3>
            <p className="text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>{credits.toLocaleString()} {t('creditShop.credits')}</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('creditShop.creditsCharged')}</p>
            <button
              onClick={onDone}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-sm transition-all"
            >
              {t('common.confirm')}
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-red-400">!</span>
            </div>
            <h3 className="text-lg font-black text-red-400 mb-2">{t('creditShop.paymentFailed')}</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('creditShop.paymentFailedDesc')}</p>
            <button
              onClick={onDone}
              className="w-full py-3 rounded-xl font-black text-sm transition-all"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            >
              {t('common.close')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
