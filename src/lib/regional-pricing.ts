// Euro-area members, including Bulgaria from January 2026.
// https://www.ecb.europa.eu/euro/intro/html/index.en.html
const EURO_AREA_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
]);

/** Cloudflare supplies country independently of the selected UI language. */
export function isEuroAreaRequest(request: Request): boolean {
  const country =
    (request as Request & { cf?: { country?: string } }).cf?.country ??
    request.headers.get('CF-IPCountry');
  return EURO_AREA_COUNTRIES.has(country?.trim().toUpperCase() ?? '');
}

/** Fixed EUR prices use the catalog's numeric amount, rather than live FX. */
export function regionalPrice<T extends { currency: string }>(
  product: T,
  request: Request
): T {
  return product.currency.toLowerCase() === 'usd' && isEuroAreaRequest(request)
    ? { ...product, currency: 'eur' }
    : product;
}
