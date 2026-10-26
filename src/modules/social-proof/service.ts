import { count } from 'drizzle-orm';

import { db } from '@/core/db';
import { user } from '@/config/db/schema';
import { generatedVideoCount } from '@/lib/social-proof';

/**
 * Homepage SSR and the retention dialog would otherwise count accounts on
 * every request. One minute is short enough that a new registration shows
 * up without a redeploy, and matches the in-memory config cache pattern.
 */
const CACHE_TTL_MS = 60_000;

let cached: { count: number; at: number } | null = null;

export async function getGeneratedVideoCount(): Promise<number> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.count;

  const [row] = await db().select({ value: count() }).from(user);
  const next = generatedVideoCount(Number(row?.value ?? 0));
  cached = { count: next, at: now };
  return next;
}
