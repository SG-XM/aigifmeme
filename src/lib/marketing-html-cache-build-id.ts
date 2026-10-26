/**
 * Suffix for the marketing HTML cache key. Empty in git.
 *
 * `pnpm cf:build` overwrites this for the Workers bundle, then restores
 * this empty value. Dev and `pnpm build` leave it empty; the manual epoch
 * in marketing-html-cache.ts still applies.
 */
export const MARKETING_HTML_CACHE_BUILD_ID = '';
