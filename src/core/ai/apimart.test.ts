import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiMartProvider } from './apimart';
import { AIMediaType, AITaskStatus } from './types';

afterEach(() => vi.unstubAllGlobals());

function setup(response: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    provider: new ApiMartProvider({ apiKey: 'sk-test' }),
    fetchMock,
  };
}

describe('APIMart Seedance client', () => {
  it('posts Seedance 2.5 to the official generations endpoint', async () => {
    const { provider, fetchMock } = setup({
      code: 200,
      data: [{ status: 'submitted', task_id: 'task_seedance' }],
    });
    const result = await provider.generate({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'seedance-2.5',
        prompt: 'A landscape',
        options: { aspect_ratio: 'auto', duration: 12, resolution: '720p' },
      },
    });
    expect(result).toMatchObject({
      taskStatus: AITaskStatus.PENDING,
      taskId: 'task_seedance',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.apimart.ai/v1/videos/generations'
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer sk-test'
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'seedance-2.5',
      prompt: 'A landscape',
      size: 'adaptive',
      resolution: '720p',
      duration: 12,
      generate_audio: true,
    });
  });

  it('sends first and last frames and reference media with APIMart field names', async () => {
    const { provider, fetchMock } = setup({
      code: 200,
      data: [{ task_id: 'task_frames' }],
    });
    await provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'seedance-2.0',
        prompt: 'A landscape',
        options: {
          aspect_ratio: '16:9',
          duration: 15,
          resolution: '1080p',
          generate_audio: false,
          image_input: [
            'https://cdn.example.com/first.png',
            'https://cdn.example.com/last.png',
          ],
        },
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'seedance-2.0',
      size: 'adaptive',
      duration: 15,
      generate_audio: false,
      image_with_roles: [
        { url: 'https://cdn.example.com/first.png', role: 'first_frame' },
        { url: 'https://cdn.example.com/last.png', role: 'last_frame' },
      ],
    });

    const reference = setup({
      code: 200,
      data: [{ task_id: 'task_ref' }],
    });
    await reference.provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'seedance-2.5',
        prompt: 'Follow the clip',
        options: {
          aspect_ratio: '9:16',
          duration: 12,
          reference_image_urls: ['https://cdn.example.com/ref.png'],
          reference_video_urls: ['https://cdn.example.com/clip.mp4'],
          reference_audio_urls: ['https://cdn.example.com/audio.mp3'],
        },
      },
    });
    expect(JSON.parse(reference.fetchMock.mock.calls[0][1].body)).toMatchObject(
      {
        size: 'adaptive',
        duration: -1,
        image_urls: ['https://cdn.example.com/ref.png'],
        video_urls: ['https://cdn.example.com/clip.mp4'],
        audio_urls: ['https://cdn.example.com/audio.mp3'],
      }
    );
  });

  it('reads the completed video URL from the task status payload', async () => {
    const { provider, fetchMock } = setup({
      code: 200,
      data: {
        id: 'task_seedance',
        status: 'completed',
        created: 1786132648,
        result: {
          videos: [
            {
              url: ['https://cdn.example.com/out.mp4'],
              expires_at: 1786133000,
            },
          ],
        },
      },
    });
    const result = await provider.query({ taskId: 'task_seedance' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.apimart.ai/v1/tasks/task_seedance'
    );
    expect(result.taskStatus).toBe(AITaskStatus.SUCCESS);
    expect(result.taskInfo?.videos?.[0]?.videoUrl).toBe(
      'https://cdn.example.com/out.mp4'
    );
  });

  it('surfaces a failed task message and an auth error', async () => {
    const failed = setup({
      code: 200,
      data: {
        status: 'failed',
        error: { code: 'task_failed', message: 'moderation failed' },
      },
    });
    const result = await failed.provider.query({ taskId: 'task_failed' });
    expect(result.taskStatus).toBe(AITaskStatus.FAILED);
    expect(result.taskInfo?.errorMessage).toBe('moderation failed');

    const denied = setup(
      { error: { message: 'Authentication failed', code: 401 } },
      401
    );
    await expect(
      denied.provider.generateVideo({
        params: {
          mediaType: AIMediaType.VIDEO,
          model: 'seedance-2.0-mini',
          prompt: 'A landscape',
        },
      })
    ).rejects.toThrow('Authentication failed');
  });
});
