import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { PaymentInterval, PaymentType } from '@/core/payment/types';
import { envConfigs } from '@/config';
import {
  getCheckoutParticipant,
  getVisitorCheckoutParticipant,
  isExposedSceneVariant,
} from '@/modules/ab-tests/service';
import { getAllConfigs } from '@/modules/config/service';
import { requireCurrentCreditPricing } from '@/modules/credits/service';
import {
  finishDuoUpgradeCheckout,
  recoverDuoUpgradeCheckout,
  reserveDuoUpgradeCheckout,
} from '@/modules/duo-upgrade/service';
import {
  finishRecallCheckout,
  reserveRecallCheckout,
} from '@/modules/email-recall/service';
import { createCheckout } from '@/modules/payment/service';
import { getEnabledSubscriptionPlan } from '@/modules/subscription-plans/service';
import { getEnabledTopUpProduct } from '@/modules/top-up-products/service';
import {
  finishRetentionCheckout,
  recoverRetentionCheckout,
  reserveRetentionCheckout,
} from '@/modules/video-retention-offers/service';
import { AB_VISITOR_COOKIE, isABMutationAllowed } from '@/lib/ab-tests';
import {
  CHECKOUT_CANCEL_PARAM,
  CHECKOUT_PRODUCT_PARAM,
} from '@/lib/checkout-resume';
import { getCookieFromHeader } from '@/lib/cookie';
import { DUO_UPGRADE_PRODUCT_ID } from '@/lib/duo-upgrade';
import { recallLocale } from '@/lib/email-recall';
import { recordFunnelEvent } from '@/lib/funnel';
import {
  sanitizeFunnelMetadata,
  type FunnelEventMetadata,
} from '@/lib/funnel-events';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { regionalPrice } from '@/lib/regional-pricing';
import { respData, respErr } from '@/lib/resp';
import {
  isRetentionOfferProduct,
  RETENTION_NAME_PRICE_SCENE,
  retentionCheckoutLabel,
  retentionNamePriceCents,
} from '@/lib/video-retention-offer';
import { getLocale, localizeUrl } from '@/paraglide/runtime.js';

type LocalizedPlan = {
  nameEn: string;
  nameZh: string;
  nameEs: string;
  descriptionEn: string;
  descriptionZh: string;
  descriptionEs: string;
};

function localizedPlanValue(
  plan: LocalizedPlan,
  field: 'name' | 'description',
  locale = getLocale()
) {
  if (field === 'name') {
    return locale === 'zh'
      ? plan.nameZh
      : locale === 'es'
        ? plan.nameEs || plan.nameEn
        : plan.nameEn;
  }
  return locale === 'zh'
    ? plan.descriptionZh
    : locale === 'es'
      ? plan.descriptionEs || plan.descriptionEn
      : plan.descriptionEn;
}

async function recordCheckoutCreateFailed(
  request: Request,
  userId: string | null | undefined,
  metadata: FunnelEventMetadata
) {
  try {
    const raw = getCookieFromHeader(
      request.headers.get('cookie'),
      AB_VISITOR_COOKIE
    );
    const visitorId = raw && raw.length <= 64 ? raw : userId || 'anonymous';
    await recordFunnelEvent(
      'checkout_create_failed',
      visitorId,
      userId,
      sanitizeFunnelMetadata({ ...metadata, source: 'server' })
    );
  } catch {
    // A failed analytic write must still return the checkout error.
  }
}

function safeSameOriginPath(
  input: string | undefined | null,
  fallbackPath: string,
  baseUrl: string
): string {
  if (!input) return fallbackPath;
  try {
    const appUrl = new URL(baseUrl);
    const candidate = new URL(input, appUrl);
    if (candidate.origin !== appUrl.origin) return fallbackPath;
    return candidate.pathname + candidate.search + candidate.hash;
  } catch {
    return fallbackPath;
  }
}

export async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request))
    return respErr('Forbidden', { status: 403 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'checkout',
  });
  if (limited) return limited;

  let recallReservation:
    | Awaited<ReturnType<typeof reserveRecallCheckout>>
    | undefined;
  let retentionLocked: string | undefined;
  let retentionUserId: string | undefined;
  let testCheckout = false;
  let checkoutUserId: string | null = null;
  let failureMeta: FunnelEventMetadata = {};
  const failCheckout = async (errorCode: string, errorMessage: string) => {
    if (!testCheckout) {
      await recordCheckoutCreateFailed(request, checkoutUserId, {
        ...failureMeta,
        errorCode,
        errorMessage,
      });
    }
    return respErr(errorMessage);
  };
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return failCheckout('unauthorized', 'Unauthorized');
    }
    checkoutUserId = session.user.id;

    const body = await request.json().catch(() => ({}));
    let applePayPaymentMethodId: string | undefined;
    if (
      body?.apple_pay_payment_method != null &&
      body.apple_pay_payment_method !== ''
    ) {
      const candidate = body.apple_pay_payment_method;
      if (
        typeof candidate !== 'string' ||
        !/^pm_[A-Za-z0-9]{10,80}$/.test(candidate)
      ) {
        return failCheckout('invalid_payment_method', 'Invalid payment method');
      }
      applePayPaymentMethodId = candidate;
    }
    const requested = sanitizeFunnelMetadata({
      productId: body?.product_id,
      placement: body?.placement,
    });
    if (requested) failureMeta = requested;
    let { product_id, payment_provider, redirect, ab_participant_id } = body;
    if (body.recall_token !== undefined) {
      recallReservation = await reserveRecallCheckout(
        body.recall_token,
        session.user.id
      );
      if (recallReservation.checkoutUrl)
        return respData(
          { checkout_url: recallReservation.checkoutUrl },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      product_id = recallReservation.row.productId;
      payment_provider = recallReservation.row.paymentProvider || undefined;
      redirect = '/create';
    }

    if (!product_id || typeof product_id !== 'string') {
      return failCheckout('missing_product', 'Missing product_id');
    }

    let checkoutRedirect = redirect;
    await requireCurrentCreditPricing();

    // Post-purchase Duo upgrade: price and credits are derived server-side
    // from the buyer's own paid single order, never from the request body.
    let duoUpgrade:
      | Awaited<ReturnType<typeof reserveDuoUpgradeCheckout>>
      | undefined;
    if (product_id === DUO_UPGRADE_PRODUCT_ID) {
      if (payment_provider && payment_provider !== 'stripe')
        return failCheckout(
          'stripe_required',
          'This upgrade uses Stripe checkout'
        );
      const originalOrderNo =
        typeof body?.upgrade_of_order_id === 'string'
          ? body.upgrade_of_order_id
          : '';
      if (!originalOrderNo)
        return failCheckout(
          'missing_upgrade_order',
          'Missing upgrade_of_order_id'
        );
      duoUpgrade = await reserveDuoUpgradeCheckout(
        session.user.id,
        originalOrderNo
      );
      if ('checkoutUrl' in duoUpgrade && duoUpgrade.checkoutUrl)
        return respData(
          { checkout_url: duoUpgrade.checkoutUrl },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      checkoutRedirect = '/create';
    }

    // Look up product in the authoritative server-side catalog.
    // We DO NOT trust price / credits / plan from the request body.
    const planProduct = duoUpgrade
      ? null
      : await getEnabledSubscriptionPlan(product_id);
    const topUpProduct = planProduct
      ? null
      : await getEnabledTopUpProduct(product_id);
    const locale = recallReservation
      ? recallLocale(recallReservation.row.locale)
      : getLocale();
    const product = planProduct
      ? {
          productId: planProduct.productId,
          productName: localizedPlanValue(planProduct, 'name', locale),
          planName: localizedPlanValue(planProduct, 'name', locale),
          description:
            localizedPlanValue(planProduct, 'description', locale) ||
            planProduct.nameEn,
          type: PaymentType.SUBSCRIPTION,
          priceInCents: planProduct.priceInCents,
          currency: planProduct.currency,
          credits: planProduct.credits,
          creditsValidDays: planProduct.creditsValidDays,
          plan: {
            name: localizedPlanValue(planProduct, 'name', locale),
            interval: planProduct.interval as PaymentInterval,
            intervalCount: planProduct.intervalCount,
          },
        }
      : topUpProduct
        ? {
            productId: topUpProduct.productId,
            productName:
              locale === 'es'
                ? topUpProduct.nameEs || topUpProduct.name
                : topUpProduct.name,
            planName: locale === 'es' ? 'Paquete de créditos' : 'Credit top-up',
            description:
              locale === 'es'
                ? topUpProduct.descriptionEs || topUpProduct.description
                : topUpProduct.description,
            type: PaymentType.ONE_TIME,
            priceInCents: topUpProduct.priceInCents,
            currency: topUpProduct.currency,
            credits: topUpProduct.credits,
            creditsValidDays: topUpProduct.creditsValidDays,
          }
        : null;
    const catalogProduct =
      product && isRetentionOfferProduct(product.productId)
        ? { ...product, ...retentionCheckoutLabel(product.productId, locale) }
        : product;
    const upgradeProduct = duoUpgrade
      ? {
          productId: DUO_UPGRADE_PRODUCT_ID,
          productName: 'Duo Pack upgrade',
          planName: 'Credit top-up',
          description: `Duo Pack upgrade for order ${duoUpgrade.original.orderNo}`,
          type: PaymentType.ONE_TIME,
          priceInCents: duoUpgrade.differenceInCents,
          currency: 'usd',
          credits: duoUpgrade.remainingCredits,
          creditsValidDays: duoUpgrade.duo.creditsValidDays,
        }
      : null;
    const resolvedProduct = upgradeProduct ?? catalogProduct;
    if (!resolvedProduct) {
      return failCheckout('unknown_product', 'Unknown product');
    }
    const isRetention = isRetentionOfferProduct(resolvedProduct.productId);
    const pricedProduct =
      isRetention || duoUpgrade
        ? resolvedProduct
        : regionalPrice(resolvedProduct, request);
    failureMeta = {
      ...failureMeta,
      productId: resolvedProduct.productId,
      priceInCents: pricedProduct.priceInCents,
      currency: pricedProduct.currency,
    };

    const configs = await getAllConfigs(true);
    if (applePayPaymentMethodId) {
      if (configs.stripe_enabled !== 'true') {
        return failCheckout('stripe_required', 'Apple Pay requires Stripe');
      }
      payment_provider = 'stripe';
    }
    const providerKey = payment_provider || configs.default_payment_provider;
    if (
      (providerKey === 'alipay' || providerKey === 'wechat') &&
      pricedProduct.currency.toLowerCase() !== 'cny'
    ) {
      return failCheckout(
        'currency_mismatch',
        `${providerKey} requires a CNY-priced product`
      );
    }

    if (
      duoUpgrade &&
      (providerKey !== 'stripe' || configs.stripe_enabled !== 'true')
    )
      return failCheckout(
        'stripe_required',
        'This upgrade uses Stripe checkout'
      );

    if (isRetention) {
      if (providerKey !== 'stripe' || configs.stripe_enabled !== 'true')
        return failCheckout(
          'stripe_required',
          'This offer uses Stripe checkout'
        );
      const chip = retentionNamePriceCents(resolvedProduct.productId);
      if (chip != null) {
        if (
          pricedProduct.priceInCents !== chip ||
          resolvedProduct.credits !== 10 ||
          pricedProduct.currency.toLowerCase() !== 'usd'
        )
          return failCheckout(
            'offer_misconfigured',
            'This offer is not available.'
          );
        const allowed = await isExposedSceneVariant(
          ab_participant_id,
          session.user.id,
          RETENTION_NAME_PRICE_SCENE,
          'B',
          'topup'
        );
        if (!allowed)
          return failCheckout(
            'offer_unavailable',
            'This offer is not available.'
          );
      }
      const reservation = await reserveRetentionCheckout(
        session.user.id,
        resolvedProduct.productId
      );
      if (reservation.checkoutUrl)
        return respData(
          { checkout_url: reservation.checkoutUrl },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      retentionLocked = reservation.locked;
      retentionUserId = session.user.id;
      checkoutRedirect = reservation.state!.redirect;
    }

    // Build success/cancel URLs — only accept same-origin redirects.
    const baseUrl =
      configs.app_url || envConfigs.app_url || 'http://localhost:3000';
    // Straight to the destination, which safeSameOriginPath has already
    // reduced to a path on this site. Callers that care (credit top-ups,
    // admin flows) pass their own `redirect`; otherwise return to creation.
    const redirectPath = safeSameOriginPath(
      checkoutRedirect,
      '/create',
      baseUrl
    );
    const finalRedirect = localizeUrl(`${baseUrl}${redirectPath}`, {
      locale,
    }).href;
    const successUrl = `${baseUrl}/api/payment/callback?redirect=${encodeURIComponent(finalRedirect)}`;
    const cancelTarget = new URL(`${baseUrl}/pricing`);
    cancelTarget.searchParams.set(CHECKOUT_CANCEL_PARAM, '1');
    cancelTarget.searchParams.set(
      CHECKOUT_PRODUCT_PARAM,
      resolvedProduct.productId
    );
    const cancelUrl = localizeUrl(cancelTarget.href, { locale }).href;

    // Missing/expired analytics attribution never prevents a valid payment.
    const visitorId = getCookieFromHeader(
      request.headers.get('cookie'),
      AB_VISITOR_COOKIE
    );
    const abParticipantId = recallReservation
      ? null
      : typeof ab_participant_id === 'string' && ab_participant_id.length <= 64
        ? await getCheckoutParticipant(
            ab_participant_id,
            session.user.id,
            planProduct ? 'subscription' : 'topup'
          ).catch(() => null)
        : visitorId
          ? await getVisitorCheckoutParticipant(
              visitorId,
              session.user.id,
              planProduct ? 'subscription' : 'topup'
            ).catch(() => null)
          : null;

    testCheckout =
      (providerKey === 'creem' && configs.creem_environment !== 'production') ||
      (providerKey === 'paypal' && configs.paypal_environment !== 'live') ||
      (providerKey === 'stripe' &&
        (configs.stripe_secret_key || configs.stripe_api_key || '').startsWith(
          'sk_test_'
        ));
    const isTest = testCheckout;
    const checkout = await createCheckout({
      abParticipantId,
      isTest,
      checkoutSource: recallReservation ? 'email_recall' : 'site',
      recallId: recallReservation?.row.id,
      userId: session.user.id,
      userEmail: session.user.email,
      productName: resolvedProduct.productName,
      planName: resolvedProduct.planName,
      credits: resolvedProduct.credits,
      creditsValidDays: resolvedProduct.creditsValidDays,
      paymentOrder: {
        requestId:
          recallReservation?.requestId ||
          (retentionLocked
            ? `retention_${JSON.parse(retentionLocked).token}`
            : duoUpgrade && 'token' in duoUpgrade
              ? `duo_upgrade_${duoUpgrade.token}`
              : undefined),
        metadata: recallReservation
          ? {
              checkout_source: 'email_recall',
              recall_id: recallReservation.row.id,
              campaign: 'email-recall-v1',
            }
          : duoUpgrade
            ? {
                upgrade_of_order_id: duoUpgrade.original.id,
                upgrade_of_order_no: duoUpgrade.original.orderNo,
                credits_to_grant: String(duoUpgrade.remainingCredits),
              }
            : undefined,
        productId: resolvedProduct.productId,
        productName: resolvedProduct.productName,
        price: {
          amount: pricedProduct.priceInCents,
          currency: pricedProduct.currency,
        },
        type: resolvedProduct.type,
        description: resolvedProduct.description,
        successUrl,
        cancelUrl,
        customer: {
          email: session.user.email,
          name: session.user.name,
        },
        plan:
          'plan' in resolvedProduct && resolvedProduct.plan
            ? {
                name: resolvedProduct.plan.name,
                interval: resolvedProduct.plan.interval,
                intervalCount: resolvedProduct.plan.intervalCount,
              }
            : undefined,
        applePayPaymentMethodId,
      },
      provider: payment_provider,
    });

    if (recallReservation)
      await finishRecallCheckout(
        recallReservation.row.id,
        recallReservation.lock,
        checkout.checkoutInfo.checkoutUrl
      );
    if (retentionLocked)
      await finishRetentionCheckout(
        session.user.id,
        retentionLocked,
        checkout.checkoutInfo.checkoutUrl
      );
    if (duoUpgrade && 'locked' in duoUpgrade && duoUpgrade.locked)
      await finishDuoUpgradeCheckout(
        duoUpgrade.original.orderNo,
        duoUpgrade.locked,
        checkout.checkoutInfo.checkoutUrl,
        `duo_upgrade_${duoUpgrade.token}`
      );
    if (!isTest) {
      try {
        await recordFunnelEvent(
          recallReservation ? 'recall_checkout_created' : 'checkout_created',
          visitorId && visitorId.length <= 64 ? visitorId : session.user.id,
          session.user.id
        );
      } catch {
        // Analytics must not turn a valid checkout into a failed purchase.
      }
    }
    const applePay = checkout.checkoutResult?.applePay;
    return respData({
      checkout_url: checkout.checkoutInfo.checkoutUrl,
      ...(applePay && typeof applePay.status === 'string'
        ? { apple_pay: applePay }
        : {}),
    });
  } catch (error: any) {
    if (!testCheckout) {
      await recordCheckoutCreateFailed(request, checkoutUserId, {
        ...failureMeta,
        errorCode: 'checkout_failed',
        errorMessage:
          typeof error?.message === 'string' && error.message
            ? error.message
            : 'Checkout failed',
      });
    }
    if (recallReservation?.lock)
      await finishRecallCheckout(
        recallReservation.row.id,
        recallReservation.lock
      ).catch(() => {});
    if (retentionLocked && retentionUserId)
      await recoverRetentionCheckout(retentionUserId, retentionLocked).catch(
        () => {}
      );
    // Duo-upgrade recovery needs its order number; read it from the message-safe
    // checkout state is not available here, so a stale 'creating' lock expires
    // after 30s in reserveDuoUpgradeCheckout instead of an explicit recover.
    console.error('checkout error:', error);
    return respErr(error.message || 'Checkout failed');
  }
}

export const Route = createFileRoute('/api/payment/checkout')({
  server: {
    handlers: { POST },
  },
});
