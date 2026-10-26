import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  readRecallToken,
  recallEmailKey,
  recallToken,
  verifyRecallWebhook,
} from './email-recall-token';

vi.mock('@/config', () => ({
  envConfigs: {
    auth_secret: 'long-test-secret-at-least-thirty-two-characters',
  },
  AUTH_SECRET_PLACEHOLDER: 'placeholder',
}));
describe('recall capabilities', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('rejects altered tokens and capability reuse across purposes', () => {
    const token = recallToken(id, 'checkout');
    expect(readRecallToken(token, 'checkout')).toBe(id);
    expect(readRecallToken(token + 'x', 'checkout')).toBeNull();
    expect(readRecallToken(token, 'unsubscribe')).toBeNull();
    expect(recallEmailKey(' ONE@example.com ')).toBe(
      recallEmailKey('one@example.com')
    );
  });
  it('accepts only signed raw webhook bodies within the replay window', () => {
    const raw = '{"type":"email.bounced"}';
    const now = Date.now(),
      timestamp = String(Math.floor(now / 1000));
    const key = Buffer.from('webhook-test-key').toString('base64');
    const signature = createHmac('sha256', Buffer.from(key, 'base64'))
      .update('event1.' + timestamp + '.' + raw)
      .digest('base64');
    const headers = new Headers({
      'svix-id': 'event1',
      'svix-timestamp': timestamp,
      'svix-signature': 'v1,' + signature,
    });
    expect(verifyRecallWebhook(raw, headers, 'whsec_' + key, now)).toBe(true);
    expect(verifyRecallWebhook(raw + ' ', headers, 'whsec_' + key, now)).toBe(
      false
    );
    expect(
      verifyRecallWebhook(raw, headers, 'whsec_' + key, now + 600_000)
    ).toBe(false);
  });
});
