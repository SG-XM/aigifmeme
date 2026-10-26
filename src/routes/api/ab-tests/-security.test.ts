import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route as adminRoute } from '../admin/ab-tests';
import { Route as assignmentRoute } from './assign';
import { Route as exposureRoute } from './exposure';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  assign: vi.fn(),
  expose: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  stats: vi.fn(),
  transition: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/rbac/service', () => ({ hasPermission: mocks.permission }));
vi.mock('@/modules/ab-tests/service', () => ({
  assignParticipant: mocks.assign,
  recordExposure: mocks.expose,
  createExperiment: mocks.create,
  listExperiments: mocks.list,
  getExperimentStats: mocks.stats,
  transitionExperiment: mocks.transition,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));

type Handlers = {
  server: {
    handlers: Record<
      string,
      (input: { request: Request }) => Promise<Response>
    >;
  };
};
const handlers = (route: unknown) => (route as Handlers).server.handlers;
const request = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'current-user' } });
  mocks.permission.mockResolvedValue(false);
});

describe('A/B API authorization', () => {
  it('requires a session for assignment and exposure', async () => {
    mocks.session.mockResolvedValue(null);
    expect(
      (
        await handlers(assignmentRoute).POST({
          request: request({ scene: 'pricing' }),
        })
      ).status
    ).toBe(401);
    expect(
      (
        await handlers(exposureRoute).POST({
          request: request({ participantId: '123' }),
        })
      ).status
    ).toBe(401);
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.expose).not.toHaveBeenCalled();
  });
  it('does not use user identity or a variant supplied in an assignment request', async () => {
    mocks.assign.mockResolvedValue(null);
    await handlers(assignmentRoute).POST({
      request: request({ scene: 'pricing', userId: 'victim', variant: 'B' }),
    });
    expect(mocks.assign).toHaveBeenCalledWith('pricing', 'current-user');
  });
  it('binds exposure to the current session user', async () => {
    const id = 'b046f93d-5f1c-44e7-9b33-75b9c9993129';
    await handlers(exposureRoute).POST({
      request: request({ participantId: id, userId: 'victim' }),
    });
    expect(mocks.expose).toHaveBeenCalledWith(id, 'current-user');
  });
  it('rejects cross-origin mutations before any writes', async () => {
    for (const route of [assignmentRoute, exposureRoute, adminRoute]) {
      expect(
        (
          await handlers(route).POST({
            request: request({ scene: 'pricing' }, 'https://evil.test'),
          })
        ).status
      ).toBe(403);
    }
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.expose).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('requires administrator permission for reports and management', async () => {
    expect(
      (
        await handlers(adminRoute).GET({
          request: new Request('https://app.test/api/admin/ab-tests'),
        })
      ).status
    ).toBe(403);
    expect(
      (await handlers(adminRoute).POST({ request: request({}) })).status
    ).toBe(403);
    expect(
      (await handlers(adminRoute).PATCH({ request: request({}) })).status
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('validates allocation and immutable lifecycle actions', async () => {
    mocks.permission.mockResolvedValue(true);
    const invalid = {
      key: 'test-key',
      name: 'Test',
      scene: 'pricing',
      productScope: 'subscription',
      bPercent: 0,
      windowDays: 7,
    };
    expect(
      (await handlers(adminRoute).POST({ request: request(invalid) })).status
    ).toBe(400);
    expect(
      (
        await handlers(adminRoute).PATCH({
          request: request({
            id: 'b046f93d-5f1c-44e7-9b33-75b9c9993129',
            action: 'edit',
            bPercent: 99,
          }),
        })
      ).status
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
