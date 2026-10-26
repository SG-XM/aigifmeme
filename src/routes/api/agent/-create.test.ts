import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './create';
import { GET } from './create-tasks';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  tasks: vi.fn(),
  run: vi.fn(),
  refresh: vi.fn(),
  configs: { kie_api_key: 'k' } as Record<string, string>,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/ai-tasks/service', () => ({ getCreateTasks: mocks.tasks }));
vi.mock('@/modules/agent/tools', () => ({
  runVideoGeneration: mocks.run,
  refreshCreateVideo: mocks.refresh,
  createVideoProviderOverride: (configs: Record<string, string | undefined>) =>
    configs.default_video_provider === 'apimart' && configs.apimart_api_key
      ? 'apimart'
      : 'kie',
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => mocks.configs,
}));
vi.mock('@/modules/storage/service', () => ({
  getStorage: async () => ({
    getPublicUrl: () => 'https://media.example.com/uploads/reference',
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));
const payload = {
  campaign: 'bulin',
  take: 0,
  images: ['https://media.example.com/photo.png'],
  settings: {
    modelName: 'seedance-2-mini',
    resolution: '720p',
    aspectRatio: '9:16',
    duration: 12,
  },
};
function request(value = payload) {
  return new Request('https://app.example.com/api/agent/create', {
    method: 'POST',
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configs = { kie_api_key: 'k' };
  mocks.session.mockResolvedValue({ user: { id: 'owner-1' } });
  mocks.tasks.mockResolvedValue([]);
  mocks.run.mockResolvedValue(
    JSON.stringify({ status: 'processing', taskId: 't1' })
  );
});

describe('Create authorization and ownership', () => {
  it('requires authentication for submission and task listing', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST({ request: request() })).status).toBe(401);
    expect(
      (
        await GET({
          request: new Request(
            'https://app.example.com/api/agent/create-tasks'
          ),
        })
      ).status
    ).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
  });
  it('scopes creation to the authenticated owner and bypasses Chat', async () => {
    expect((await (await POST({ request: request() })).json()).code).toBe(0);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({ userId: 'owner-1' }),
        providerOverride: 'kie',
        deferPolling: true,
      })
    );
  });
  it('submits to APIMart only after an admin selects it', async () => {
    mocks.configs = {
      default_video_provider: 'apimart',
      apimart_api_key: 'sk-test',
    };
    await POST({ request: request() });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ providerOverride: 'apimart' })
    );
  });
  it('pins the 7–22 second video and matching soundtrack for every Bulin job', async () => {
    await POST({ request: request(payload) });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          useSampleSoundtrack: true,
          soundtrackVersion: 'from7s15s',
          settings: expect.objectContaining({ audioMode: 'silent' }),
        }),
        options: expect.objectContaining({
          referenceVideoVersion: 'from7s15s',
          reference_video_urls: expect.any(Array),
        }),
      })
    );
  });
  it('rejects image URLs outside configured storage before any provider call', async () => {
    expect(
      (
        await (
          await POST({
            request: request({
              ...payload,
              images: ['https://other.example.com/photo.png'],
            }),
          })
        ).json()
      ).code
    ).toBe(-1);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('lists only owner-scoped tasks', async () => {
    await GET({
      request: new Request('https://app.example.com/api/agent/create-tasks'),
    });
    expect(mocks.tasks).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ activeOnly: false, limit: 20 })
    );
  });
});

describe('Window Peeper creation', () => {
  it('attaches the night-window clip and muxes its soundtrack', async () => {
    await POST({
      request: request({
        ...payload,
        campaign: 'peeper',
      }),
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          useSampleSoundtrack: true,
          soundtrackVersion: 'windowPeeper',
          settings: expect.objectContaining({ audioMode: 'silent' }),
        }),
        prompt: expect.stringContaining('big bite of a burger'),
        options: expect.objectContaining({
          referenceVideoVersion: 'windowPeeper',
          reference_video_urls: [
            'https://media.uptownfunkai.video/reference/window-peeper-master.mp4',
          ],
        }),
      })
    );
    const prompt = mocks.run.mock.calls.at(-1)?.[0].prompt as string;
    expect(prompt).not.toContain('Generate no audio');
    expect(prompt).toContain('original Window Peeper soundtrack');
  });
  it('prices a 15-second Window Peeper request on the catalog scale', async () => {
    await POST({
      request: request({
        ...payload,
        campaign: 'peeper',
        settings: { ...payload.settings, duration: 15 },
      }),
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ duration: 15 }),
      })
    );
  });
});

describe('Trio creation', () => {
  it('pins the 12-second trio reference and soundtrack', async () => {
    const center = 'https://media.example.com/photo.png';
    await POST({
      request: request({
        campaign: 'bulin',
        take: 0,
        effect: 'trio',
        slots: { center },
        images: [center],
        settings: {
          modelName: 'seedance-2-mini',
          resolution: '720p',
          aspectRatio: '9:16',
          duration: 12,
        },
      }),
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          useSampleSoundtrack: true,
          soundtrackVersion: 'trio12',
        }),
        prompt: expect.stringContaining('@Image1 is the CENTER dancer'),
        options: expect.objectContaining({
          referenceVideoVersion: 'trio12',
          reference_image_urls: [center],
          reference_video_urls: [
            expect.stringContaining('bulin-trio-12s-v1.mp4'),
          ],
        }),
      })
    );
  });
});
