import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './generations';
import { GET } from './generations/$taskId';

const FACE = 'https://media.example.com/uploads/face.jpg';
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  storage: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/storage/service', () => ({
  getStorage: () => mocks.storage(),
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: (...args: unknown[]) => mocks.limit(...args),
}));

function createRequest(body: unknown) {
  return new Request(
    'https://app.example.com/api/wallpaper-peeper/generations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.FREERAP_API_KEY;
  process.env.FREERAP_API_KEY = 'test-freerap-key';
  delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
  mocks.session.mockResolvedValue({ user: { id: 'user-1' } });
  mocks.storage.mockResolvedValue({
    getPublicUrl: () => 'https://media.example.com/uploads/reference',
  });
  mocks.limit.mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        code: 0,
        message: 'ok',
        data: {
          taskId: TASK,
          status: 'processing',
          credits_estimate: 590,
          credits_charged: 0,
        },
      })
    )
  );
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.FREERAP_API_KEY;
  else process.env.FREERAP_API_KEY = previousKey;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('POST /api/wallpaper-peeper/generations', () => {
  it('requires a signed-in user and does not call FreeRap', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST({
      request: createRequest({ referenceImageUrl: FACE }),
    });
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an unpriced cell without calling FreeRap', async () => {
    const response = await POST({
      request: createRequest({
        referenceImageUrl: FACE,
        model: 'pro',
        resolution: '1080p',
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.message).toBe('template not priced');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not forward a prompt or reference video', async () => {
    const response = await POST({
      request: createRequest({
        referenceImageUrl: FACE,
        prompt: 'make it scarier',
        reference_video_urls: ['https://cdn.example.com/clip.mp4'],
      }),
    });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the copy defaults through the shared FreeRap client', async () => {
    const response = await POST({
      request: createRequest({ referenceImageUrl: FACE }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      code: 0,
      message: 'ok',
      data: {
        taskId: TASK,
        status: 'processing',
        videos: [],
        freerapCreditsEstimate: 590,
        freerapCreditsCharged: 0,
      },
    });
    expect(JSON.stringify(body)).not.toContain('test-freerap-key');
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://freerapvideo.com/api/v1/templates/window-peeper/generations'
    );
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer test-freerap-key');
    expect(JSON.parse(String(init.body))).toEqual({
      reference_image_urls: [FACE],
      model: 'pro',
      resolution: '720p',
      duration: 12,
      aspect_ratio: '9:16',
      effect: 'solo',
    });
    expect(String(init.body)).not.toMatch(/sk_|prompt|reference_video/);
  });

  it('does not call FreeRap when the key is missing', async () => {
    delete process.env.FREERAP_API_KEY;
    const response = await POST({
      request: createRequest({ referenceImageUrl: FACE }),
    });
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/wallpaper-peeper/generations/$taskId', () => {
  it('rejects a task id that could change the poll path', async () => {
    const response = await GET({
      request: new Request(
        'https://app.example.com/api/wallpaper-peeper/generations/not-a-task'
      ),
      params: { taskId: 'not a task' },
    });
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('polls with the same key and returns the video URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        code: 0,
        message: 'ok',
        data: {
          taskId: TASK,
          status: 'success',
          credits_charged: 590,
          videos: [
            'https://freerapvideo.com/videos/example.mp4',
            'http://freerapvideo.com/videos/insecure.mp4',
          ],
        },
      })
    );
    const response = await GET({
      request: new Request(
        `https://app.example.com/api/wallpaper-peeper/generations/${TASK}`
      ),
      params: { taskId: TASK },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.videos).toEqual([
      'https://freerapvideo.com/videos/example.mp4',
    ]);
    expect(body.data.freerapCreditsCharged).toBe(590);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://freerapvideo.com/api/v1/generations/${TASK}`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer test-freerap-key'
    );
  });
});
