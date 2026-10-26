import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './video-retention-offer';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as any,
  balance: 0,
  credits: 10,
  enabled: true,
  issue: vi.fn(async () => ({
    offer: { priceInCents: 799 },
    newlyIssued: true,
  })),
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: async () => mocks.session } }),
}));
vi.mock('@/modules/credits/service', () => ({
  getBalance: async () => mocks.balance,
  requireCurrentCreditPricing: async () => {},
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => ({ stripe_enabled: String(mocks.enabled) }),
}));
vi.mock('@/modules/social-proof/service', () => ({
  getGeneratedVideoCount: async () => 15,
}));
vi.mock('@/modules/video-retention-offers/service', () => ({
  getRetentionProduct: async () => ({ credits: mocks.credits }),
  getVideoRetentionOffer: async () => ({ offer: null }),
  issueVideoRetentionOffer: mocks.issue,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));
const input = {
  campaign: 'bulin',
  modelOption: 'seedance-2-mini',
  duration: 12,
  resolution: '720p',
};
const req = (body: unknown, headers = {}) => ({
  request: new Request(
    'https://example.test/api/payment/video-retention-offer',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.test',
        ...headers,
      },
      body: JSON.stringify(body),
    }
  ),
});
beforeEach(() => {
  mocks.session = { user: { id: 'u1' } };
  mocks.balance = 0;
  mocks.credits = 10;
  mocks.enabled = true;
  mocks.issue.mockClear();
});
describe('retention issuance API', () => {
  it('requires authentication for reads and writes', async () => {
    mocks.session = null;
    expect(
      (
        await GET({
          request: new Request(
            'https://example.test/api/payment/video-retention-offer'
          ),
        })
      ).status
    ).toBe(401);
    expect((await POST(req(input))).status).toBe(401);
  });
  it('blocks cross-site issuance', async () => {
    expect(
      (await POST(req(input, { Origin: 'https://attacker.test' }))).status
    ).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('derives the cost from supported server settings and issues to the authenticated account', async () => {
    const issued = await (await POST(req(input))).json();
    expect(issued.code).toBe(0);
    expect(issued.data.generatedCount).toBe(15);
    expect(mocks.issue).toHaveBeenCalledWith('u1', '/#create', 'bulin');
  });
  it('issues peeper to the window peeper create anchor and keeps bridges on its own', async () => {
    expect(
      (await (await POST(req({ ...input, campaign: 'peeper' }))).json()).code
    ).toBe(0);
    expect(mocks.issue).toHaveBeenCalledWith(
      'u1',
      '/window-peeper#create',
      'peeper'
    );
    mocks.issue.mockClear();
    expect(
      (await (await POST(req({ ...input, campaign: 'bridges' }))).json()).code
    ).toBe(0);
    expect(mocks.issue).toHaveBeenCalledWith(
      'u1',
      '/burning-bridges-ai#create',
      'bridges'
    );
  });
  it('does not offer a package that cannot cover the selected video', async () => {
    expect(
      (
        await (
          await POST(req({ ...input, modelOption: 'seedance-2-5' }))
        ).json()
      ).data.offer
    ).toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('does not interrupt users with enough credits or a disabled provider', async () => {
    mocks.balance = 10;
    expect((await (await POST(req(input))).json()).data.offer).toBeNull();
    mocks.balance = 0;
    mocks.enabled = false;
    expect((await (await POST(req(input))).json()).data.offer).toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('rejects forged costs and unsupported settings', async () => {
    expect((await (await POST(req({ ...input, cost: 1 }))).json()).code).toBe(
      -1
    );
    expect(
      (await (await POST(req({ ...input, duration: 1 }))).json()).code
    ).toBe(-1);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
