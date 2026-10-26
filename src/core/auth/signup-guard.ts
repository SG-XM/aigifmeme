import { and, count, eq, gte } from 'drizzle-orm';

import { db } from '@/core/db';
import { user } from '@/config/db/schema';

/**
 * How many accounts one address may open per day. Signup grants credits, so
 * an open form is a faucet: the cost per account is small, but nothing about
 * it is self-limiting.
 *
 * The count comes from the `user` table rather than an in-memory counter —
 * a Worker's memory is per-isolate and per-colo, which is precisely the
 * granularity a script farming accounts would slip through.
 */
const DEFAULT_DAILY_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function signupsFromIpToday(ip: string): Promise<number> {
  const [row] = await db()
    .select({ value: count() })
    .from(user)
    .where(
      and(
        eq(user.ip, ip),
        gte(user.createdAt, new Date(Date.now() - WINDOW_MS))
      )
    );
  return row?.value ?? 0;
}

export function signupDailyLimit(configs: Record<string, string>): number {
  const raw = configs.signup_ip_daily_limit?.trim();
  if (raw === undefined || raw === '') return DEFAULT_DAILY_LIMIT;
  const parsed = Number(raw);
  // Anything unparseable falls back to the default rather than to "unlimited"
  // — a typo in the admin panel shouldn't quietly open the faucet.
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DAILY_LIMIT;
  return Math.floor(parsed);
}

/**
 * Whether this address has used up its allowance. An unknown address (no
 * proxy header, local development) is never blocked: every such signup would
 * otherwise share one bucket.
 */
export async function signupBlockedForIp(
  ip: string,
  configs: Record<string, string>
): Promise<boolean> {
  const limit = signupDailyLimit(configs);
  if (limit <= 0 || !ip) return false;
  return (await signupsFromIpToday(ip)) >= limit;
}
