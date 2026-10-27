import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canUseLocalUploadDisk,
  POST,
  STORAGE_NOT_CONFIGURED,
} from './upload-image';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  storage: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/storage/service', () => ({
  getStorage: mocks.storage,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));

function jpegRequest(extra?: (form: FormData) => void) {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'a.jpg', {
    type: 'image/jpeg',
  });
  const form = new FormData();
  form.append('files', file);
  extra?.(form);
  return new Request('https://app.example.com/api/storage/upload-image', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { Cloudflare?: unknown }).Cloudflare;
  mocks.session.mockResolvedValue({ user: { id: 'owner-1' } });
  mocks.storage.mockResolvedValue(null);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
});

describe('upload without R2', () => {
  it('does not write to disk on Workers', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    expect(canUseLocalUploadDisk()).toBe(false);

    const body = await (await POST({ request: jpegRequest() })).json();

    expect(body.message).toBe(STORAGE_NOT_CONFIGURED);
    expect(body.message).not.toMatch(/operation not permitted/i);
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('does not write to disk when the Workers cache binding is present', async () => {
    vi.stubGlobal('caches', { default: {} });
    expect(canUseLocalUploadDisk()).toBe(false);

    const body = await (await POST({ request: jpegRequest() })).json();

    expect(body.message).toBe(STORAGE_NOT_CONFIGURED);
    expect(mocks.mkdir).not.toHaveBeenCalled();
  });

  it('replaces a denied local-disk write with the same message', async () => {
    expect(canUseLocalUploadDisk()).toBe(true);
    mocks.mkdir.mockRejectedValue(
      Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
    );

    const body = await (await POST({ request: jpegRequest() })).json();

    expect(body.message).toBe(STORAGE_NOT_CONFIGURED);
    expect(body.message).not.toMatch(/operation not permitted/i);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('keeps the reference-media message and still skips disk', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });

    const body = await (
      await POST({
        request: jpegRequest((form) => form.append('referenceMedia', 'true')),
      })
    ).json();

    expect(body.message).toMatch(/Public storage is not configured/);
    expect(mocks.mkdir).not.toHaveBeenCalled();
  });
});
