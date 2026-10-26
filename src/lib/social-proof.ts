/** Claim figures for the quality-proof line. The live count is separate. */
export const QUALITY_PROOF_VIDEOS = 200;
export const QUALITY_PROOF_ROUNDS = 50;

/** Locale digits and grouping for proof copy. Messages take the formatted text. */
export function formatProofNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * People shown as having generated a video: registered accounts × 6 + 3.
 * The displayed number is always derived from a live user count.
 */
export function generatedVideoCount(registeredUsers: number): number {
  const users = Number(registeredUsers);
  if (!Number.isFinite(users) || users < 0) return 3;
  return Math.floor(users) * 6 + 3;
}
