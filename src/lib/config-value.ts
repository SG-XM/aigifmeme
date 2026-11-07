/**
 * Config rows store text. A value that is one JSON string literal is the
 * encoded form of that string (for example `"seedance-12s-v2"`), which is
 * what a JSON parameter bind or a JSON seed dump writes. Decode only that
 * shape. Numbers, objects, booleans, and plain text stay unchanged, and a
 * failed parse stays unchanged. This is not quote trimming.
 */
export function decodeStoredConfigString(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}
