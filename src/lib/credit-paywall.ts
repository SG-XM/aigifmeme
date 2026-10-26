/** Insufficient-credit dialog. A is the single pack; B leads with Basic monthly. */
export const CREDIT_PAYWALL_SCENE = 'paywall-sub-first-v1';

export type CompactOfferPriority =
  | 'duo-first'
  | 'single-first'
  | 'basic-sub-first';

const SINGLE_PACK_ORDER = ['single_v2', 'duo_v2', 'crew_v2'] as const;
const DUO_PACK_ORDER = ['duo_v2', 'single_v2', 'crew_v2'] as const;

/** Pack order inside the collapsed paywall and the expanded pack list. */
export function compactPackProductIds(priority: CompactOfferPriority) {
  return priority === 'duo-first'
    ? [...DUO_PACK_ORDER]
    : [...SINGLE_PACK_ORDER];
}

/**
 * Highlighted offer. Basic monthly leads only for the subscription-first arm.
 * If that plan is missing, the single pack stays highlighted.
 */
export function compactLeadProductId(
  priority: CompactOfferPriority,
  basicProductId?: string
) {
  if (priority === 'basic-sub-first' && basicProductId) return basicProductId;
  if (priority === 'duo-first') return 'duo_v2';
  return 'single_v2';
}

export function subscriptionLeadsCollapsed(priority: CompactOfferPriority) {
  return priority === 'basic-sub-first';
}
