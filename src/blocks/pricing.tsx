import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { usePathname, useRouter } from '@/core/i18n/navigation';
import { SELECTABLE_AGENT_MODEL_OPTIONS } from '@/lib/agent-settings';
import { ApiError, apiGet, apiPost } from '@/lib/api-client';
import { settleCheckout, type CheckoutRedirect } from '@/lib/apple-pay';
import { trackCheckoutFunnel } from '@/lib/checkout-funnel';
import {
  CHECKOUT_CANCEL_PARAM,
  CHECKOUT_PRODUCT_PARAM,
  checkoutEventMetadata,
  checkoutReturnPath,
  claimCheckoutResume,
  readCheckoutResume,
  replaceBrowserSearch,
  signInHref,
  stripCheckoutParams,
} from '@/lib/checkout-resume';
import { creditPackStartsLine } from '@/lib/credit-pack-starts';
import {
  compactLeadProductId,
  compactPackProductIds,
  subscriptionLeadsCollapsed,
  type CompactOfferPriority,
} from '@/lib/credit-paywall';
import {
  formatCatalogMoney,
  leadCreditPack,
  type PublicCreditPack,
} from '@/lib/public-credit-packs';
import {
  creditPriceSavings,
  STANDARD_VIDEO_CREDITS,
} from '@/lib/video-pricing';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { useABCheckoutParticipant } from '@/components/ab-test';
import { DeferredApplePay } from '@/components/deferred-apple-pay';
import {
  PaymentProviderModal,
  type PaymentProvider,
} from '@/components/payment-provider-modal';
import {
  PricingTable,
  type PricingGroup,
  type PricingPlan,
} from '@/components/pricing-table';
import { VideoCreditTable } from '@/components/video-credit-table';

const ALL_PROVIDERS: PaymentProvider[] = [
  'stripe',
  'creem',
  'paypal',
  'alipay',
  'wechat',
];

interface PublicSubscriptionPlan {
  productId: string;
  name: string;
  description: string;
  features: string[];
  badge: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  currency: string;
  interval: 'month' | 'year';
  intervalCount: number;
  credits: number;
  creditsValidDays: number;
  featured: boolean;
  sort: number;
}

function money(amountInCents: number, currency: string, locale: string) {
  return formatCatalogMoney(amountInCents, currency, locale);
}

function toPricingPlan(
  plan: PublicSubscriptionPlan,
  allPlans: PublicSubscriptionPlan[],
  locale: string
): PricingPlan {
  const baseline =
    allPlans.find(
      (candidate) =>
        candidate.interval === 'month' && candidate.name === 'Basic'
    ) ?? allPlans.find((candidate) => candidate.interval === 'month');
  const annualMonthlyPrice =
    plan.interval === 'year' && plan.intervalCount === 1;
  const displayPrice = annualMonthlyPrice
    ? Math.round(plan.priceInCents / 12)
    : plan.priceInCents;
  const savings = baseline ? creditPriceSavings(plan, baseline) : 0;
  const intervalLabel =
    plan.interval === 'year'
      ? m['landing.pricing.interval_year']()
      : m['landing.pricing.interval_month']();
  const intervalCountLabel =
    locale === 'en' && plan.intervalCount > 1
      ? `${intervalLabel}s`
      : intervalLabel;

  return {
    id: plan.productId,
    name: plan.name,
    productName: plan.name,
    description: m['landing.pricing.allowance']({
      credits: plan.credits.toLocaleString(locale),
      count: Math.floor(plan.credits / STANDARD_VIDEO_CREDITS),
      period:
        plan.interval === 'year'
          ? m['landing.pricing.interval_year']()
          : m['landing.pricing.interval_month'](),
    }),
    price: money(displayPrice, plan.currency, locale),
    originalPrice: plan.compareAtPriceInCents
      ? money(
          annualMonthlyPrice
            ? Math.round(plan.compareAtPriceInCents / 12)
            : plan.compareAtPriceInCents,
          plan.currency,
          locale
        )
      : undefined,
    priceNote:
      `${m['landing.pricing.per_video']({ price: money((plan.priceInCents * STANDARD_VIDEO_CREDITS) / plan.credits, plan.currency, locale) })}${plan.interval === 'year' ? ' · ' : ''}` +
      (plan.interval === 'year'
        ? m['landing.pricing.billed_period']({
            total: money(plan.priceInCents, plan.currency, locale),
            period:
              locale === 'en'
                ? `${plan.intervalCount > 1 ? `${plan.intervalCount} ` : ''}${intervalCountLabel}`
                : `${plan.intervalCount} ${intervalLabel}`,
          })
        : ''),
    interval: annualMonthlyPrice
      ? m['landing.pricing.interval_month']()
      : plan.intervalCount > 1
        ? m['landing.pricing.interval_count']({
            period:
              locale === 'en'
                ? `${plan.intervalCount} ${intervalCountLabel}`
                : `${plan.intervalCount} ${intervalLabel}`,
          })
        : intervalLabel,
    featured: plan.featured,
    badge:
      savings > 0
        ? m['landing.pricing.save_percent']({ percent: savings })
        : plan.featured
          ? m['landing.pricing.popular']()
          : plan.badge || undefined,
    features: [...plan.features, m['landing.pricing.plan_credit_expiry']()],
    buttonText: m['landing.pricing.subscribe'](),
    productId: plan.productId,
    priceInCents: plan.priceInCents,
    currency: plan.currency,
    credits: plan.credits,
    creditsValidDays: plan.creditsValidDays,
    plan: {
      name: plan.name,
      interval: plan.interval,
      intervalCount: plan.intervalCount,
    },
  };
}

function buildGroups(
  plans: PublicSubscriptionPlan[],
  locale: string
): PricingGroup[] {
  const monthPlans = plans.filter((plan) => plan.interval === 'month');
  const yearPlans = plans.filter((plan) => plan.interval === 'year');
  const baseline =
    monthPlans.find((plan) => plan.name === 'Basic') ?? monthPlans[0];
  const discounts = baseline
    ? yearPlans.map((year) => creditPriceSavings(year, baseline))
    : [];
  const maxDiscount = discounts.length ? Math.max(...discounts) : 0;

  const groups: (PricingGroup | null)[] = [
    monthPlans.length
      ? {
          key: 'monthly',
          label: m['landing.pricing.monthly'](),
          plans: monthPlans.map((plan) => toPricingPlan(plan, plans, locale)),
        }
      : null,
    yearPlans.length
      ? {
          key: 'yearly',
          label: m['landing.pricing.yearly'](),
          badge: maxDiscount
            ? m['landing.pricing.save_up_to']({ percent: maxDiscount })
            : undefined,
          plans: yearPlans.map((plan) => toPricingPlan(plan, plans, locale)),
        }
      : null,
  ];
  return groups.filter((group): group is PricingGroup => group !== null);
}

export function Pricing({
  title,
  compact = false,
  redirect,
  headingLevel = 2,
  tone = 'default',
  defaultGroup = 'monthly',
  compactOfferPriority = 'duo-first',
  placement = compact ? 'compact' : 'pricing',
  catalog = 'full',
  initialPacks,
}: {
  title?: string;
  headingLevel?: 1 | 2;
  tone?: 'default' | 'cinematic';
  defaultGroup?: string;
  /** Drop the section chrome (heading + page padding) when embedded. */
  compact?: boolean;
  /** Same-origin path to land on after a successful payment. */
  redirect?: string;
  /** Order and highlight used by the insufficient-credit offer experiment. */
  compactOfferPriority?: CompactOfferPriority;
  /** Where the buy button lives, stored on checkout funnel events. */
  placement?: string;
  /** `packs` renders credit packs only, with no subscription or video table. */
  catalog?: 'full' | 'packs';
  /** Live packs from the route loader, so the first HTML includes prices. */
  initialPacks?: PublicCreditPack[];
} = {}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const paywallRef = useRef<HTMLElement | null>(null);
  const paywallRecorded = useRef(false);

  // Same cache entry the sidebar and the credits page use, so the plan the
  // viewer already pays for is known without another request.
  const { data: subscription } = useQuery({
    queryKey: ['user-subscription', 'current'],
    queryFn: () =>
      apiGet<{ productId?: string | null } | null>(
        '/api/user/subscriptions/current'
      ),
    enabled: Boolean(session?.user),
  });

  const configQuery = usePublicConfig();
  const configsData = configQuery.data;
  const locale = getLocale();
  const plansQuery = useQuery({
    queryKey: ['subscription-plans', locale],
    queryFn: () =>
      apiGet<PublicSubscriptionPlan[]>(
        `/api/subscription-plans?locale=${locale}`
      ),
    staleTime: 60_000,
  });
  const packsQuery = useQuery({
    queryKey: ['credit-top-up-products', locale],
    queryFn: () =>
      apiGet<PublicCreditPack[]>(`/api/top-up-products?locale=${locale}`),
    staleTime: 60_000,
    initialData: initialPacks,
  });
  const getABParticipantId = useABCheckoutParticipant();
  const configs = configsData ?? {};
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);
  const [loadingProvider, setLoadingProvider] =
    useState<PaymentProvider | null>(null);
  const [showAllOffers, setShowAllOffers] = useState(false);
  // Stripe.js follows the Apple Pay probe. Homepage pricing waits until the
  // table is actually in view, or until the visitor clicks buy. A large
  // rootMargin used to fetch js.stripe.com while the hero was still on screen.
  // Compact checkout offers mount it now.
  const deferWallets = !compact && catalog !== 'packs';
  const [walletsReady, setWalletsReady] = useState(!deferWallets);

  const enabledProviders = useMemo<PaymentProvider[]>(
    () => ALL_PROVIDERS.filter((p) => configs[`${p}_enabled`] === 'true'),
    [configs]
  );

  const plans = plansQuery.data ?? [];
  const groups = buildGroups(plans, locale);

  const checkoutMutation = useMutation({
    mutationFn: async ({
      plan,
      provider,
      paymentMethodId,
    }: {
      plan: PricingPlan;
      provider: PaymentProvider;
      paymentMethodId?: string;
    }) => {
      const data = await apiPost<CheckoutRedirect>('/api/payment/checkout', {
        ab_participant_id: await getABParticipantId(),
        product_id: plan.productId,
        payment_provider: paymentMethodId ? 'stripe' : provider,
        placement,
        redirect,
        ...(paymentMethodId
          ? { apple_pay_payment_method: paymentMethodId }
          : {}),
      });
      if (!data?.checkout_url) {
        throw new Error(m['settings.credits.topup_failed']());
      }
      trackCheckoutFunnel(
        'checkout_redirected',
        checkoutEventMetadata(plan, placement, {
          provider: paymentMethodId ? 'stripe' : provider,
        }),
        { keepalive: true }
      );
      await settleCheckout(data, configs.stripe_publishable_key);
      return data;
    },
    onSuccess: () => {
      setLoadingProvider(null);
    },
    onError: (err: unknown, { plan, provider }) => {
      const message =
        err instanceof Error && err.message
          ? err.message
          : m['settings.credits.topup_failed']();
      trackCheckoutFunnel(
        'checkout_create_failed',
        checkoutEventMetadata(plan, placement, {
          provider,
          errorCode: err instanceof ApiError ? String(err.code) : 'client',
          errorMessage: message,
        })
      );
      toast.error(message);
      setLoadingProvider(null);
    },
  });

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;

      setLoadingProvider(null);
      checkoutMutation.reset();
      void queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      void queryClient.invalidateQueries({
        queryKey: ['user-subscription', 'current'],
      });
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [checkoutMutation.reset, queryClient]);

  useEffect(() => {
    if (!showAllOffers || !compact) return;
    document
      .querySelector('.credit-purchase-scroll')
      ?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [compact, showAllOffers]);

  useEffect(() => {
    if (
      paywallRecorded.current ||
      (!plansQuery.isSuccess && !packsQuery.isSuccess)
    )
      return;
    const record = () => {
      if (paywallRecorded.current) return;
      paywallRecorded.current = true;
      void apiPost('/api/funnel/event', { event: 'paywall_shown' }).catch(
        () => undefined
      );
    };
    if (compact) {
      record();
      return;
    }
    const element = paywallRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      record();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          record();
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, packsQuery.isSuccess, plansQuery.isSuccess]);

  useEffect(() => {
    if (!deferWallets || walletsReady) return;
    const element = paywallRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setWalletsReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setWalletsReady(true);
        observer.disconnect();
      },
      { rootMargin: '0px', threshold: 0 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [deferWallets, walletsReady]);

  function startCheckout(plan: PricingPlan, provider: PaymentProvider) {
    setLoadingProvider(provider);
    checkoutMutation.mutate({ plan, provider });
  }

  function handleCheckout(plan: PricingPlan, options?: { resumed?: boolean }) {
    const meta = checkoutEventMetadata(plan, placement);
    if (!options?.resumed && plan.productId && plan.priceInCents)
      trackCheckoutFunnel('checkout_click', meta);
    // Free tier — no checkout, just funnel to sign-up.
    if (!plan.productId || !plan.priceInCents) {
      router.push('/sign-up');
      return;
    }

    // A buy/upgrade click loads the Apple Pay chunk even if the paywall
    // has not yet crossed the viewport edge.
    setWalletsReady(true);

    if (!session?.user) {
      if (options?.resumed) return;
      trackCheckoutFunnel('checkout_signin_redirect', meta);
      const returnPath =
        typeof window === 'undefined'
          ? '/pricing'
          : checkoutReturnPath(
              pathname,
              window.location.search,
              window.location.hash,
              plan.productId,
              placement
            );
      router.push(signInHref(returnPath));
      return;
    }

    const selectEnabled = configs.select_payment_enabled === 'true';
    const defaultProvider = (configs.default_payment_provider ||
      enabledProviders[0] ||
      'stripe') as PaymentProvider;

    if (selectEnabled && enabledProviders.length > 1) {
      setPendingPlan(plan);
      setModalOpen(true);
      return;
    }

    startCheckout(plan, defaultProvider);
  }

  function handleProviderSelect(provider: PaymentProvider) {
    if (!pendingPlan) return;
    startCheckout(pendingPlan, provider);
  }

  const labels = {
    currentPlan: m['common.pricing.current_plan'](),
    processing: m['common.pricing.processing'](),
    getStarted: m['common.pricing.get_started'](),
    recommended: m['landing.pricing.recommended'](),
  };
  const packs = packsQuery.data ?? [];
  const packBaseline = leadCreditPack(packs);
  const packPlans: PricingPlan[] = packs.map((pack) => {
    const savings = packBaseline ? creditPriceSavings(pack, packBaseline) : 0;
    return {
      id: pack.productId,
      productId: pack.productId,
      name: pack.name,
      interval: m['landing.pricing.once'](),
      price: money(pack.priceInCents, pack.currency, locale),
      priceInCents: pack.priceInCents,
      currency: pack.currency,
      credits: pack.credits,
      creditsValidDays: pack.creditsValidDays,
      description: m['landing.pricing.pack_allowance']({
        credits: pack.credits.toLocaleString(locale),
        count: Math.floor(pack.credits / STANDARD_VIDEO_CREDITS),
      }),
      priceNote: m['landing.pricing.per_video']({
        price: money(
          (pack.priceInCents * STANDARD_VIDEO_CREDITS) / pack.credits,
          pack.currency,
          locale
        ),
      }),
      badge:
        savings > 0
          ? m['landing.pricing.save_percent']({ percent: savings })
          : undefined,
      buttonText: m['settings.credits.topup_action'](),
      features: [
        m['landing.pricing.feature_hd'](),
        m['landing.pricing.feature_download'](),
        pack.creditsValidDays === 0
          ? m['settings.credits.topup_never_expires']()
          : m['settings.credits.topup_valid_days']({
              days: pack.creditsValidDays,
            }),
        m['landing.pricing.feature_failed'](),
      ],
    };
  });
  const compactPackPlans = (items: PricingPlan[]) =>
    items.map((plan) => {
      const count = Math.floor((plan.credits ?? 0) / STANDARD_VIDEO_CREDITS);
      return {
        ...plan,
        name:
          count === 1
            ? m['landing.pricing.pack_name_one']({ count })
            : m['landing.pricing.pack_name_many']({ count }),
        buttonText:
          count === 1
            ? m['landing.pricing.pack_action_one']()
            : m['landing.pricing.pack_action_many'](),
      };
    });
  const prioritizedPackIds = compactPackProductIds(compactOfferPriority);
  const prioritizedPackPlans = [
    ...prioritizedPackIds.flatMap((productId) => {
      const plan = packPlans.find((item) => item.productId === productId);
      return plan ? [plan] : [];
    }),
    ...packPlans.filter((plan) => !prioritizedPackIds.includes(plan.productId)),
  ];
  const busyProductId = checkoutMutation.isPending
    ? checkoutMutation.variables?.plan.productId
    : null;
  const walletAction = (plan: PricingPlan) =>
    walletsReady && plan.priceInCents && plan.currency ? (
      <DeferredApplePay
        amount={plan.priceInCents}
        currency={plan.currency}
        label={plan.productName || plan.name}
        buttonType={plan.plan ? 'subscribe' : 'buy'}
        disabled={Boolean(busyProductId)}
        onPay={(paymentMethodId) =>
          checkoutMutation.mutateAsync({
            plan,
            provider: 'stripe',
            paymentMethodId,
          })
        }
      />
    ) : null;
  const catalogRef = useRef<PricingPlan[]>([]);
  catalogRef.current = [
    ...groups.flatMap((group) => group.plans),
    ...packPlans,
  ];
  const checkoutRef = useRef(handleCheckout);
  checkoutRef.current = handleCheckout;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(CHECKOUT_CANCEL_PARAM) !== '1') return;
    if (!plansQuery.isFetched || !packsQuery.isFetched) return;
    const productId = params.get(CHECKOUT_PRODUCT_PARAM);
    const plan = catalogRef.current.find(
      (item) => item.productId === productId
    );
    trackCheckoutFunnel(
      'checkout_cancel_return',
      checkoutEventMetadata(
        {
          productId: plan?.productId || productId || undefined,
          priceInCents: plan?.priceInCents,
          currency: plan?.currency,
        },
        placement
      )
    );
    replaceBrowserSearch(stripCheckoutParams(window.location.search));
  }, [packsQuery.isFetched, placement, plansQuery.isFetched]);

  useEffect(() => {
    if (typeof window === 'undefined' || sessionPending) return;
    if (!session?.user || !configQuery.isFetched) return;
    if (!plansQuery.isFetched || !packsQuery.isFetched) return;
    const request = readCheckoutResume(window.location.search);
    if (!request || request.placement !== placement) return;
    const catalogReady = plansQuery.isSuccess && packsQuery.isSuccess;
    const plan = catalogRef.current.find(
      (item) => item.productId === request.productId
    );
    if (!plan?.productId || !plan.priceInCents) {
      if (catalogReady)
        replaceBrowserSearch(stripCheckoutParams(window.location.search));
      return;
    }
    if (!claimCheckoutResume(plan.productId)) {
      replaceBrowserSearch(stripCheckoutParams(window.location.search));
      return;
    }
    replaceBrowserSearch(stripCheckoutParams(window.location.search));
    checkoutRef.current(plan, { resumed: true });
  }, [
    configQuery.isFetched,
    packsQuery.isFetched,
    packsQuery.isSuccess,
    placement,
    plansQuery.isFetched,
    plansQuery.isSuccess,
    session?.user,
    sessionPending,
  ]);
  const packSection = (
    items: PricingPlan[],
    compactCards = false,
    showHeading = !compactCards
  ) => (
    <div className={compactCards ? 'space-y-3' : 'space-y-5'}>
      {showHeading && (
        <h3 className="text-center text-xl font-semibold">
          {m['landing.pricing.packs_title']()}
        </h3>
      )}
      {items.length ? (
        <PricingTable
          groups={[
            {
              key: 'packs',
              label: m['landing.pricing.packs_title'](),
              plans: compactCards ? compactPackPlans(items) : items,
            },
          ]}
          labels={labels}
          busyProductId={busyProductId}
          onCheckout={handleCheckout}
          walletAction={walletAction}
          tone={tone}
          compact={compactCards}
          showFeatures={!compactCards}
        />
      ) : packsQuery.isError ? (
        <p role="alert" className="text-center">
          {m['landing.pricing.load_failed']()}
        </p>
      ) : packsQuery.isPending ? null : (
        <p className="text-center">{m['settings.credits.topup_empty']()}</p>
      )}
    </div>
  );

  const planSection = (
    groupsToShow: PricingGroup[],
    compactCards = false,
    showHeading = true
  ) => (
    <div className={compactCards ? 'space-y-3' : 'space-y-5'}>
      {showHeading && (
        <h3 className="text-center text-xl font-semibold">
          {m['landing.pricing.plans_title']()}
        </h3>
      )}
      {plansQuery.isError ? (
        <p role="alert" className="text-center">
          {m['landing.pricing.load_failed']()}
        </p>
      ) : groupsToShow.length ? (
        <PricingTable
          groups={groupsToShow}
          defaultGroup={defaultGroup}
          tone={tone}
          currentProductId={subscription?.productId}
          labels={labels}
          busyProductId={busyProductId}
          onCheckout={handleCheckout}
          walletAction={walletAction}
          compact={compactCards}
          showFeatures={!compactCards}
        />
      ) : plansQuery.isPending ? null : (
        <p className="text-center">{m['landing.pricing.no_plans']()}</p>
      )}
    </div>
  );

  const monthPlans =
    groups.find((group) => group.key === 'monthly')?.plans ?? [];
  const basicMonthly =
    monthPlans.find((plan) => plan.productId === 'basic_monthly_v2') ??
    monthPlans.find(
      (plan) => plan.name === 'Basic' && plan.plan?.interval === 'month'
    );
  const singlePack = packPlans.find((plan) => plan.productId === 'single_v2');
  const promotionPercent =
    basicMonthly && singlePack
      ? creditPriceSavings(basicMonthly, singlePack)
      : 0;
  const promotedBasic = basicMonthly
    ? {
        ...basicMonthly,
        interval: m['landing.pricing.interval_month_short'](),
        badge: promotionPercent
          ? m['landing.pricing.save_percent']({ percent: promotionPercent })
          : basicMonthly.badge,
      }
    : null;
  const isPurchasePreview = compact && !showAllOffers;
  const fullGroups = groups.map((group) => ({
    ...group,
    plans:
      group.key === 'monthly' && promotedBasic
        ? group.plans.map((plan) => ({
            ...plan,
            interval: m['landing.pricing.interval_month_short'](),
            ...(plan.productId === promotedBasic.productId
              ? promotedBasic
              : {}),
          }))
        : group.plans.map((plan) => ({
            ...plan,
            interval:
              plan.plan?.interval === 'month'
                ? m['landing.pricing.interval_month_short']()
                : plan.interval,
          })),
  }));
  const previewPacks = compactPackPlans(prioritizedPackPlans.slice(0, 2));
  const leadProductId = compactLeadProductId(
    compactOfferPriority,
    promotedBasic?.productId
  );
  const summaryOffers = (
    subscriptionLeadsCollapsed(compactOfferPriority)
      ? [...(promotedBasic ? [promotedBasic] : []), ...previewPacks]
      : [...previewPacks, ...(promotedBasic ? [promotedBasic] : [])]
  ).map((plan) => ({
    ...plan,
    featured: plan.productId === leadProductId,
  }));

  const table = compact ? (
    <div className={isPurchasePreview ? 'space-y-3' : 'space-y-8'}>
      {isPurchasePreview ? (
        <>
          {summaryOffers.length ? (
            <PricingTable
              groups={[
                {
                  key: 'featured-offers',
                  label: '',
                  plans: summaryOffers,
                },
              ]}
              labels={labels}
              busyProductId={busyProductId}
              onCheckout={handleCheckout}
              walletAction={walletAction}
              tone={tone}
              compact
              showFeatures={false}
            />
          ) : plansQuery.isError || packsQuery.isError ? (
            <p role="alert" className="text-center">
              {m['landing.pricing.load_failed']()}
            </p>
          ) : plansQuery.isPending || packsQuery.isPending ? null : (
            <p className="text-center">{m['settings.credits.topup_empty']()}</p>
          )}
          <div className="space-y-4 pt-1 text-center">
            <p className="text-muted-foreground text-center text-xs leading-relaxed sm:text-sm">
              {m['landing.pricing.secure_checkout']()}
            </p>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium underline decoration-1 underline-offset-4 transition-colors sm:text-base"
              onClick={() => setShowAllOffers(true)}
            >
              {m['landing.pricing.see_every']()}
            </button>
          </div>
        </>
      ) : (
        <>
          {planSection(fullGroups, true, true)}
          {packSection(prioritizedPackPlans, true, true)}
          <p className="text-muted-foreground pt-1 text-center text-xs leading-relaxed sm:text-sm">
            {m['landing.pricing.secure_checkout']()}
          </p>
        </>
      )}
    </div>
  ) : (
    <div className="space-y-12">
      {planSection(groups)}
      {packSection(packPlans)}
      <p className="text-muted-foreground text-center text-sm">
        {m['landing.pricing.video_basis']()}
      </p>
      <VideoCreditTable
        title={m['landing.pricing.cost_title']()}
        description={m['landing.pricing.cost_description']()}
        modelLabel={m['landing.pricing.model_label']()}
        creditLabel={m['settings.credits.credits']()}
        rows={SELECTABLE_AGENT_MODEL_OPTIONS.map((option) => ({
          tier: option.tier,
          model: option.label,
          prices: option.creditsPer12Seconds,
        }))}
      />
    </div>
  );

  const providerModal = (
    <PaymentProviderModal
      open={modalOpen}
      onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) {
          setPendingPlan(null);
          setLoadingProvider(null);
        }
      }}
      providers={enabledProviders.length ? enabledProviders : ['stripe']}
      loadingProvider={loadingProvider}
      onSelect={handleProviderSelect}
      planName={pendingPlan?.name}
      price={pendingPlan?.price}
    />
  );

  if (catalog === 'packs') {
    return (
      <>
        {packSection(packPlans, false, false)}
        {providerModal}
      </>
    );
  }

  if (compact) {
    return (
      <>
        {table}
        {providerModal}
      </>
    );
  }

  return (
    <section
      ref={paywallRef}
      id="pricing"
      className={`pricing-cinematic px-4 py-20 sm:py-24 ${tone === 'cinematic' ? 'trend-pricing-inner' : ''}`}
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Heading
            className={
              tone === 'cinematic'
                ? 'trend-section-title'
                : 'text-3xl font-bold tracking-[-0.02em] sm:text-4xl lg:text-5xl'
            }
          >
            {title ?? m['landing.pricing.title']()}
          </Heading>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base">
            {m['landing.pricing.description']()}
          </p>
          {placement === 'pricing' && packBaseline ? (
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base">
              {creditPackStartsLine(packBaseline, locale)}
            </p>
          ) : null}
        </div>
        <div className="mt-12">{table}</div>
      </div>
      {providerModal}
    </section>
  );
}
