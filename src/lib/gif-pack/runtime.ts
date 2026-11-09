/**
 * A live gpt-image-2 edit on the deployed provider took 43–46 seconds.
 * Cloudflare cancels HTTP waitUntil 30 seconds after the response, so a provider
 * call started there is killed before the PNG is stored and the next run pays again.
 * Scheduled handlers on the paid Workers plan get 15 minutes of wall clock.
 * Nine calls fit in one of those runs. HTTP handlers only queue the job.
 */
export const HTTP_WAIT_UNTIL_MS = 30_000;
export const CRON_WALL_MS = 15 * 60 * 1000;
export const OBSERVED_PROVIDER_CALL_MS = 46_000;
/** Longer than one observed call. A new paid call starts only when this much budget remains, and only after any in-flight mark is older than this. */
export const PROVIDER_CALL_GUARD_MS = 90_000;
export const LOCAL_STEP_GUARD_MS = 15_000;

export function canStartProviderCall(nowMs: number, deadlineMs: number) {
  return deadlineMs - nowMs >= PROVIDER_CALL_GUARD_MS;
}
