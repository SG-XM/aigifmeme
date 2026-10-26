import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  d1BatchGuard,
  isD1GuardConflict,
  runD1Batch,
} from '@/core/db/atomic-batch';
import { fulfillPayment } from '@/core/db/payment-fulfillment';
import {
  AlipayProvider,
  CreemProvider,
  PaymentManager,
  PayPalProvider,
  StripeProvider,
  WechatPayProvider,
} from '@/core/payment';
import {
  PaymentStatus,
  PaymentType,
  SubscriptionCycleType,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentOrder,
} from '@/core/payment/types';
import { envConfigs } from '@/config';
import { credit, order, subscription } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import { calculateCreditExpirationTime } from '@/modules/credits/service';
import {
  findByProviderSubscriptionId,
  findBySubscriptionNo,
  SubscriptionStatus,
  updateBySubscriptionNo,
  type NewSubscription,
  type UpdateSubscription,
} from '@/modules/subscriptions/service';
import { recordFunnelEvent } from '@/lib/funnel';
import { getSnowId, getUniSeq, getUuid } from '@/lib/hash';

// --- Order types ---

enum OrderStatus {
  PENDING = 'pending',
  CREATED = 'created',
  PAID = 'paid',
  FAILED = 'failed',
}

// --- Payment Manager ---

async function getPaymentManager(): Promise<PaymentManager> {
  const configs = await getAllConfigs(true);
  const c = (key: string) => configs[key] || '';
  // Provider instances contain credentials and webhook secrets. Build from the
  // current settings so key rotation and enabled switches take effect at once.
  const manager = new PaymentManager();

  const stripeKey = c('stripe_secret_key') || c('stripe_api_key');
  if (stripeKey) {
    const isDefault =
      !c('default_payment_provider') ||
      c('default_payment_provider') === 'stripe';
    manager.addProvider(
      new StripeProvider({
        secretKey: stripeKey,
        publishableKey: c('stripe_publishable_key'),
        signingSecret:
          c('stripe_signing_secret') || c('stripe_webhook_secret') || undefined,
        allowPromotionCodes: true,
        allowedPaymentMethods: ['card', 'wechat_pay', 'alipay'],
      }),
      isDefault
    );
  }

  if (c('creem_api_key')) {
    const isDefault = c('default_payment_provider') === 'creem';
    manager.addProvider(
      new CreemProvider({
        apiKey: c('creem_api_key'),
        signingSecret: c('creem_signing_secret') || undefined,
        environment:
          c('creem_environment') === 'production' ? 'production' : 'sandbox',
      }),
      isDefault
    );
  }

  if (c('paypal_client_id') && c('paypal_client_secret')) {
    manager.addProvider(
      new PayPalProvider({
        clientId: c('paypal_client_id'),
        clientSecret: c('paypal_client_secret'),
        webhookId: c('paypal_webhook_id') || undefined,
        environment:
          c('paypal_environment') === 'live' ? 'production' : 'sandbox',
      }),
      c('default_payment_provider') === 'paypal'
    );
  }

  if (c('alipay_app_id') && c('alipay_private_key') && c('alipay_public_key')) {
    const isDefault = c('default_payment_provider') === 'alipay';
    manager.addProvider(
      new AlipayProvider({
        appId: c('alipay_app_id'),
        privateKey: c('alipay_private_key'),
        alipayPublicKey: c('alipay_public_key'),
        notifyUrl: c('alipay_notify_url') || undefined,
      }),
      isDefault
    );
  }

  if (
    c('wechat_mch_id') &&
    c('wechat_private_key') &&
    c('wechat_api_v3_key') &&
    c('wechat_serial_no')
  ) {
    const isDefault = c('default_payment_provider') === 'wechat';
    manager.addProvider(
      new WechatPayProvider({
        appId: c('wechat_app_id'),
        mchId: c('wechat_mch_id'),
        apiV3Key: c('wechat_api_v3_key'),
        privateKey: c('wechat_private_key'),
        serialNo: c('wechat_serial_no'),
        notifyUrl: c('wechat_notify_url') || undefined,
        platformCert: c('wechat_platform_cert') || undefined,
      }),
      isDefault
    );
  }

  return manager;
}

// --- Checkout ---

async function createApplePayCheckout(params: {
  userId: string;
  userEmail?: string;
  paymentOrder: PaymentOrder;
  provider?: string;
  productName?: string;
  planName?: string;
  credits?: number;
  creditsValidDays?: number;
  abParticipantId?: string | null;
  isTest?: boolean;
  checkoutSource?: 'site' | 'email_recall';
  recallId?: string;
  orderNo: string;
  callbackSuccessUrl: string;
  stripe: StripeProvider;
}): Promise<CheckoutSession> {
  const { paymentOrder, orderNo, callbackSuccessUrl, stripe } = params;
  const paymentMethodId = paymentOrder.applePayPaymentMethodId || '';
  const priced = {
    provider: 'stripe',
    checkoutParams: {},
    metadata: paymentOrder.metadata || {},
  };
  const done = (
    sessionId: string,
    applePay: { status: string; client_secret?: string | null }
  ): CheckoutSession => ({
    ...priced,
    checkoutInfo: { sessionId, checkoutUrl: callbackSuccessUrl },
    checkoutResult: {
      applePay: {
        status: applePay.status,
        ...(applePay.status === 'requires_action' && applePay.client_secret
          ? { client_secret: applePay.client_secret }
          : {}),
      },
    },
  });

  const [existing] = await db()
    .select()
    .from(order)
    .where(and(eq(order.orderNo, orderNo), eq(order.userId, params.userId)))
    .limit(1);
  if (existing?.status === OrderStatus.PAID || existing?.paymentConfirmedAt) {
    return done(existing.paymentSessionId || orderNo, { status: 'succeeded' });
  }
  if (existing?.paymentSessionId?.startsWith('pi_')) {
    const current = await stripe
      .getPaymentSession({ sessionId: existing.paymentSessionId })
      .catch(() => null);
    const intentStatus = current?.paymentResult?.status as string | undefined;
    if (current?.paymentStatus === PaymentStatus.SUCCESS) {
      try {
        await handleCheckoutSuccess(current, 'stripe');
      } catch (error) {
        console.error(
          'apple pay fulfill error:',
          error instanceof Error ? error.message : 'failed'
        );
      }
      return done(existing.paymentSessionId, { status: 'succeeded' });
    }
    if (intentStatus === 'requires_action') {
      const secret = await stripe
        .applePayClientSecret(existing.paymentSessionId)
        .catch(() => null);
      if (secret)
        return done(existing.paymentSessionId, {
          status: 'requires_action',
          client_secret: secret,
        });
    }
    await stripe.cancelApplePayIntent(existing.paymentSessionId);
  }

  const orderValues = {
    userId: params.userId,
    userEmail: params.userEmail || '',
    abParticipantId:
      params.checkoutSource === 'email_recall'
        ? null
        : (params.abParticipantId ?? null),
    checkoutSource: params.checkoutSource || 'site',
    recallId: params.recallId || null,
    isTest: params.isTest ?? false,
    status: OrderStatus.CREATED,
    amount: paymentOrder.price?.amount || 0,
    currency: paymentOrder.price?.currency || 'usd',
    productId: paymentOrder.productId || '',
    productName: params.productName || null,
    planName: params.planName || null,
    creditsAmount: params.credits ?? null,
    creditsValidDays: params.creditsValidDays ?? null,
    paymentType: paymentOrder.type || 'one-time',
    paymentProvider: 'stripe',
    checkoutInfo: JSON.stringify({
      sessionId: '',
      checkoutUrl: callbackSuccessUrl,
    }),
    checkoutUrl: callbackSuccessUrl,
    description: paymentOrder.description || '',
  };
  if (existing) {
    await db()
      .update(order)
      .set(orderValues)
      .where(and(eq(order.id, existing.id), isNull(order.paymentConfirmedAt)));
  } else {
    await db()
      .insert(order)
      .values({ id: getUuid(), orderNo, ...orderValues });
  }

  const prepared = await stripe.createApplePayIntent({
    order: {
      ...paymentOrder,
      orderNo,
      metadata: { ...paymentOrder.metadata, order_no: orderNo },
    },
    paymentMethodId,
  });
  await db()
    .update(order)
    .set({
      paymentSessionId: prepared.paymentIntentId,
      checkoutInfo: JSON.stringify({
        sessionId: prepared.paymentIntentId,
        checkoutUrl: callbackSuccessUrl,
      }),
    })
    .where(
      and(
        eq(order.orderNo, orderNo),
        eq(order.userId, params.userId),
        isNull(order.paymentConfirmedAt)
      )
    );

  const confirmed = await stripe.confirmApplePayIntent(
    prepared.paymentIntentId,
    paymentMethodId
  );
  if (
    confirmed.status !== 'succeeded' &&
    confirmed.status !== 'requires_action' &&
    confirmed.status !== 'processing'
  ) {
    throw new Error(
      confirmed.last_payment_error?.message || 'Apple Pay was declined'
    );
  }
  if (confirmed.status === 'succeeded') {
    const session = await stripe.getPaymentSession({
      sessionId: confirmed.id,
    });
    if (
      session?.paymentStatus === PaymentStatus.SUCCESS &&
      (!prepared.subscriptionId || session.subscriptionInfo)
    ) {
      try {
        await handleCheckoutSuccess(session, 'stripe');
      } catch (error) {
        console.error(
          'apple pay fulfill error:',
          error instanceof Error ? error.message : 'failed'
        );
      }
    }
  }
  return done(confirmed.id, {
    status: confirmed.status,
    client_secret: confirmed.client_secret,
  });
}

export async function createCheckout(params: {
  userId: string;
  userEmail?: string;
  paymentOrder: PaymentOrder;
  provider?: string;
  productName?: string;
  planName?: string;
  credits?: number;
  creditsValidDays?: number;
  abParticipantId?: string | null;
  isTest?: boolean;
  checkoutSource?: 'site' | 'email_recall';
  recallId?: string;
}): Promise<CheckoutSession> {
  const {
    userId,
    userEmail,
    paymentOrder,
    provider,
    productName,
    planName,
    credits,
    creditsValidDays,
  } = params;
  const checkoutProductName =
    productName?.trim() || paymentOrder.productName?.trim();
  if (!checkoutProductName) {
    throw new Error('Product name is required to create a checkout');
  }
  const pm = await getPaymentManager();
  // Retention retries reuse both the provider idempotency key and order metadata.
  const orderNo =
    paymentOrder.requestId &&
    /^(retention_|recall_|duo_upgrade_)/.test(paymentOrder.requestId)
      ? paymentOrder.requestId
      : getUniSeq('ORD');
  if (
    params.checkoutSource === 'email_recall' &&
    !paymentOrder.applePayPaymentMethodId
  ) {
    if (!params.recallId) throw new Error('Recall attribution is required');
    const [saved] = await db()
      .select()
      .from(order)
      .where(
        and(
          eq(order.orderNo, orderNo),
          eq(order.userId, userId),
          eq(order.recallId, params.recallId)
        )
      )
      .limit(1);
    if (saved?.checkoutUrl && !saved.paymentConfirmedAt)
      return {
        provider: saved.paymentProvider,
        checkoutParams: {},
        metadata: {
          checkout_source: 'email_recall',
          recall_id: params.recallId,
        },
        checkoutInfo: JSON.parse(saved.checkoutInfo),
        checkoutResult: JSON.parse(saved.checkoutResult || '{}'),
      };
  }
  const configs = await getAllConfigs(true);
  const appUrl =
    configs.app_url || envConfigs.app_url || 'http://localhost:3000';

  // Resolve provider-specific product ID (e.g. Creem product_ids_mapping)
  const resolvedProvider =
    provider ||
    configs.default_payment_provider ||
    pm.getDefaultProvider()?.name;
  if (!resolvedProvider || configs[`${resolvedProvider}_enabled`] !== 'true') {
    throw new Error(
      `Payment provider '${resolvedProvider || 'default'}' is not enabled`
    );
  }
  let resolvedProductId = paymentOrder.productId;
  if (resolvedProvider === 'creem' && paymentOrder.productId) {
    const mapping = configs.creem_product_ids_mapping;
    let map: Record<string, unknown>;
    try {
      map = JSON.parse(mapping || '{}') as Record<string, unknown>;
    } catch {
      throw new Error('Creem product mapping is invalid JSON');
    }
    const externalId = map[paymentOrder.productId];
    if (typeof externalId !== 'string' || !externalId.startsWith('prod_')) {
      throw new Error(
        `Creem product mapping is missing for ${paymentOrder.productId}`
      );
    }
    resolvedProductId = externalId;
  }

  const finalSuccessUrl =
    paymentOrder.successUrl || `${appUrl}/settings/billing?success=1`;
  const callbackSuccessUrl = `${appUrl}/api/payment/callback?order_no=${orderNo}&redirect=${encodeURIComponent(finalSuccessUrl)}`;

  if (paymentOrder.applePayPaymentMethodId) {
    if (resolvedProvider !== 'stripe') {
      throw new Error('Apple Pay requires Stripe');
    }
    const stripe = pm.getProvider('stripe');
    if (!(stripe instanceof StripeProvider)) {
      throw new Error('Apple Pay requires Stripe');
    }
    return createApplePayCheckout({
      ...params,
      orderNo,
      callbackSuccessUrl,
      stripe,
      productName: checkoutProductName,
    });
  }

  const session = await pm.createPayment({
    order: {
      ...paymentOrder,
      productName: checkoutProductName,
      metadata: { ...paymentOrder.metadata, order_no: orderNo },
      productId: resolvedProductId,
      orderNo,
      successUrl: callbackSuccessUrl,
      cancelUrl:
        paymentOrder.cancelUrl || `${appUrl}/settings/billing?canceled=1`,
    },
    provider: resolvedProvider,
  });

  await db()
    .insert(order)
    .values({
      id: getUuid(),
      orderNo,
      userId,
      userEmail: userEmail || '',
      abParticipantId:
        params.checkoutSource === 'email_recall'
          ? null
          : (params.abParticipantId ?? null),
      checkoutSource: params.checkoutSource || 'site',
      recallId: params.recallId || null,
      isTest: params.isTest ?? false,
      status: OrderStatus.CREATED,
      amount: paymentOrder.price?.amount || 0,
      currency: paymentOrder.price?.currency || 'usd',
      productId: paymentOrder.productId || '',
      productName: productName || null,
      planName: planName || null,
      creditsAmount: credits ?? null,
      creditsValidDays: creditsValidDays ?? null,
      paymentType: paymentOrder.type || 'one-time',
      paymentProvider: session.provider,
      paymentSessionId: session.checkoutInfo.sessionId,
      checkoutInfo: JSON.stringify(session.checkoutInfo),
      checkoutResult: JSON.stringify(session.checkoutResult),
      checkoutUrl: session.checkoutInfo.checkoutUrl,
      description: paymentOrder.description || '',
    });

  return session;
}

// --- Payment callback (return_url) ---

export async function handlePaymentCallback(orderNo: string) {
  // Find the order
  const [existingOrder] = await db()
    .select()
    .from(order)
    .where(eq(order.orderNo, orderNo))
    .limit(1);

  if (!existingOrder) return;
  if (
    existingOrder.status === OrderStatus.PAID ||
    existingOrder.paymentConfirmedAt
  )
    return;

  // Query the payment provider for latest status
  const pm = await getPaymentManager();
  const provider = pm.getProvider(existingOrder.paymentProvider);
  if (!provider) return;

  const session = await provider.getPaymentSession({
    sessionId: existingOrder.paymentSessionId || existingOrder.orderNo,
  });

  // Reuse the same atomic success handler as the webhook so that
  // subscriptions are created and credits granted on synchronous return too.
  // This is important in environments where webhooks aren't reachable (e.g. localhost).
  await handleCheckoutSuccess(session, existingOrder.paymentProvider);
}

// --- Webhook handling ---

export async function handleWebhook(params: {
  req: Request;
  provider: string;
}): Promise<PaymentEvent> {
  const pm = await getPaymentManager();
  const event = await pm.getPaymentEvent({
    req: params.req,
    provider: params.provider,
  });
  const session = event.paymentSession;
  if (!session) return event;

  const eventType = event.eventType;

  // Route event to appropriate handler
  if (eventType === 'checkout.success') {
    await handleCheckoutSuccess(session, params.provider);
  } else if (eventType === 'payment.success') {
    if (
      session.paymentInfo?.subscriptionCycleType ===
      SubscriptionCycleType.RENEWAL
    ) {
      await handleSubscriptionRenewal(session, params.provider);
    } else {
      await handleCheckoutSuccess(session, params.provider);
    }
  } else if (eventType === 'subscribe.updated') {
    await handleSubscriptionUpdated(session, params.provider);
  } else if (eventType === 'subscribe.canceled') {
    await handleSubscriptionCanceled(session, params.provider);
  }

  return event;
}

// --- Checkout Success: update order + create subscription + grant credits ---

async function handleCheckoutSuccess(session: any, provider: string) {
  // Different providers expose the session identifier under different keys.
  // We try the common shapes; for Alipay the natural key is out_trade_no
  // (which equals our orderNo and the value we stored in paymentSessionId).
  const result = session.paymentResult || {};
  const sessionId: string =
    result.id ||
    result.object?.id ||
    result.out_trade_no ||
    result.outTradeNo ||
    '';
  const metadataOrderNo = session.metadata?.order_no;
  if (!sessionId && !metadataOrderNo && !session.subscriptionId) return;

  // Find order by session ID
  const [existingOrder] = await db()
    .select()
    .from(order)
    .where(
      and(
        eq(order.paymentProvider, provider),
        isNull(order.deletedAt),
        sessionId && provider !== 'paypal'
          ? eq(order.paymentSessionId, sessionId)
          : metadataOrderNo
            ? eq(order.orderNo, metadataOrderNo)
            : eq(order.paymentSessionId, session.subscriptionId || sessionId)
      )
    )
    .limit(1);

  if (!existingOrder) return;

  // Idempotency: skip if already paid
  if (
    existingOrder.status === OrderStatus.PAID ||
    existingOrder.paymentConfirmedAt
  )
    return;
  if (
    existingOrder.status !== OrderStatus.CREATED &&
    existingOrder.status !== OrderStatus.PENDING &&
    existingOrder.status !== OrderStatus.FAILED
  )
    return;

  const paymentInfo = session.paymentInfo;
  const subscriptionInfo = session.subscriptionInfo;

  if (session.paymentStatus === PaymentStatus.SUCCESS) {
    if (
      paymentInfo?.paymentCurrency &&
      paymentInfo.paymentCurrency.toLowerCase() !==
        existingOrder.currency.toLowerCase()
    ) {
      throw new Error(
        `Payment currency mismatch for order ${existingOrder.orderNo}`
      );
    }
    // Creem charges the external mapped product price rather than our catalog
    // amount. A stale mapping must not grant full credits for a cheaper item.
    if (
      provider === 'creem' &&
      (!Number.isFinite(paymentInfo?.paymentAmount) ||
        paymentInfo.paymentAmount < existingOrder.amount)
    ) {
      throw new Error(
        `Payment amount mismatch for order ${existingOrder.orderNo}`
      );
    }
    // Prepare order update
    const orderUpdate: Record<string, any> = {
      status: OrderStatus.PAID,
      paymentResult: JSON.stringify(session.paymentResult),
      paymentAmount: paymentInfo?.paymentAmount ?? null,
      paymentConfirmedAt: new Date(),
      paymentCurrency: paymentInfo?.paymentCurrency || null,
      paymentEmail: paymentInfo?.paymentEmail || null,
      paidAt: paymentInfo?.paidAt || new Date(),
      transactionId: paymentInfo?.transactionId || null,
      invoiceId: paymentInfo?.invoiceId || null,
      invoiceUrl: paymentInfo?.invoiceUrl || null,
      paymentUserName: paymentInfo?.paymentUserName || null,
      paymentUserId: paymentInfo?.paymentUserId || null,
      discountCode: paymentInfo?.discountCode || null,
      discountAmount: paymentInfo?.discountAmount || null,
    };

    // Atomically update order + create subscription + grant credits
    const inserts: Parameters<typeof fulfillPayment>[2] = [];
    // 1. Create subscription if applicable
    if (subscriptionInfo && session.subscriptionId) {
      const subNo = getSnowId();
      const newSub: any = {
        id: getUuid(),
        subscriptionNo: subNo,
        userId: existingOrder.userId,
        userEmail: existingOrder.userEmail || existingOrder.paymentEmail || '',
        status: subscriptionInfo.status || SubscriptionStatus.ACTIVE,
        paymentProvider: provider,
        subscriptionId: session.subscriptionId,
        subscriptionResult: JSON.stringify(session.subscriptionResult),
        productId: existingOrder.productId,
        description: subscriptionInfo.description || 'Subscription Created',
        amount: subscriptionInfo.amount,
        currency: subscriptionInfo.currency,
        interval: subscriptionInfo.interval,
        intervalCount: subscriptionInfo.intervalCount,
        trialPeriodDays: subscriptionInfo.trialPeriodDays,
        currentPeriodStart: subscriptionInfo.currentPeriodStart,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        billingUrl: subscriptionInfo.billingUrl,
        planName: existingOrder.planName || existingOrder.productName,
        productName: existingOrder.productName,
        creditsAmount: existingOrder.creditsAmount,
        creditsValidDays: existingOrder.creditsValidDays,
        paymentProductId: existingOrder.paymentProductId,
        paymentUserId: paymentInfo?.paymentUserId,
      };
      inserts.push({ table: subscription, values: newSub });
      orderUpdate.subscriptionNo = subNo;
      orderUpdate.subscriptionId = session.subscriptionId;
      orderUpdate.subscriptionResult = JSON.stringify(
        session.subscriptionResult
      );
    }

    // 2. Grant credits if applicable
    if (existingOrder.creditsAmount && existingOrder.creditsAmount > 0) {
      const credits = existingOrder.creditsAmount;
      const expiresAt = calculateCreditExpirationTime({
        creditsValidDays: existingOrder.creditsValidDays || 0,
        currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
      });

      inserts.push({
        table: credit,
        values: {
          id: getUuid(),
          userId: existingOrder.userId,
          userEmail: existingOrder.userEmail || '',
          orderNo: existingOrder.orderNo,
          subscriptionNo: orderUpdate.subscriptionNo || '',
          transactionNo: getSnowId(),
          transactionType: 'grant',
          transactionScene:
            existingOrder.paymentType === 'subscription'
              ? 'subscription'
              : 'payment',
          credits,
          remainingCredits: credits,
          description: 'Grant credit',
          expiresAt,
          status: 'active',
        },
      });
    }

    await fulfillPayment(existingOrder.id, orderUpdate, inserts);
    if (!existingOrder.isTest) {
      try {
        await recordFunnelEvent(
          existingOrder.checkoutSource === 'email_recall'
            ? 'recall_payment_succeeded'
            : 'payment_succeeded',
          existingOrder.userId,
          existingOrder.userId
        );
      } catch {
        // Funnel persistence must not interfere with payment fulfillment.
      }
    }
  } else if (
    session.paymentStatus === PaymentStatus.FAILED ||
    session.paymentStatus === PaymentStatus.CANCELED
  ) {
    await db()
      .update(order)
      .set({
        status: OrderStatus.FAILED,
        paymentResult: JSON.stringify(session.paymentResult),
      })
      .where(
        and(
          eq(order.id, existingOrder.id),
          isNull(order.paymentConfirmedAt),
          inArray(order.status, [
            OrderStatus.CREATED,
            OrderStatus.PENDING,
            OrderStatus.FAILED,
          ])
        )
      );
  }
}

// --- Subscription Renewal ---

export async function handleSubscriptionRenewal(
  session: any,
  provider: string
) {
  if (!session.subscriptionId || !session.subscriptionInfo) return;

  const existingSub = await findByProviderSubscriptionId({
    provider,
    subscriptionId: session.subscriptionId,
  });
  if (!existingSub || !existingSub.amount || !existingSub.currency) return;

  const subscriptionInfo = session.subscriptionInfo;
  if (
    !subscriptionInfo.currentPeriodStart ||
    !subscriptionInfo.currentPeriodEnd
  )
    return;

  if (session.paymentStatus !== PaymentStatus.SUCCESS) return;

  const paymentInfo = session.paymentInfo;

  // Idempotency: drop duplicate renewals for the same provider transaction.
  if (paymentInfo?.transactionId) {
    const [dup] = await db()
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.transactionId, paymentInfo.transactionId),
          eq(order.paymentProvider, provider)
        )
      )
      .limit(1);
    if (dup) return;
  }

  const renewalOrderNo = getSnowId();
  const cycle = JSON.stringify({
    renewalPeriodStart: subscriptionInfo.currentPeriodStart.toISOString(),
    renewalPeriodEnd: subscriptionInfo.currentPeriodEnd.toISOString(),
  });

  const execute = async (tx: any) => {
    if (envConfigs.database_provider !== 'd1') {
      const [current] = await tx
        .select()
        .from(subscription)
        .where(eq(subscription.id, existingSub.id))
        .for('update')
        .limit(1);
      if (!current) return;
      const [alreadyGranted] = await tx
        .select({ id: order.id })
        .from(order)
        .where(
          and(
            eq(order.subscriptionNo, existingSub.subscriptionNo),
            eq(order.paymentType, 'renew'),
            eq(order.checkoutInfo, cycle)
          )
        )
        .limit(1);
      if (alreadyGranted) return;
    }
    const writes: any[] = [];
    // 1. Update subscription period
    writes.push(
      tx
        .update(subscription)
        .set({
          currentPeriodStart: subscriptionInfo.currentPeriodStart,
          currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        })
        .where(
          and(
            eq(subscription.subscriptionNo, existingSub.subscriptionNo),
            sql`(${subscription.currentPeriodEnd} is null or ${subscription.currentPeriodEnd} <= ${subscriptionInfo.currentPeriodEnd.getTime()})`
          )
        )
    );

    // 2. Create renewal order
    writes.push(
      tx.insert(order).values({
        id: getUuid(),
        orderNo: renewalOrderNo,
        userId: existingSub.userId,
        userEmail: existingSub.userEmail || '',
        status: OrderStatus.PAID,
        amount: existingSub.amount,
        currency: existingSub.currency,
        productId: existingSub.productId || '',
        paymentType: 'renew',
        paymentInterval: existingSub.interval || '',
        paymentProvider: provider,
        checkoutInfo: cycle,
        description: 'Subscription Renewal',
        productName: existingSub.productName || '',
        planName: existingSub.planName || '',
        creditsAmount: existingSub.creditsAmount,
        creditsValidDays: existingSub.creditsValidDays,
        paymentProductId: existingSub.paymentProductId || '',
        paymentResult: JSON.stringify(session.paymentResult),
        paymentAmount: paymentInfo?.paymentAmount,
        paymentCurrency: paymentInfo?.paymentCurrency,
        paymentEmail: paymentInfo?.paymentEmail,
        paidAt: paymentInfo?.paidAt || new Date(),
        invoiceId: paymentInfo?.invoiceId,
        invoiceUrl: paymentInfo?.invoiceUrl,
        subscriptionNo: existingSub.subscriptionNo,
        subscriptionId: session.subscriptionId,
        transactionId: paymentInfo?.transactionId,
        paymentUserName: paymentInfo?.paymentUserName,
        paymentUserId: paymentInfo?.paymentUserId,
      })
    );

    // 3. Grant credits for renewal
    if (existingSub.creditsAmount && existingSub.creditsAmount > 0) {
      const credits = existingSub.creditsAmount;
      const expiresAt = calculateCreditExpirationTime({
        creditsValidDays: existingSub.creditsValidDays || 0,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
      });

      writes.push(
        tx.insert(credit).values({
          id: getUuid(),
          userId: existingSub.userId,
          userEmail: existingSub.userEmail || '',
          orderNo: renewalOrderNo,
          subscriptionNo: existingSub.subscriptionNo,
          transactionNo: getSnowId(),
          transactionType: 'grant',
          transactionScene: 'renewal',
          credits,
          remainingCredits: credits,
          description: 'Grant credit',
          expiresAt,
          status: 'active',
        })
      );
    }
    if (envConfigs.database_provider === 'd1') {
      try {
        await runD1Batch([
          d1BatchGuard(
            sql`exists (select 1 from ${subscription} where ${subscription.id} = ${existingSub.id}) and not exists (select 1 from ${order} where ${order.subscriptionNo} = ${existingSub.subscriptionNo} and ${order.paymentType} = 'renew' and ${order.checkoutInfo} = ${cycle})`
          ),
          ...writes.map((query) => query.toSQL()),
        ]);
      } catch (error) {
        if (!isD1GuardConflict(error)) throw error;
      }
    } else {
      for (const query of writes) await query;
    }
  };
  if (envConfigs.database_provider === 'd1') await execute(db());
  else await db().transaction(execute);
}

// --- Subscription Updated ---

async function handleSubscriptionUpdated(session: any, provider: string) {
  if (!session.subscriptionId || !session.subscriptionInfo) return;

  const existingSub = await findByProviderSubscriptionId({
    provider,
    subscriptionId: session.subscriptionId,
  });
  if (!existingSub) return;

  const info = session.subscriptionInfo;
  await updateBySubscriptionNo(existingSub.subscriptionNo, {
    status: info.status,
    currentPeriodStart: info.currentPeriodStart,
    currentPeriodEnd: info.currentPeriodEnd,
    canceledAt: info.canceledAt || null,
    canceledEndAt: info.canceledEndAt || null,
    canceledReason: info.canceledReason || '',
    canceledReasonType: info.canceledReasonType || '',
  });
}

// --- Subscription Canceled ---

async function handleSubscriptionCanceled(session: any, provider: string) {
  if (!session.subscriptionId || !session.subscriptionInfo) return;

  const existingSub = await findByProviderSubscriptionId({
    provider,
    subscriptionId: session.subscriptionId,
  });
  if (!existingSub) return;

  const info = session.subscriptionInfo;
  await updateBySubscriptionNo(existingSub.subscriptionNo, {
    status: SubscriptionStatus.CANCELED,
    canceledAt: info.canceledAt,
    canceledEndAt: info.canceledEndAt,
    canceledReason: info.canceledReason,
    canceledReasonType: info.canceledReasonType,
  });
}

// --- Cancel subscription (user-initiated) ---

export async function cancelUserSubscription(params: {
  userId: string;
  subscriptionNo: string;
}) {
  const { userId, subscriptionNo } = params;

  const sub = await findBySubscriptionNo(subscriptionNo);
  if (!sub) throw new Error('Subscription not found');
  if (sub.userId !== userId) throw new Error('Forbidden');

  if (
    sub.status === SubscriptionStatus.CANCELED ||
    sub.status === SubscriptionStatus.EXPIRED
  ) {
    return sub;
  }

  const pm = await getPaymentManager();
  const provider = pm.getProvider(sub.paymentProvider);
  if (!provider || !provider.cancelSubscription) {
    throw new Error('Cancellation not supported for this provider');
  }

  const session = await provider.cancelSubscription({
    subscriptionId: sub.subscriptionId,
  });

  const info = session.subscriptionInfo;
  const updated = await updateBySubscriptionNo(subscriptionNo, {
    status: info?.status || SubscriptionStatus.CANCELED,
    canceledAt: info?.canceledAt || new Date(),
    canceledEndAt: info?.canceledEndAt || null,
    canceledReason: info?.canceledReason || 'Canceled by user',
    canceledReasonType: info?.canceledReasonType || 'user_request',
  });

  return updated;
}

// --- Query helpers ---

export async function getUserOrders(userId: string) {
  return db()
    .select()
    .from(order)
    .where(and(eq(order.userId, userId), isNull(order.deletedAt)))
    .orderBy(desc(order.createdAt));
}
