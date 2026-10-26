/**
 * Measurement IDs are sometimes saved with a wrapping quote, for example
 * `G-VL4PJW7S79"`. Trim and drop quotes that sit on either end.
 */
export function sanitizeGoogleAnalyticsId(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.replace(/^['"]+|['"]+$/g, '').trim();
}
