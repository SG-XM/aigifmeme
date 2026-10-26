import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  applePayMountDecision,
  expressCheckoutHasApplePay,
  isIphone,
  loadStripeClient,
} from '@/lib/apple-pay';
import {
  APPLE_PAY_PROBE_TIMEOUT_MS,
  expressCheckoutElementOptions,
  getApplePayProbeServerSnapshot,
  getApplePayProbeSnapshot,
  retainApplePayProbe,
  subscribeApplePayProbe,
} from '@/lib/apple-pay-probe';
import { cn } from '@/lib/utils';
import { usePublicConfig } from '@/hooks/use-public-config';

export { APPLE_PAY_PROBE_TIMEOUT_MS };
export { PayActionRow } from '@/components/pay-action-row';

function subscribeIphone() {
  return () => {};
}

/**
 * Official Apple Pay button on iPhone for a positive USD or EUR charge.
 * One page-level probe loads Stripe.js and mounts one painted Express Checkout
 * element outside the row. Checkout buttons stay full width until that probe
 * says Apple Pay is available, then each CTA mounts its own button.
 */
export function ApplePayButton({
  amount,
  currency,
  label,
  buttonType = 'buy',
  disabled,
  onPay,
}: {
  amount: number;
  currency: string;
  label: string;
  buttonType?: 'buy' | 'subscribe';
  disabled?: boolean;
  onPay: (paymentMethodId: string) => Promise<unknown>;
}) {
  const { data: configs } = usePublicConfig();
  const publishableKey =
    configs?.stripe_enabled === 'true' ? configs.stripe_publishable_key : '';
  const mountRef = useRef<HTMLDivElement>(null);
  const onPayRef = useRef(onPay);
  const disabledRef = useRef(disabled);
  const amountRef = useRef(amount);
  const labelRef = useRef(label);
  const seedRef = useRef({ currency, amount, buttonType });
  const elementsRef = useRef<{
    update: (options: { amount: number }) => void;
    submit: () => Promise<{ error?: { message?: string } }>;
  } | null>(null);
  onPayRef.current = onPay;
  disabledRef.current = disabled;
  amountRef.current = amount;
  labelRef.current = label;
  seedRef.current = { currency, amount, buttonType };
  const iphone = useSyncExternalStore(
    subscribeIphone,
    () => isIphone(),
    () => false
  );
  const probe = useSyncExternalStore(
    subscribeApplePayProbe,
    getApplePayProbeSnapshot,
    getApplePayProbeServerSnapshot
  );
  const decision = applePayMountDecision({
    iphone,
    publishableKey,
    currency,
    amount,
  });
  const eligible = decision.mount;
  const [hiddenAttempt, setHiddenAttempt] = useState<number | null>(null);
  const hidden = hiddenAttempt === probe.attempt;
  const show =
    eligible && probe.status === 'ready' && probe.applePay && !hidden;

  useEffect(() => {
    elementsRef.current?.update({ amount });
  }, [amount]);

  useEffect(() => {
    if (!eligible || !publishableKey) return;
    const seed = seedRef.current;
    return retainApplePayProbe({
      publishableKey,
      currency: seed.currency,
      amount: seed.amount,
      buttonType: seed.buttonType,
    });
  }, [eligible, publishableKey]);

  useEffect(() => {
    if (!show || !publishableKey) return;
    const mount = mountRef.current;
    if (!mount) return;
    const attempt = probe.attempt;
    let live = true;
    let unmountElement: (() => void) | undefined;
    const hide = () => {
      if (!live) return;
      setHiddenAttempt(attempt);
    };
    void (async () => {
      try {
        const stripe = await loadStripeClient(publishableKey);
        if (!live || !mount.isConnected) return;
        if (!stripe) {
          hide();
          return;
        }
        const elements = stripe.elements({
          mode: 'payment',
          amount: amountRef.current,
          currency: currency.toLowerCase(),
          paymentMethodCreation: 'manual',
        });
        elementsRef.current = elements;
        const element = elements.create(
          'expressCheckout',
          expressCheckoutElementOptions(buttonType)
        );
        unmountElement = () => element.unmount();
        element.on('ready', (event) => {
          if (!expressCheckoutHasApplePay(event)) hide();
        });
        element.on('availablepaymentmethodschange', (event) => {
          if (!live) return;
          if (!expressCheckoutHasApplePay(event)) hide();
        });
        element.on('loaderror', () => {
          hide();
        });
        element.on('click', (event) => {
          if (disabledRef.current) {
            event.reject();
            return;
          }
          event.resolve({
            lineItems: [
              {
                name: labelRef.current.slice(0, 80) || 'Total',
                amount: amountRef.current,
              },
            ],
          });
        });
        element.on('confirm', async (event) => {
          if (disabledRef.current) {
            event.paymentFailed({ reason: 'fail' });
            return;
          }
          const { error: submitError } = await elements.submit();
          if (submitError) {
            event.paymentFailed({ reason: 'fail' });
            return;
          }
          const created = await stripe.createPaymentMethod({ elements });
          if (created.error || !created.paymentMethod) {
            event.paymentFailed({ reason: 'fail' });
            return;
          }
          try {
            await onPayRef.current(created.paymentMethod.id);
          } catch {
            event.paymentFailed({ reason: 'fail' });
          }
        });
        if (!live || !mount.isConnected) return;
        element.mount(mount);
      } catch {
        hide();
      }
    })();
    return () => {
      live = false;
      elementsRef.current = null;
      unmountElement?.();
    };
  }, [buttonType, currency, probe.attempt, publishableKey, show]);

  if (!show) return null;
  return (
    <div
      ref={mountRef}
      data-apple-pay="ready"
      className={cn(
        'min-h-11 min-w-[min(100%,8rem)] flex-1',
        disabled && 'pointer-events-none opacity-60'
      )}
    />
  );
}
