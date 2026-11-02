import { normalizePublicPath } from './gone-paths';

/** Temporarily hidden pages. Remove an entry to restore its route and links. */
const HIDDEN_PUBLIC_PATHS = new Set(['/pricing']);

export function isHiddenPublicPath(path: string): boolean {
  return HIDDEN_PUBLIC_PATHS.has(normalizePublicPath(path));
}
