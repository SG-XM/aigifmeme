import { normalizePublicPath } from './gone-paths';

/**
 * Pages omitted from the product for now. Pricing and the other settings
 * pages stay up. Payment and subscription APIs are unchanged.
 */
const HIDDEN_PUBLIC_PATHS = new Set<string>([
  '/settings/payments',
  '/settings/billing',
]);

export function isHiddenPublicPath(path: string): boolean {
  return HIDDEN_PUBLIC_PATHS.has(normalizePublicPath(path));
}
