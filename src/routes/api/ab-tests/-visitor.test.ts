import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route } from './visitor';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  assign: vi.fn(),
  event: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/ab-tests/service', () => ({
  assignVisitor: mocks.assign,
  recordVisitorEvent: mocks.event,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));
const handler = (
  Route as unknown as {
    server: {
      handlers: { POST: (input: { request: Request }) => Promise<Response> };
    };
  }
).server.handlers.POST;
const request = (body: unknown, cookie = '', origin = 'https://app.test') =>
  new Request('https://app.test/api/ab-tests/visitor', {
    method: 'POST',
    headers: { cookie, origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.assign.mockResolvedValue({ variant: 'B' });
});
describe('visitor identity boundaries', () => {
  it('permits anonymous assignment with a secure HttpOnly identity and ignores body identities and variants', async () => {
    const response = await handler({
      request: request({
        action: 'assign',
        visitorId: 'attacker',
        userId: 'victim',
        variant: 'B',
      }),
    });
    expect(response.headers.get('set-cookie')).toContain(
      'HttpOnly; SameSite=Lax; Secure'
    );
    expect(mocks.assign).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      undefined
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('binds authenticated assignments to the session user and stable cookie', async () => {
    const id = 'b046f93d-5f1c-44e7-9b33-75b9c9993129';
    mocks.session.mockResolvedValue({ user: { id: 'owner' } });
    const response = await handler({
      request: request(
        { action: 'assign', userId: 'victim' },
        `ab_home_visitor=${id}`
      ),
    });
    expect(mocks.assign).toHaveBeenCalledWith(id, 'owner');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('rejects cross-site requests and events without the owning cookie', async () => {
    expect(
      (
        await handler({
          request: request({ action: 'assign' }, '', 'https://evil.test'),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await handler({
          request: request({
            action: 'exposure',
            participantId: 'b046f93d-5f1c-44e7-9b33-75b9c9993129',
          }),
        })
      ).status
    ).toBe(400);
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });
});
