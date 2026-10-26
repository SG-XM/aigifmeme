import { lazy, Suspense } from 'react';

const ApplePayButton = lazy(() =>
  import('@/components/apple-pay-button').then((mod) => ({
    default: mod.ApplePayButton,
  }))
);

/**
 * Loads the Apple Pay / Stripe.js chunk only when this row is rendered.
 * Callers mount it after the paywall is on screen or the visitor clicks buy.
 */
export function DeferredApplePay(props: {
  amount: number;
  currency: string;
  label: string;
  buttonType?: 'buy' | 'subscribe';
  disabled?: boolean;
  onPay: (paymentMethodId: string) => Promise<unknown>;
}) {
  return (
    <Suspense fallback={null}>
      <ApplePayButton {...props} />
    </Suspense>
  );
}
