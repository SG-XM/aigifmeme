import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route as adminRoute } from '../admin/gif-packs';
import { Route as packRoute } from './$id';
import { Route as fileRoute } from './$id/files/$fileId';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  read: vi.fn(),
  view: vi.fn(),
  remove: vi.fn(),
  records: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/rbac/service', () => ({ hasPermission: mocks.permission }));
vi.mock('@/modules/gif-pack/service', () => ({
  readPackFile: mocks.read,
  packView: mocks.view,
  deleteGifPack: mocks.remove,
  listAdminRecords: mocks.records,
  listAdminDemos: vi.fn(),
  listThemes: vi.fn(),
  publishThemeVersion: vi.fn(),
}));

type Handlers = {
  server: { handlers: Record<string, (input: any) => Promise<Response>> };
};
const handlers = (route: unknown) => (route as Handlers).server.handlers;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'user-a' } });
  mocks.permission.mockResolvedValue(false);
});

describe('GIF pack authorization', () => {
  it('rejects anonymous reads and does not touch storage', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await handlers(fileRoute).GET({
      request: new Request('https://aigifmeme.com/api/gif-packs/p/files/f'),
      params: { id: 'p', fileId: 'f' },
    });
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('does not return another user’s file', async () => {
    mocks.read.mockResolvedValue(null);
    const response = await handlers(fileRoute).GET({
      request: new Request('https://aigifmeme.com/api/gif-packs/p/files/f'),
      params: { id: 'p', fileId: 'f' },
    });
    expect(response.status).toBe(404);
    expect(mocks.read).toHaveBeenCalledWith('p', 'f', 'user-a', false);
  });

  it('lets an admin read a private file and blocks admin APIs for users', async () => {
    mocks.permission.mockResolvedValueOnce(true);
    mocks.read.mockResolvedValue({
      bytes: new Uint8Array([71, 73, 70]),
      contentType: 'image/gif',
      kind: 'gif',
    });
    const ok = await handlers(fileRoute).GET({
      request: new Request('https://aigifmeme.com/api/gif-packs/p/files/f'),
      params: { id: 'p', fileId: 'f' },
    });
    expect(ok.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('p', 'f', 'user-a', true);

    mocks.permission.mockResolvedValue(false);
    const denied = await handlers(adminRoute).GET({
      request: new Request('https://aigifmeme.com/api/admin/gif-packs'),
    });
    expect(denied.status).toBe(403);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('treats a failed delete by another user as not found', async () => {
    mocks.remove.mockResolvedValue(false);
    const response = await handlers(packRoute).DELETE({
      request: new Request('https://aigifmeme.com/api/gif-packs/p', {
        method: 'DELETE',
      }),
      params: { id: 'p' },
    });
    expect(response.status).toBe(404);
    expect(mocks.remove).toHaveBeenCalledWith('p', 'user-a', false);
  });
});
