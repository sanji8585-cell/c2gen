import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

// 세션에서 이메일 조회
async function getEmailFromSession(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions')
    .select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data?.email || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Stripe 웹훅은 raw body 필요
  if (req.method === 'POST' && req.headers['stripe-signature']) {
    return handleStripeWebhook(req, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const sessionToken = (req.headers['x-session-token'] as string) || params.token || '';

  try {
    const supabase = getSupabase();

    switch (action) {
      // ════════════════════════════════════════
      // 토스페이먼츠
      // ════════════════════════════════════════

      case 'toss-prepare': {
        const email = await getEmailFromSession(supabase, sessionToken);
        if (!email) return res.status(401).json({ error: '로그인이 필요합니다.' });

        const { credits, amount: amountKrw, packId } = params;
        if (!credits || !amountKrw) return res.status(400).json({ error: 'credits and amount required' });

        const clientKey = process.env.TOSS_CLIENT_KEY;
        if (!clientKey) return res.status(500).json({ error: '토스페이먼츠가 설정되지 않았습니다.' });

        // 주문 ID 생성 (idempotency)
        const orderId = `TUBEGEN_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // 결제 대기 레코드 생성
        await supabase.from('c2gen_payments').insert({
          email,
          provider: 'toss',
          provider_payment_id: orderId,
          amount: amountKrw,
          credits,
          type: 'credit_pack',
          status: 'pending',
          metadata: { packId },
        });

        return res.json({
          orderId,
          amount: amountKrw,
          clientKey,
          orderName: `TubeGen ${credits.toLocaleString()} 크레딧`,
          customerEmail: email,
        });
      }

      case 'toss-confirm': {
        const email = await getEmailFromSession(supabase, sessionToken);
        if (!email) return res.status(401).json({ error: '로그인이 필요합니다.' });

        const { paymentKey, orderId, amount } = params;
        if (!paymentKey || !orderId || !amount) {
          return res.status(400).json({ error: 'paymentKey, orderId, amount 필요' });
        }

        const secretKey = process.env.TOSS_SECRET_KEY;
        if (!secretKey) return res.status(500).json({ error: '토스 시크릿 키가 설정되지 않았습니다.' });

        // 이미 처리된 결제인지 확인
        const { data: existingPayment } = await supabase
          .from('c2gen_payments')
          .select('status, credits')
          .eq('provider_payment_id', orderId)
          .single();

        if (existingPayment?.status === 'completed') {
          return res.json({ success: true, message: '이미 처리된 결제입니다.', alreadyProcessed: true });
        }

        // 토스 결제 승인 API 호출
        const authHeader = Buffer.from(`${secretKey}:`).toString('base64');
        const confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        if (!confirmRes.ok) {
          const errorData = await confirmRes.json();
          await supabase.from('c2gen_payments')
            .update({ status: 'failed', metadata: { error: errorData } })
            .eq('provider_payment_id', orderId);
          return res.status(400).json({ error: errorData.message || '결제 승인 실패' });
        }

        const confirmData = await confirmRes.json();

        // 결제 레코드 업데이트
        await supabase.from('c2gen_payments')
          .update({
            status: 'completed',
            metadata: { tossPaymentKey: paymentKey, method: confirmData.method },
          })
          .eq('provider_payment_id', orderId);

        // 크레딧 충전
        const credits = existingPayment?.credits || params.credits;
        const { data: creditResult } = await supabase.rpc('add_credits', {
          p_email: email,
          p_amount: credits,
          p_type: 'charge',
          p_description: `크레딧 충전 (토스, ${amount.toLocaleString()}원)`,
          p_reference_id: orderId,
        });

        return res.json({
          success: true,
          credits,
          balance: creditResult?.balance,
          message: `${credits.toLocaleString()} 크레딧이 충전되었습니다.`,
        });
      }

      // ════════════════════════════════════════
      // Stripe
      // ════════════════════════════════════════

      case 'stripe-checkout': {
        const email = await getEmailFromSession(supabase, sessionToken);
        if (!email) return res.status(401).json({ error: '로그인이 필요합니다.' });

        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return res.status(500).json({ error: 'Stripe가 설정되지 않았습니다.' });

        const { credits, amount: amountKrw, packId } = params;
        if (!credits || !amountKrw) return res.status(400).json({ error: 'credits and amount required' });

        const orderId = `TUBEGEN_STRIPE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // Stripe Checkout 세션 생성
        const baseUrl = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';
        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'mode': 'payment',
            'currency': 'krw',
            'customer_email': email,
            'client_reference_id': orderId,
            'line_items[0][price_data][currency]': 'krw',
            'line_items[0][price_data][product_data][name]': `TubeGen ${credits.toLocaleString()} 크레딧`,
            'line_items[0][price_data][unit_amount]': String(amountKrw),
            'line_items[0][quantity]': '1',
            'success_url': `${baseUrl}/?payment=success&orderId=${orderId}`,
            'cancel_url': `${baseUrl}/?payment=cancelled`,
            'metadata[orderId]': orderId,
            'metadata[credits]': String(credits),
            'metadata[email]': email,
          }).toString(),
        });

        if (!stripeRes.ok) {
          const errorData = await stripeRes.json();
          return res.status(400).json({ error: errorData.error?.message || 'Stripe 세션 생성 실패' });
        }

        const session = await stripeRes.json();

        // 결제 대기 레코드
        await supabase.from('c2gen_payments').insert({
          email,
          provider: 'stripe',
          provider_payment_id: orderId,
          amount: amountKrw,
          credits,
          type: 'credit_pack',
          status: 'pending',
          metadata: { stripeSessionId: session.id, packId },
        });

        return res.json({ sessionUrl: session.url, orderId });
      }

      // ════════════════════════════════════════
      // 공통
      // ════════════════════════════════════════

      case 'payment-history': {
        const email = await getEmailFromSession(supabase, sessionToken);
        if (!email) return res.status(401).json({ error: '로그인이 필요합니다.' });

        const { data: payments } = await supabase
          .from('c2gen_payments')
          .select('id, provider, amount, credits, type, status, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(50);

        return res.json({ payments: payments || [] });
      }

      case 'verify-payment': {
        // 결제 완료 후 프론트에서 호출 (orderId로 확인)
        const { orderId } = params;
        if (!orderId) return res.status(400).json({ error: 'orderId required' });

        const { data: payment } = await supabase
          .from('c2gen_payments')
          .select('status, credits, email')
          .eq('provider_payment_id', orderId)
          .single();

        if (!payment) return res.status(404).json({ error: '결제 내역을 찾을 수 없습니다.' });

        return res.json({ status: payment.status, credits: payment.credits });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/payments] ${action} 실패:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// ── Stripe 웹훅 핸들러 ──

async function handleStripeWebhook(req: VercelRequest, res: VercelResponse) {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook secret not configured' });
  }

  try {
    // 웹훅 서명 검증 (stripe 라이브러리 없이 수동 검증)
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const event = JSON.parse(body);

    // checkout.session.completed 이벤트 처리
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId || session.client_reference_id;
      const credits = parseInt(session.metadata?.credits || '0');
      const email = session.metadata?.email || session.customer_email;

      if (!orderId || !credits || !email) {
        console.error('[stripe-webhook] Missing metadata:', { orderId, credits, email });
        return res.json({ received: true });
      }

      const supabase = getSupabase();

      // 이미 처리됐는지 확인
      const { data: existing } = await supabase
        .from('c2gen_payments')
        .select('status')
        .eq('provider_payment_id', orderId)
        .single();

      if (existing?.status === 'completed') {
        return res.json({ received: true, message: 'already processed' });
      }

      // 결제 완료 처리
      await supabase.from('c2gen_payments')
        .update({
          status: 'completed',
          metadata: { stripeSessionId: session.id, stripePaymentIntent: session.payment_intent },
        })
        .eq('provider_payment_id', orderId);

      // 크레딧 충전
      await supabase.rpc('add_credits', {
        p_email: email,
        p_amount: credits,
        p_type: 'charge',
        p_description: `크레딧 충전 (Stripe, ${session.amount_total?.toLocaleString()}원)`,
        p_reference_id: orderId,
      });

      console.log(`[stripe-webhook] ${email}에 ${credits} 크레딧 충전 완료 (${orderId})`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error('[stripe-webhook] Error:', error.message);
    return res.status(400).json({ error: error.message });
  }
}
