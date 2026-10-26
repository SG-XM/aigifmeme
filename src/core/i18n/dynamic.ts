import { m } from '@/paraglide/messages.js';

// Dynamic message lookup for keys built at runtime (tab labels, keyed
// lists). Prefer static `m["ns.key"]()` whenever the key is known.
// Catalogs are split per locale; a missing key falls back to the key.
export function tDynamic(key: string): string {
  const fn = (m as Record<string, unknown>)[key];
  return typeof fn === 'function' ? (fn as () => string)() : key;
}
