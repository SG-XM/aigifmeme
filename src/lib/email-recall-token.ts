import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { AUTH_SECRET_PLACEHOLDER, envConfigs } from '@/config';

const UUID = /^[0-9a-f-]{36}$/;
function secret() {
  const value = envConfigs.auth_secret;
  if (!value || value === AUTH_SECRET_PLACEHOLDER || value.length < 32)
    throw new Error('Configure a strong AUTH_SECRET before using recall links');
  return value;
}
export function recallEmailKey(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
export function recallToken(id: string, purpose: 'checkout' | 'unsubscribe') {
  if (!UUID.test(id)) throw new Error('Invalid recall ID');
  const signature = createHmac('sha256', secret())
    .update('email-recall/v1/' + purpose + '/' + id)
    .digest('base64url');
  return id + '.' + signature;
}
export function readRecallToken(
  token: unknown,
  purpose: 'checkout' | 'unsubscribe'
): string | null {
  if (typeof token !== 'string' || token.length > 100) return null;
  const [id, signature, extra] = token.split('.');
  if (!id || !UUID.test(id) || !signature || extra) return null;
  const expected = recallToken(id, purpose).split('.')[1];
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
    ? id
    : null;
}

/** Verify raw Resend/Svix webhooks without adding another SDK dependency. */
export function verifyRecallWebhook(
  raw: string,
  headers: Headers,
  webhookSecret: string,
  now = Date.now()
): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!id || !timestamp || !signatures || !webhookSecret.startsWith('whsec_'))
    return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300)
    return false;
  const expected = createHmac(
    'sha256',
    Buffer.from(webhookSecret.slice(6), 'base64')
  )
    .update(id + '.' + timestamp + '.' + raw)
    .digest();
  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const actual = Buffer.from(signature, 'base64');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}
