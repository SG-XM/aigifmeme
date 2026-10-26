import { Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { apiGet, apiPost } from '@/lib/api-client';
import { settleCheckout, type CheckoutRedirect } from '@/lib/apple-pay';
import { WEREWOLF_OFFER_MEDIA } from '@/lib/bulin-reference';
import {
  DUO_UPGRADE_PRODUCT_ID,
  type DuoUpgradeResponse,
} from '@/lib/duo-upgrade';
import {
  formatProofNumber,
  QUALITY_PROOF_ROUNDS,
  QUALITY_PROOF_VIDEOS,
} from '@/lib/social-proof';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { usePublicConfig } from '@/hooks/use-public-config';
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

const WEREWOLF_VIDEO = WEREWOLF_OFFER_MEDIA.src;
const WEREWOLF_POSTER = WEREWOLF_OFFER_MEDIA.poster;
const WEREWOLF_IMAGE = WEREWOLF_OFFER_MEDIA.image;

/**
 * Shown once per eligible paid single order (the GET claims the showing
 * server-side), right after purchase, wherever the buyer lands on the site.
 */
export function DuoUpgradeOffer() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [closed, setClosed] = useState(false);
  const query = useQuery({
    queryKey: ['duo-upgrade-offer', userId],
    enabled: !!userId,
    queryFn: () =>
      apiGet<DuoUpgradeResponse>('/api/payment/duo-upgrade-offer', {
        cache: 'no-store',
      }),
    retry: false,
    staleTime: Infinity,
  });
  const offer = !closed && userId ? query.data?.offer : null;

  useEffect(() => {
    const sync = () => {
      if (userId) void query.refetch();
    };
    window.addEventListener('pageshow', sync);
    return () => window.removeEventListener('pageshow', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const { data: configs } = usePublicConfig();
  const checkout = useMutation({
    mutationFn: async (paymentMethodId?: string) => {
      const data = await apiPost<CheckoutRedirect>('/api/payment/checkout', {
        product_id: DUO_UPGRADE_PRODUCT_ID,
        upgrade_of_order_id: offer?.originalOrderNo,
        payment_provider: 'stripe',
        redirect: '/create',
        ...(paymentMethodId
          ? { apple_pay_payment_method: paymentMethodId }
          : {}),
      });
      await settleCheckout(data, configs?.stripe_publishable_key);
      return data;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!offer) return null;

  return (
    <Suspense fallback={null}>
      <DuoUpgradeDialog
        offer={offer}
        checkout={checkout}
        onClose={() => setClosed(true)}
      />
    </Suspense>
  );
}

function DuoUpgradeDialog({
  offer,
  checkout,
  onClose,
}: {
  offer: NonNullable<DuoUpgradeResponse['offer']>;
  checkout: {
    isPending: boolean;
    mutate: (paymentMethodId?: string) => void;
    mutateAsync: (paymentMethodId: string) => Promise<CheckoutRedirect>;
  };
  onClose: () => void;
}) {
  const locale = getLocale();
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: offer.currency.toUpperCase(),
    }).format(cents / 100);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto border-0 bg-white p-0 text-[#171b27]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={m['duo_upgrade.close']()}
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-xl bg-white/80 hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-[#ff4f00]"
        >
          <X className="size-5" />
        </button>
        <DialogHeader className="border-b border-[#e2e5ea] p-6 pr-16">
          <p className="text-xs font-semibold tracking-wide text-[#ff4f00] uppercase">
            {m['duo_upgrade.eyebrow']()}
          </p>
          <DialogTitle className="text-3xl font-bold tracking-tight">
            {m['duo_upgrade.headline']({
              count: offer.standardVideoCount,
              price: money(offer.duoPriceInCents),
            })}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#555d6b]">
            {m['duo_upgrade.description']()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3">
            <img
              src={WEREWOLF_IMAGE}
              alt=""
              className="aspect-[3/4] w-full rounded-xl bg-white object-contain"
            />
            <video
              src={WEREWOLF_VIDEO}
              poster={WEREWOLF_POSTER}
              autoPlay
              muted
              loop
              playsInline
              className="aspect-[3/4] w-full rounded-xl object-cover"
            />
          </div>
          <div className="rounded-xl border-2 border-[#ff4f00] bg-[#fff6f1] px-4 py-3">
            <p className="text-sm leading-relaxed font-medium">
              {m['proof.quality']({
                videos: formatProofNumber(QUALITY_PROOF_VIDEOS, locale),
                rounds: formatProofNumber(QUALITY_PROOF_ROUNDS, locale),
              })}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[#9aa1ad]">
            {m['duo_upgrade.standard_note']()}
          </p>
          <div className="space-y-1 border-y border-[#e2e5ea] py-4 text-sm">
            <p className="flex justify-between">
              <span className="text-[#555d6b]">
                {m['duo_upgrade.allowance']({
                  credits: offer.remainingCredits,
                  total: offer.duoCredits,
                })}
              </span>
              <span className="font-semibold">
                {money(offer.duoPriceInCents)}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-[#555d6b]">
                {m['duo_upgrade.already_paid']()}
              </span>
              <span className="font-semibold">−{money(offer.paidInCents)}</span>
            </p>
            <p className="flex justify-between text-base">
              <span className="font-semibold">
                {m['duo_upgrade.due_today']()}
              </span>
              <span className="font-bold text-[#ff4f00]">
                {money(offer.differenceInCents)}
              </span>
            </p>
          </div>
          <PayActionRow>
            <Button
              className="h-12 w-full bg-[#ff4f00] text-base text-white hover:bg-[#e44700]"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate(undefined)}
            >
              {checkout.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {m['common.pricing.processing']()}
                </>
              ) : (
                m['duo_upgrade.buy']({ price: money(offer.differenceInCents) })
              )}
            </Button>
            <DeferredApplePay
              amount={offer.differenceInCents}
              currency={offer.currency}
              label={m['duo_upgrade.buy']({
                price: money(offer.differenceInCents),
              })}
              disabled={checkout.isPending}
              onPay={(paymentMethodId) => checkout.mutateAsync(paymentMethodId)}
            />
          </PayActionRow>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-xl text-sm text-[#555d6b] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#ff4f00]"
          >
            {m['duo_upgrade.later']()}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
