import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Loader2, Sparkles, Video, X } from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import type { EffectCampaign } from '@/lib/ai-video-paths';
import { apiGet, apiPost } from '@/lib/api-client';
import { settleCheckout, type CheckoutRedirect } from '@/lib/apple-pay';
import { HOME_HERO_DEMOS } from '@/lib/home-demos';
import {
  formatProofNumber,
  QUALITY_PROOF_ROUNDS,
  QUALITY_PROOF_VIDEOS,
} from '@/lib/social-proof';
import {
  nearestRetentionNamePriceCents,
  RETENTION_NAME_PRICE_CENTS,
  RETENTION_NAME_PRICE_DEFAULT_CENTS,
  RETENTION_NAME_PRICE_SCENE,
  retentionNamePriceProductId,
  retentionTimeLeft,
  VIDEO_RETENTION_EVENT,
  VIDEO_RETENTION_PRODUCT_ID,
  type RetentionNamePriceCents,
  type VideoRetentionOffer as RetentionOffer,
  type VideoRetentionResponse,
} from '@/lib/video-retention-offer';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { ABTest, useABCheckoutParticipant } from '@/components/ab-test';
import { DeferredApplePay } from '@/components/deferred-apple-pay';
import { PayActionRow } from '@/components/pay-action-row';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const RETENTION_DEMO = HOME_HERO_DEMOS[0];
const RETENTION_VIDEO_URL = RETENTION_DEMO.src;
const RETENTION_VIDEO_POSTER_URL = RETENTION_DEMO.poster ?? RETENTION_DEMO.src;
const RETENTION_IMAGE_URL = RETENTION_DEMO.poster ?? RETENTION_DEMO.src;

interface OfferRequest {
  campaign: EffectCampaign;
  modelOption: string;
  duration: number;
  resolution: string;
  image?: string;
}

interface OfferViewProps {
  offer: RetentionOffer;
  timer: string;
  image?: string;
  open: boolean;
  pill: boolean;
  generatedCount?: number;
  onOpen: () => void;
  onCollapse: () => void;
  onOpenChange: (next: boolean) => void;
  onCheckoutError: () => void;
}

/** Bold only the key proof figures (e.g. 200 / 50+) inside body copy. */
function boldProofFigures(text: string, highlights: string[]) {
  const tokens = [...new Set(highlights.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (!tokens.length) return text;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g'));
  return parts.map((part, i) =>
    tokens.includes(part) ? (
      <strong key={i} className="font-bold text-[#171b27]">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function formatUsd(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function useRetentionCheckout(redirect: string, onError: () => void) {
  const { data: configs } = usePublicConfig();
  const getABParticipantId = useABCheckoutParticipant();
  return useMutation({
    mutationFn: async (
      input: string | { productId: string; paymentMethodId: string }
    ) => {
      const productId = typeof input === 'string' ? input : input.productId;
      const paymentMethodId =
        typeof input === 'string' ? undefined : input.paymentMethodId;
      const abParticipantId = await getABParticipantId();
      const data = await apiPost<CheckoutRedirect>('/api/payment/checkout', {
        product_id: productId,
        payment_provider: 'stripe',
        redirect,
        ...(abParticipantId ? { ab_participant_id: abParticipantId } : {}),
        ...(paymentMethodId
          ? { apple_pay_payment_method: paymentMethodId }
          : {}),
      });
      await settleCheckout(data, configs?.stripe_publishable_key);
      return data;
    },
    onError: (error: Error) => {
      toast.error(error.message);
      onError();
    },
  });
}

function RetentionLauncher({
  price,
  timer,
  open,
  pill,
  onOpen,
  onCollapse,
}: {
  price: string;
  timer: string;
  open: boolean;
  pill: boolean;
  onOpen: () => void;
  onCollapse: () => void;
}) {
  if (open) return null;
  if (!pill) {
    return (
      <aside
        aria-label={m['retention.title']()}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center rounded-2xl border border-[#e2e5ea] bg-white text-[#171b27] shadow-lg"
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-14 min-w-0 items-center gap-3 rounded-l-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-[#c8962c]"
        >
          <Clock3
            className="size-5 shrink-0 text-[#7c5408]"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {m['retention.floating']({ price })}
            </span>
            <span className="block text-xs text-[#555d6b] tabular-nums">
              {m['retention.remaining']({ time: timer })}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={m['retention.collapse']()}
          className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-[#c8962c]"
        >
          <X className="size-4" />
        </button>
      </aside>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={m['retention.pill']({ price, time: timer })}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 inline-flex min-h-11 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-[#e2e5ea] bg-white px-3.5 text-sm font-semibold text-[#171b27] shadow-lg focus-visible:outline-2 focus-visible:outline-[#c8962c]"
    >
      <Clock3 className="size-4 shrink-0 text-[#7c5408]" aria-hidden="true" />
      <span className="truncate">{price}</span>
      <span className="shrink-0 text-xs font-medium text-[#555d6b] tabular-nums">
        {m['retention.remaining']({ time: timer })}
      </span>
    </button>
  );
}

function retentionPreview() {
  return {
    image: RETENTION_IMAGE_URL,
    video: RETENTION_VIDEO_URL,
    poster: RETENTION_VIDEO_POSTER_URL,
    videoLabel: m['retention.name_price.video'](),
  };
}

function RetentionCompare({
  image,
  video,
  poster,
  videoLabel,
}: {
  image: string;
  video: string;
  poster: string;
  videoLabel: string;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-stretch gap-3 sm:grid-cols-2">
      <figure className="relative overflow-hidden rounded-2xl border-2 border-[#c9ced8] bg-white">
        <span className="absolute top-2 left-2 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#171b27] shadow-sm">
          {m['retention.compare_original']()}
        </span>
        <img
          src={image}
          alt=""
          className="aspect-[9/16] h-full max-h-52 w-full object-contain"
        />
      </figure>
      <figure className="relative overflow-hidden rounded-2xl border-2 border-[#171b27] bg-black shadow-[4px_4px_0_#171b27]">
        <span className="absolute top-2 left-2 z-10 rounded-full bg-[#e6b325] px-2.5 py-1 text-[11px] font-semibold text-[#1a1206] shadow-sm">
          {m['retention.compare_result']()}
        </span>
        <video
          src={video}
          poster={poster}
          aria-label={videoLabel}
          autoPlay
          muted
          loop
          playsInline
          controls
          controlsList="nodownload"
          preload="metadata"
          className="aspect-[9/16] h-full max-h-52 w-full bg-black object-cover"
        />
      </figure>
    </div>
  );
}

function OfferDialog({
  open,
  onOpenChange,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={className}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ControlRetentionOffer({
  offer,
  timer,
  image,
  open,
  pill,
  generatedCount,
  onOpen,
  onCollapse,
  onOpenChange,
  onCheckoutError,
}: OfferViewProps) {
  const locale = getLocale();
  const checkout = useRetentionCheckout(offer.redirect, onCheckoutError);
  const price = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: offer.currency.toUpperCase(),
    currencyDisplay: 'code',
  }).format(offer.priceInCents / 100);
  const preview = retentionPreview();

  return (
    <>
      <RetentionLauncher
        price={price}
        timer={timer}
        open={open}
        pill={pill}
        onOpen={onOpen}
        onCollapse={onCollapse}
      />
      <OfferDialog
        open={open}
        onOpenChange={onOpenChange}
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden border-0 bg-white p-0 text-[#171b27]"
      >
        <button
          type="button"
          onClick={onCollapse}
          aria-label={m['retention.minimize']()}
          className="absolute top-3 right-3 z-30 flex size-11 items-center justify-center rounded-xl bg-white/80 hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-[#c8962c]"
        >
          <X className="size-5" />
        </button>
        <DialogHeader className="flex-none border-b border-[#e2e5ea] px-6 pt-5 pr-16 pb-4">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {m['retention.title']()}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#555d6b]">
            {m['retention.description']()}
          </DialogDescription>
        </DialogHeader>
        <style>{`
            .retention-buy-marquee {
              border-radius: 14px;
              padding: 2px;
              background: linear-gradient(110deg, #c8962c, #f0d48a, #c8962c, #ffc24d, #c8962c);
              background-size: 220% 100%;
              box-shadow: 0 10px 26px rgb(200 150 44 / 0.35);
              animation: retention-buy-marquee 2.4s linear infinite;
            }
            .retention-buy-shine {
              animation: retention-buy-shine 2.8s ease-in-out infinite;
            }
            @keyframes retention-buy-marquee {
              to { background-position: 220% 0; }
            }
            @keyframes retention-buy-shine {
              0% { transform: translateX(-160%) skewX(-18deg); }
              55%, 100% { transform: translateX(280%) skewX(-18deg); }
            }
            @media (prefers-reduced-motion: reduce) {
              .retention-buy-marquee, .retention-buy-shine { animation: none !important; }
              .retention-buy-shine { display: none; }
            }
          `}</style>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-5 p-5">
            <section className="space-y-3">
              <div className="grid grid-cols-2 items-stretch gap-3">
                <figure className="relative overflow-hidden rounded-2xl border-2 border-[#c9ced8] bg-white">
                  <span className="absolute top-12 left-2 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#171b27] shadow-sm sm:top-2">
                    {m['retention.compare_original']()}
                  </span>
                  <img
                    src={preview.image}
                    alt=""
                    className="aspect-[9/16] h-full w-full object-contain"
                  />
                </figure>
                <figure className="relative overflow-hidden rounded-2xl border-2 border-[#c8962c] bg-black shadow-[0_8px_24px_rgb(200_150_44/0.25)]">
                  <span className="absolute top-12 left-2 z-10 rounded-full bg-[#e6b325] px-2.5 py-1 text-[11px] font-semibold text-[#1a1206] shadow-sm sm:top-2">
                    {m['retention.compare_result']()}
                  </span>
                  <video
                    src={preview.video}
                    poster={preview.poster}
                    aria-label={preview.videoLabel}
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                    controlsList="nodownload"
                    preload="metadata"
                    className="aspect-[9/16] h-full w-full bg-black object-cover"
                  />
                </figure>
              </div>
            </section>
            <section className="space-y-3">
              <p className="text-sm leading-relaxed text-[#3d4452]">
                {boldProofFigures(
                  m['proof.quality']({
                    videos: formatProofNumber(QUALITY_PROOF_VIDEOS, locale),
                    rounds: formatProofNumber(QUALITY_PROOF_ROUNDS, locale),
                  }),
                  [
                    formatProofNumber(QUALITY_PROOF_VIDEOS, locale),
                    `${formatProofNumber(QUALITY_PROOF_ROUNDS, locale)}+`,
                    formatProofNumber(QUALITY_PROOF_ROUNDS, locale),
                  ]
                )}
              </p>
              {typeof generatedCount === 'number' && (
                <p className="text-sm font-semibold text-[#7c5408]">
                  {m['proof.generated']({
                    count: formatProofNumber(generatedCount, locale),
                  })}
                </p>
              )}
            </section>
            <section className="rounded-2xl border-2 border-[#c8962c] bg-[#fff6dc] p-4 shadow-sm">
              <div className="flex items-center gap-4">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="size-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-white">
                    <Video
                      className="size-7 text-[#7c5408]"
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-3xl font-semibold tracking-tight">
                    {price}
                  </p>
                  <p className="mt-1 text-sm text-[#555d6b]">
                    {m['retention.allowance']({ credits: offer.credits })}
                  </p>
                </div>
                <div className="ml-auto shrink-0 text-right">
                  <p className="text-xs text-[#555d6b]">
                    {m['retention.time_label']()}
                  </p>
                  <p
                    role="timer"
                    aria-label={m['retention.remaining']({ time: timer })}
                    className="text-2xl font-semibold text-[#7c5408] tabular-nums"
                  >
                    {timer}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed font-medium text-[#171b27]">
                {m['retention.recommend']()}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#555d6b]">
                {m['retention.terms']()}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#555d6b]">
                {offer.creditsValidDays > 0
                  ? m['settings.credits.topup_valid_days']({
                      days: offer.creditsValidDays,
                    })
                  : m['settings.credits.topup_never_expires']()}
              </p>
            </section>
          </div>
        </div>
        <div className="flex-none border-t border-[#e2e5ea] bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(23_27_39/0.08)]">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-lg leading-none font-bold tracking-tight">
                {price}
              </p>
              <p
                aria-hidden="true"
                className="mt-1 text-[11px] font-semibold text-[#7c5408] tabular-nums"
              >
                {timer}
              </p>
            </div>
            <PayActionRow className="min-w-0 flex-1">
              <div className="retention-buy-marquee">
                <Button
                  className="relative h-12 w-full overflow-hidden rounded-[12px] bg-[#e6b325] text-base font-semibold text-[#1a1206] hover:bg-[#c49212]"
                  disabled={checkout.isPending}
                  onClick={() => checkout.mutate(VIDEO_RETENTION_PRODUCT_ID)}
                >
                  <span
                    aria-hidden="true"
                    className="retention-buy-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/25 blur-[2px]"
                  />
                  <span className="relative flex items-center gap-2">
                    {checkout.isPending ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        {m['common.pricing.processing']()}
                      </>
                    ) : (
                      m['retention.buy']({ price })
                    )}
                  </span>
                </Button>
              </div>
              <DeferredApplePay
                amount={offer.priceInCents}
                currency={offer.currency}
                label={m['retention.buy']({ price })}
                disabled={checkout.isPending}
                onPay={(paymentMethodId) =>
                  checkout.mutateAsync({
                    productId: VIDEO_RETENTION_PRODUCT_ID,
                    paymentMethodId,
                  })
                }
              />
            </PayActionRow>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            className="mt-1 min-h-8 w-full rounded-lg text-xs text-[#555d6b] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#c8962c]"
          >
            {m['retention.later']()}
          </button>
        </div>
      </OfferDialog>
    </>
  );
}

function NamePriceRetentionOffer(props: OfferViewProps) {
  const locale = getLocale();
  const checkout = useRetentionCheckout(
    props.offer.redirect,
    props.onCheckoutError
  );
  const [cents, setCents] = useState<RetentionNamePriceCents>(
    RETENTION_NAME_PRICE_DEFAULT_CENTS
  );
  const [draft, setDraft] = useState(
    (RETENTION_NAME_PRICE_DEFAULT_CENTS / 100).toFixed(2)
  );
  const parsedDraft = Number(draft.trim());
  const liveCents = Number.isFinite(parsedDraft)
    ? nearestRetentionNamePriceCents(Math.round(parsedDraft * 100))
    : cents;
  const price = formatUsd(liveCents, locale);
  const preview = retentionPreview();
  const commitDraft = () => {
    const parsed = Number(draft.trim());
    if (!Number.isFinite(parsed)) {
      setDraft((cents / 100).toFixed(2));
      return cents;
    }
    const next = nearestRetentionNamePriceCents(Math.round(parsed * 100));
    setCents(next);
    setDraft((next / 100).toFixed(2));
    return next;
  };
  const select = (next: RetentionNamePriceCents) => {
    setCents(next);
    setDraft((next / 100).toFixed(2));
  };

  return (
    <div data-variant="retention-name-price">
      <RetentionLauncher
        price={price}
        timer={props.timer}
        open={props.open}
        pill={props.pill}
        onOpen={props.onOpen}
        onCollapse={props.onCollapse}
      />
      <OfferDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[28px] border-2 border-[#171b27] bg-white p-0 text-[#171b27] shadow-[6px_6px_0_#171b27]"
      >
        <button
          type="button"
          onClick={props.onCollapse}
          aria-label={m['retention.minimize']()}
          className="absolute top-3 right-3 z-30 flex size-11 items-center justify-center rounded-xl hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-[#c8962c]"
        >
          <X className="size-5" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#171b27] bg-[#e6b325] px-3 py-1 text-[11px] font-black tracking-wide text-[#1a1206] uppercase shadow-[3px_3px_0_#171b27]">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {m['retention.name_price.badge']()}
          </div>
          <DialogHeader className="mt-4 gap-2 p-0 text-left">
            <DialogTitle className="text-[1.65rem] leading-tight font-semibold tracking-tight text-[#171b27]">
              {m['retention.name_price.title']()}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-[#555d6b]">
              {m['retention.name_price.description']()}
            </DialogDescription>
          </DialogHeader>
          <p
            role="timer"
            aria-label={m['retention.remaining']({ time: props.timer })}
            className="mt-3 text-sm font-semibold text-[#7c5408] tabular-nums"
          >
            {m['retention.time_label']()} {props.timer}
          </p>
          <div className="mt-4">
            <RetentionCompare {...preview} />
          </div>
          <div
            role="radiogroup"
            aria-label={m['retention.name_price.price_label']()}
            className="mt-4 grid grid-cols-4 gap-2"
          >
            {RETENTION_NAME_PRICE_CENTS.map((amount) => {
              const selected = amount === liveCents;
              return (
                <button
                  key={amount}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => select(amount)}
                  className={`h-11 rounded-full border-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#c8962c] ${
                    selected
                      ? 'border-[#c8962c] text-[#7c5408]'
                      : 'border-[#e6e8ee] text-[#171b27] hover:border-[#c9ced8]'
                  }`}
                >
                  {formatUsd(amount, locale)}
                </button>
              );
            })}
          </div>
          <label className="mt-4 block text-sm font-medium text-[#171b27]">
            {m['retention.name_price.price_label']()}
            <span className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-[#e6e8ee] bg-[#f7f7f8] px-3">
              <span aria-hidden="true" className="text-[#555d6b]">
                $
              </span>
              <input
                value={draft}
                inputMode="decimal"
                autoComplete="off"
                aria-label={m['retention.name_price.price_label']()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitDraft}
                className="w-full bg-transparent text-base outline-none"
              />
            </span>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-[#555d6b]">
            {m['retention.allowance']({ credits: props.offer.credits })}
            {' · '}
            {props.offer.creditsValidDays > 0
              ? m['settings.credits.topup_valid_days']({
                  days: props.offer.creditsValidDays,
                })
              : m['settings.credits.topup_never_expires']()}
          </p>
        </div>
        <div className="flex-none space-y-2 bg-white px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <PayActionRow>
            <Button
              className="h-14 w-full rounded-full border-2 border-[#171b27] bg-[#e6b325] text-base font-bold text-[#1a1206] shadow-[4px_4px_0_#171b27] hover:bg-[#c49212]"
              disabled={checkout.isPending}
              onClick={() =>
                checkout.mutate(retentionNamePriceProductId(commitDraft()))
              }
            >
              {checkout.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {m['common.pricing.processing']()}
                </span>
              ) : (
                m['retention.name_price.buy']({ price })
              )}
            </Button>
            <DeferredApplePay
              amount={liveCents}
              currency="usd"
              label={m['retention.name_price.buy']({ price })}
              disabled={checkout.isPending}
              onPay={(paymentMethodId) =>
                checkout.mutateAsync({
                  productId: retentionNamePriceProductId(liveCents),
                  paymentMethodId,
                })
              }
            />
          </PayActionRow>
          <button
            type="button"
            onClick={props.onCollapse}
            className="mt-3 min-h-8 w-full text-sm text-[#555d6b] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#c8962c]"
          >
            {m['retention.name_price.dismiss']()}
          </button>
        </div>
      </OfferDialog>
    </div>
  );
}

/** Lives in the root so the minimized offer survives client-side navigation. */
export function VideoRetentionOffer() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const queryKey = ['video-retention-offer', userId];
  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () =>
      apiGet<VideoRetentionResponse>('/api/payment/video-retention-offer', {
        cache: 'no-store',
      }),
    retry: false,
    staleTime: 0,
  });
  const offer = userId ? query.data?.offer : null;
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string>();
  const [seconds, setSeconds] = useState(0);
  // Collapsing the bar leaves a pill. A valid offer is never removed.
  const [pill, setPill] = useState(false);
  const deadline = useRef(0);
  const owner = useRef(userId);
  owner.current = userId;

  useEffect(() => {
    setOpen(false);
    setImage(undefined);
    setPill(false);
  }, [userId]);

  useEffect(() => {
    if (!offer) {
      setOpen(false);
      setSeconds(0);
      return;
    }
    // Monotonic time keeps the countdown independent of changes to the device clock.
    deadline.current =
      performance.now() + Math.max(0, offer.expiresAt - offer.serverNow);
    const tick = () =>
      setSeconds(retentionTimeLeft(deadline.current, performance.now()));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [offer]);

  useEffect(() => {
    const sync = () => {
      if (userId) void query.refetch();
    };
    window.addEventListener('pageshow', sync);
    return () => window.removeEventListener('pageshow', sync);
  }, [userId, query.refetch]);

  const issue = useMutation({
    mutationFn: async (request: OfferRequest & { ownerId: string }) => {
      const { image: _, ownerId: __, ...input } = request;
      return apiPost<VideoRetentionResponse>(
        '/api/payment/video-retention-offer',
        input
      );
    },
    onSuccess: async (data, request) => {
      const issuedKey = ['video-retention-offer', request.ownerId];
      await queryClient.cancelQueries({ queryKey: issuedKey });
      if (owner.current !== request.ownerId) return;
      queryClient.setQueryData(issuedKey, data);
      if (data.offer && data.newlyIssued) {
        setImage(request.image);
        setPill(false);
        setOpen(true);
      }
    },
    // An unavailable offer never interrupts the original generation flow.
  });

  useEffect(() => {
    if (!userId) return;
    const request = (event: Event) => {
      if (!issue.isPending)
        issue.mutate({
          ...(event as CustomEvent<OfferRequest>).detail,
          ownerId: userId,
        });
    };
    window.addEventListener(VIDEO_RETENTION_EVENT, request);
    return () => window.removeEventListener(VIDEO_RETENTION_EVENT, request);
  }, [userId, issue.mutate, issue.isPending]);

  if (!offer || seconds <= 0) return null;
  const view: OfferViewProps = {
    offer,
    timer: `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`,
    image,
    open,
    pill,
    generatedCount: query.data?.generatedCount,
    onOpen: () => setOpen(true),
    onCollapse: () => {
      setOpen(false);
      setPill(true);
    },
    onOpenChange: (next) => {
      setOpen(next);
      if (!next) setPill(true);
    },
    onCheckoutError: () => {
      void query.refetch();
    },
  };

  return (
    <Suspense fallback={null}>
      <ABTest
        scene={RETENTION_NAME_PRICE_SCENE}
        a={<ControlRetentionOffer {...view} />}
        b={<NamePriceRetentionOffer {...view} />}
        fallback={<ControlRetentionOffer {...view} />}
      />
    </Suspense>
  );
}
