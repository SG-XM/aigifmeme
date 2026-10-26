import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshCreateVideo, runVideoGeneration } from './tools';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  mark: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  generate: vi.fn(),
  storage: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/modules/ai-tasks/service', () => ({
  AITaskStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELED: 'canceled',
  },
  createTask: mocks.create,
  markTaskProcessing: mocks.mark,
  updateTask: mocks.update,
  findTask: vi.fn(),
  getActiveTasksForSession: vi.fn(),
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => ({ kie_api_key: 'test-provider' }),
}));
vi.mock('@/modules/storage/service', () => ({ getStorage: mocks.storage }));
vi.mock('@/core/ai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  KieProvider: class {
    generate = mocks.generate;
    query = mocks.query;
  },
}));
const task = {
  id: 'task-1',
  status: 'processing',
  provider: 'kie',
  taskId: 'upstream-1',
  model: 'bytedance/seedance-2-mini',
  createdAt: new Date(),
  taskResult: null,
} as Parameters<typeof refreshCreateVideo>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.mockResolvedValue({
    uploadFile: mocks.upload,
    getProviderNames: () => ['r2'],
  });
  mocks.create.mockResolvedValue({ id: 'task-1' });
  mocks.mark.mockResolvedValue(true);
  mocks.generate.mockResolvedValue({
    taskId: 'upstream-1',
    taskStatus: 'processing',
  });
  mocks.update.mockImplementation(async (params) => ({
    ...task,
    status: params.status,
    taskResult: JSON.stringify(params.taskResult),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('standalone Create lifecycle', () => {
  it('persists the soundtrack choice before returning a queued job', async () => {
    await runVideoGeneration({
      ctx: {
        userId: 'user-1',
        sessionId: 'create-1',
        useSampleSoundtrack: true,
        soundtrackVersion: 'from4s15s',
        settings: { audioMode: 'silent', referenceVideoDurationSeconds: 15 },
      },
      prompt: 'Replace the performer',
      modelKey: 'seedance-2-mini',
      kind: 'generate',
      options: {
        source: 'create',
        referenceVideoVersion: 'from4s15s',
        reference_video_urls: ['https://media.example.com/source.mp4'],
        duration: 12,
        resolution: '720p',
        aspect_ratio: '9:16',
      },
      deferPolling: true,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          soundtrackVersion: 'from4s15s',
          referenceVideoVersion: 'from4s15s',
          useSampleSoundtrack: true,
        }),
      })
    );
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          options: expect.objectContaining({ generate_audio: false }),
        }),
      })
    );
  });
  it.each([
    ['from4s15s', '/audio/bulin-reference-from-4s-15s-v1.m4a'],
    [undefined, '/audio/bulin-reference-audio.m4a'],
  ])(
    'loads the persisted %s soundtrack after refresh, preserving legacy jobs',
    async (soundtrackVersion, path) => {
      const fetchAsset = vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array()));
      vi.stubGlobal('__CF_ENV__', { ASSETS: { fetch: fetchAsset } });
      mocks.query.mockResolvedValue({
        taskStatus: 'success',
        taskInfo: {
          videos: [{ videoUrl: 'https://media.example.com/output.mp4' }],
        },
      });
      await refreshCreateVideo({
        ...task,
        options: JSON.stringify({
          useSampleSoundtrack: true,
          soundtrackVersion,
        }),
      });
      expect(fetchAsset).toHaveBeenCalledTimes(1);
      expect(new URL(fetchAsset.mock.calls[0][0].url).pathname).toBe(path);
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    }
  );
  it('loads the Window Peeper bed before muxing a finished clip', async () => {
    const fetchAsset = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array()));
    vi.stubGlobal('__CF_ENV__', { ASSETS: { fetch: fetchAsset } });
    mocks.query.mockResolvedValue({
      taskStatus: 'success',
      taskInfo: {
        videos: [{ videoUrl: 'https://media.example.com/output.mp4' }],
      },
    });
    await refreshCreateVideo({
      ...task,
      options: JSON.stringify({
        audioMode: 'silent',
        useSampleSoundtrack: true,
        soundtrackVersion: 'windowPeeper',
      }),
    });
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(new URL(fetchAsset.mock.calls[0][0].url).pathname).toBe(
      '/audio/window-peeper-reference.m4a'
    );
  });
  it('charges Seedance 2.5 reference jobs for 15 seconds and stores that duration', async () => {
    for (const [resolution, cost] of [
      ['480p', 22],
      ['720p', 47],
      ['1080p', 117],
    ] as const) {
      mocks.create.mockClear();
      await runVideoGeneration({
        ctx: {
          userId: 'user-1',
          sessionId: 'create-1',
          settings: { duration: 12, referenceVideoDurationSeconds: 4 },
        },
        prompt: 'Replace the performer',
        modelKey: 'seedance-2-5',
        kind: 'generate',
        options: {
          reference_video_urls: ['https://media.example.com/source.mp4'],
          duration: 12,
          resolution,
          aspect_ratio: '9:16',
        },
        deferPolling: true,
      });
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          costCredits: cost,
          options: expect.objectContaining({ duration: 15 }),
        })
      );
    }
  });
  it('keeps Seedance 2.5 on the requested duration without a reference video', async () => {
    await runVideoGeneration({
      ctx: {
        userId: 'user-1',
        sessionId: 'create-1',
        settings: { duration: 12 },
      },
      prompt: 'A night street',
      modelKey: 'seedance-2-5',
      kind: 'generate',
      options: {
        duration: 12,
        resolution: '720p',
        aspect_ratio: '16:9',
      },
      deferPolling: true,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCredits: 37,
        options: expect.objectContaining({ duration: 12 }),
      })
    );
  });
  it('does not reprice other reference-video models to 15 seconds', async () => {
    await runVideoGeneration({
      ctx: {
        userId: 'user-1',
        sessionId: 'create-1',
        settings: { duration: 12, referenceVideoDurationSeconds: 15 },
      },
      prompt: 'Replace the performer',
      modelKey: 'seedance-2',
      kind: 'generate',
      options: {
        reference_video_urls: ['https://media.example.com/source.mp4'],
        duration: 12,
        resolution: '720p',
        aspect_ratio: '9:16',
      },
      deferPolling: true,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCredits: 20,
        options: expect.objectContaining({ duration: 12 }),
      })
    );
  });
  it('submits directly, charges the catalog price once and returns before polling', async () => {
    const result = JSON.parse(
      await runVideoGeneration({
        ctx: { userId: 'user-1', sessionId: 'create-1' },
        prompt: 'Animate my photo',
        modelKey: 'seedance-2-mini',
        kind: 'animate',
        options: {
          source: 'create',
          image_input: ['https://media.example.com/photo.png'],
          duration: 12,
          resolution: '720p',
          aspect_ratio: '9:16',
        },
        deferPolling: true,
      })
    );
    expect(result).toEqual({ status: 'processing', taskId: 'task-1' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCredits: 10,
        options: expect.objectContaining({ source: 'create' }),
      })
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('prices a Seedance 2.5 reference video from the requested duration', async () => {
    await runVideoGeneration({
      ctx: {
        userId: 'user-1',
        sessionId: 'create-1',
        settings: { referenceVideoDurationSeconds: 8 },
      },
      prompt: 'Replace the performer',
      modelKey: 'seedance-2-5',
      kind: 'generate',
      options: {
        reference_video_urls: ['https://media.example.com/source.mp4'],
        duration: 15,
        resolution: '720p',
        aspect_ratio: '9:16',
      },
      deferPolling: true,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'kie',
        model: 'bytedance/seedance-2-5',
        costCredits: 47,
        options: expect.objectContaining({
          aspect_ratio: '9:16',
          duration: 15,
        }),
      })
    );
  });
  it('polling pending provider work never consumes new credits', async () => {
    mocks.query.mockResolvedValue({ taskStatus: 'processing' });
    expect(await refreshCreateVideo(task)).toEqual(task);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('a transient provider error leaves the job running', async () => {
    mocks.query.mockRejectedValue(new Error('network timeout'));
    await expect(refreshCreateVideo(task)).rejects.toThrow('network timeout');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('terminal provider failure invokes the existing refund transition', async () => {
    mocks.query.mockResolvedValue({
      taskStatus: 'failed',
      taskInfo: { errorMessage: 'Unable to render' },
    });
    await refreshCreateVideo(task);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, status: 'failed' })
    );
  });
  it('completed tasks are not polled or charged again', async () => {
    await refreshCreateVideo({ ...task, status: 'success' });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('persists successful video files in durable storage before marking success', async () => {
    mocks.query.mockResolvedValue({
      taskStatus: 'success',
      taskInfo: {
        videos: [{ videoUrl: 'https://provider.example.com/result.mp4' }],
      },
    });
    mocks.upload.mockResolvedValue({
      success: true,
      url: 'https://media.example.com/saved.mp4',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])))
    );
    const completed = await refreshCreateVideo(task);
    expect(completed.status).toBe('success');
    expect(JSON.parse(completed.taskResult)).toMatchObject({
      files: ['https://media.example.com/saved.mp4'],
      model: task.model,
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agent/sessions/create/task-1/vid_task-1_0.mp4',
      })
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('returns credits for abandoned pending or expired processing tasks', async () => {
    mocks.query.mockResolvedValue({ taskStatus: 'processing' });
    for (const status of ['pending', 'processing']) {
      const expired = {
        ...task,
        status,
        createdAt: new Date(Date.now() - 16 * 60_000),
      };
      await refreshCreateVideo(expired);
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ taskId: task.id, status: 'failed' })
      );
    }
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('recovers an already-completed render after the user has been away longer than the polling timeout', async () => {
    mocks.query.mockResolvedValue({
      taskStatus: 'success',
      taskInfo: {
        videos: [{ videoUrl: 'https://provider.example.com/result.mp4' }],
      },
    });
    mocks.upload.mockResolvedValue({
      success: true,
      url: 'https://media.example.com/saved.mp4',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])))
    );
    const completed = await refreshCreateVideo({
      ...task,
      createdAt: new Date(Date.now() - 60 * 60_000),
    });
    expect(completed.status).toBe('success');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' })
    );
  });
});
