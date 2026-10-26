import { afterEach, describe, expect, it, vi } from 'vitest';

import { KieProvider } from './kie';
import { AIMediaType } from './types';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 200, data: { taskId: 'task-1' } }), {
      status: 200,
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  return { provider: new KieProvider({ apiKey: 'test' }), fetchMock };
}
describe('Kie Seedance request contracts', () => {
  it.each(['seedance-2-mini', 'seedance-2-fast', 'seedance-2', 'seedance-2-5'])(
    'sends the exact %s model and selected settings',
    async (model) => {
      const { provider, fetchMock } = setup();
      await provider.generate({
        params: {
          mediaType: AIMediaType.VIDEO,
          model: `bytedance/${model}`,
          prompt: 'A landscape',
          options: { aspect_ratio: 'auto', duration: 12, resolution: '720p' },
        },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe(`bytedance/${model}`);
      expect(body.input).toMatchObject({
        aspect_ratio: 'adaptive',
        duration: 12,
        resolution: '720p',
        generate_audio: true,
      });
    }
  );
  it('uses distinct first/last frame fields for animation', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'bytedance/seedance-2',
        prompt: 'A landscape',
        options: {
          image_input: [
            'https://example.com/first.png',
            'https://example.com/last.png',
          ],
        },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toMatchObject({
      first_frame_url: 'https://example.com/first.png',
      last_frame_url: 'https://example.com/last.png',
    });
    expect(body.input.reference_image_urls).toBeUndefined();
    expect(body.input.image_urls).toBeUndefined();
    expect(body.input.image_input).toBeUndefined();
  });
  it('follows the reference clip for Seedance 2.5', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'bytedance/seedance-2-5',
        prompt: 'A landscape',
        options: {
          aspect_ratio: '9:16',
          duration: 12,
          resolution: '720p',
          reference_video_urls: ['https://example.com/video.mp4'],
        },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toMatchObject({
      aspect_ratio: 'adaptive',
      duration: -1,
      resolution: '720p',
      reference_video_urls: ['https://example.com/video.mp4'],
    });
  });
  it('keeps the requested ratio and duration without a reference video', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'bytedance/seedance-2-5',
        prompt: 'A landscape',
        options: { aspect_ratio: '9:16', duration: 12, resolution: '720p' },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toMatchObject({
      aspect_ratio: '9:16',
      duration: 12,
      resolution: '720p',
    });
    expect(body.input.reference_video_urls).toBeUndefined();
  });
  it('ignores blank reference video urls', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateVideo({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: 'bytedance/seedance-2-5',
        prompt: 'A landscape',
        options: {
          aspect_ratio: '9:16',
          duration: 12,
          reference_video_urls: ['  '],
        },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toMatchObject({ aspect_ratio: '9:16', duration: 12 });
    expect(body.input.reference_video_urls).toBeUndefined();
  });
  it.each(['seedance-2-mini', 'seedance-2-fast', 'seedance-2'])(
    'keeps a fixed ratio and duration for %s reference videos',
    async (model) => {
      const { provider, fetchMock } = setup();
      await provider.generateVideo({
        params: {
          mediaType: AIMediaType.VIDEO,
          model: `bytedance/${model}`,
          prompt: 'A landscape',
          options: {
            aspect_ratio: '9:16',
            duration: 12,
            reference_video_urls: ['https://example.com/video.mp4'],
          },
        },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input).toMatchObject({
        aspect_ratio: '9:16',
        duration: 12,
        reference_video_urls: ['https://example.com/video.mp4'],
      });
    }
  );
});

describe('Kie image edit requests', () => {
  it('sends nano-banana-edit photos as image_urls', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateImage({
      params: {
        mediaType: AIMediaType.IMAGE,
        model: 'google/nano-banana-edit',
        prompt: 'Keep the same person',
        options: {
          image_input: ['https://cdn.example.com/photo.jpg'],
          aspect_ratio: '3:4',
          output_format: 'jpeg',
        },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('google/nano-banana-edit');
    expect(body.input).toEqual({
      prompt: 'Keep the same person',
      image_urls: ['https://cdn.example.com/photo.jpg'],
      aspect_ratio: '3:4',
      output_format: 'jpeg',
    });
  });

  it('keeps image_input for image models that are not edit jobs', async () => {
    const { provider, fetchMock } = setup();
    await provider.generateImage({
      params: {
        mediaType: AIMediaType.IMAGE,
        model: 'google/imagen',
        prompt: 'A landscape',
        options: { image_input: ['https://cdn.example.com/photo.jpg'] },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input.image_input).toEqual([
      'https://cdn.example.com/photo.jpg',
    ]);
    expect(body.input.image_urls).toBeUndefined();
  });
});
