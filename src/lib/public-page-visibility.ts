import { normalizePublicPath } from './gone-paths';

/**
 * Pages omitted from the public site. Pricing stays published: the live
 * catalog is the enabled plans and top-ups already in the database.
 */
const HIDDEN_PUBLIC_PATHS = new Set<string>();

export function isHiddenPublicPath(path: string): boolean {
  return HIDDEN_PUBLIC_PATHS.has(normalizePublicPath(path));
}
