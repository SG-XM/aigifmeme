import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './dame-hombro';
import { GET } from './dame-hombro/$taskId';

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

const CENTER = 'https://media.example.com/face.jpg';
const LEFT = 'https://media.example.com/left.jpg';
const RIGHT = 'https://media.example.com/right.jpg';
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createRequest(body: unknown) {
  return new Request('https://app.example.com/api/dame-hombro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function pollRequest(taskId = TASK) {
  return new Request(`https://app.example.com/api/dame-hombro/${taskId}`);
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
          credits_estimate: 540,
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

describe('Dame Hombro proxy', () => {
  it('requires a signed-in user and does not call FreeRap', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST({
      request: createRequest({ centerUrl: CENTER }),
    });
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rate-limits create before spending the key', async () => {
    mocks.limit.mockReturnValue(
      Response.json(
        { error: 'too_many_requests', message: 'Please retry after 10s.' },
        { status: 429 }
      )
    );
    const response = await POST({
      request: createRequest({ centerUrl: CENTER }),
    });
    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ keyPrefix: 'dame-hombro', extraKey: 'user-1' })
    );
  });

  it('posts the shaped trio body and keeps the key out of the response', async () => {
    const response = await POST({
      request: createRequest({
        centerUrl: CENTER,
        leftUrl: LEFT,
        rightUrl: RIGHT,
        prompt: 'do not send',
        reference_video_urls: ['https://media.example.com/clip.mp4'],
      }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      code: 0,
      message: 'ok',
      data: {
        taskId: TASK,
        status: 'processing',
        videos: [],
        freerapCreditsEstimate: 540,
        freerapCreditsCharged: 0,
      },
    });
    expect(JSON.stringify(json)).not.toContain('test-freerap-key');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://freerapvideo.com/api/v1/templates/dame-hombro/generations'
    );
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer test-freerap-key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      reference_image_urls: [CENTER],
      effect: 'trio',
      slots: { left: LEFT, center: CENTER, right: RIGHT },
      model: 'pro',
      resolution: '720p',
      duration: 12,
      aspect_ratio: '9:16',
    });
    expect(String(init.body)).not.toContain('do not send');
    expect(String(init.body)).not.toContain('reference_video');
  });

  it('refuses a photo that is not on our public storage', async () => {
    const response = await POST({
      request: createRequest({
        centerUrl: 'https://cdn.elsewhere.test/face.jpg',
      }),
    });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call FreeRap when the key is missing', async () => {
    delete process.env.FREERAP_API_KEY;
    const response = await POST({
      request: createRequest({ centerUrl: CENTER }),
    });
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes an unpriced cell through so FreeRap can answer 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { code: -1, message: 'template not priced' },
        { status: 403, headers: { 'retry-after': 'nope' } }
      )
    );
    const response = await POST({
      request: createRequest({
        centerUrl: CENTER,
        model: 'basic',
        resolution: '1080p',
      }),
    });
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.message).toBe('template not priced');
    expect(response.headers.get('retry-after')).toBeNull();
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'basic',
      resolution: '1080p',
    });
  });

  it('polls with the same key and returns the video URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        code: 0,
        message: 'ok',
        data: {
          taskId: TASK,
          status: 'success',
          credits_charged: 540,
          videos: ['https://freerapvideo.com/videos/example.mp4'],
        },
      })
    );
    const response = await GET({
      request: pollRequest(),
      params: { taskId: TASK },
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.videos).toEqual([
      'https://freerapvideo.com/videos/example.mp4',
    ]);
    expect(json.data.status).toBe('success');
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://freerapvideo.com/api/v1/generations/${TASK}`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer test-freerap-key'
    );
    expect(init.body).toBeUndefined();
  });

  it('rejects a task id that could change the request path', async () => {
    const response = await GET({
      request: pollRequest('..%2Fsecret'),
      params: { taskId: '../secret' },
    });
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
