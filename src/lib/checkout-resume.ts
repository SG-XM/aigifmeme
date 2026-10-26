import {
  sanitizeFunnelMetadata,
  type FunnelEventMetadata,
} from '@/lib/funnel-events';

export const CHECKOUT_PARAM = 'checkout';
export const CHECKOUT_FROM_PARAM = 'checkout_from';
export const CHECKOUT_CANCEL_PARAM = 'checkout_cancel';
export const CHECKOUT_PRODUCT_PARAM = 'checkout_product';

const resumedCheckouts = new Set<string>();

export function isCheckoutProductId(
  value: string | null | undefined
): value is string {
  return Boolean(sanitizeFunnelMetadata({ productId: value })?.productId);
}

export type CheckoutResume = {
  productId: string;
  placement: string;
};

/** Resume only when the return URL names a real product and is not a cancel. */
export function readCheckoutResume(search: string): CheckoutResume | null {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  if (params.get(CHECKOUT_CANCEL_PARAM) === '1') return null;
  const productId = params.get(CHECKOUT_PARAM);
  const placement = sanitizeFunnelMetadata({
    placement: params.get(CHECKOUT_FROM_PARAM),
  })?.placement;
  if (!isCheckoutProductId(productId) || !placement) return null;
  return { productId, placement };
}

export function checkoutReturnPath(
  pathname: string,
  search: string,
  hash: string,
  productId: string,
  placement: string
) {
  const safeProductId = sanitizeFunnelMetadata({ productId })?.productId;
  const safePlacement = sanitizeFunnelMetadata({ placement })?.placement;
  if (!safeProductId || !safePlacement) return pathname || '/';
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  params.delete(CHECKOUT_CANCEL_PARAM);
  params.delete(CHECKOUT_PRODUCT_PARAM);
  params.set(CHECKOUT_PARAM, safeProductId);
  params.set(CHECKOUT_FROM_PARAM, safePlacement);
  const query = params.toString();
  const suffix = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
  return `${pathname || '/'}${query ? `?${query}` : ''}${suffix}`;
}

export function signInHref(returnPath: string) {
  return `/sign-in?redirect=${encodeURIComponent(returnPath)}`;
}

export function stripCheckoutParams(search: string) {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  params.delete(CHECKOUT_PARAM);
  params.delete(CHECKOUT_FROM_PARAM);
  params.delete(CHECKOUT_CANCEL_PARAM);
  params.delete(CHECKOUT_PRODUCT_PARAM);
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function replaceBrowserSearch(search: string) {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${search}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

/**
 * One automatic resume per product per tab. A later manual click still works.
 * Storage failures still claim in memory so a render loop cannot re-enter checkout.
 */
export function claimCheckoutResume(
  productId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
) {
  const key = `checkout-resume:${productId}`;
  if (resumedCheckouts.has(key)) return false;
  const store =
    storage === undefined
      ? typeof sessionStorage === 'undefined'
        ? null
        : sessionStorage
      : storage;
  try {
    if (store?.getItem(key)) {
      resumedCheckouts.add(key);
      return false;
    }
    store?.setItem(key, '1');
  } catch {
    // Private mode and blocked storage still get the in-memory claim below.
  }
  resumedCheckouts.add(key);
  return true;
}

export function checkoutEventMetadata(
  plan: {
    productId?: string;
    priceInCents?: number;
    currency?: string;
  },
  placement: string,
  extra?: FunnelEventMetadata
): FunnelEventMetadata {
  return (
    sanitizeFunnelMetadata({
      productId: plan.productId,
      priceInCents: plan.priceInCents,
      currency: plan.currency,
      placement,
      ...extra,
    }) ?? { placement }
  );
}
