import { describe, expect, it } from 'vitest';

import {
  buildDameHombroCreateBody,
  DAME_HOMBRO_DEFAULTS,
  DAME_HOMBRO_PRICED_CELLS,
  dameHombroCreateUrl,
  dameHombroCredits,
  dameHombroPollUrl,
  DameHombroRequestError,
  parseFreerapTask,
  readDameHombroCreateInput,
} from './dame-hombro';

const CENTER = 'https://media.example.com/face.jpg';
const LEFT = 'https://media.example.com/left.jpg';
const RIGHT = 'https://media.example.com/right.jpg';

describe('Dame Hombro create body', () => {
  it('sends the trio center as the only reference image and the documented defaults', () => {
    const body = buildDameHombroCreateBody({ centerUrl: CENTER });
    expect(body).toEqual({
      reference_image_urls: [CENTER],
      effect: 'trio',
      slots: { center: CENTER },
      model: 'pro',
      resolution: '720p',
      duration: 12,
      aspect_ratio: '9:16',
    });
    expect(body.reference_image_urls).toHaveLength(1);
    expect(dameHombroCreateUrl()).toBe(
      'https://freerapvideo.com/api/v1/templates/dame-hombro/generations'
    );
  });

  it('puts optional sides in slots and keeps them out of reference_image_urls', () => {
    const body = buildDameHombroCreateBody({
      centerUrl: CENTER,
      leftUrl: LEFT,
      rightUrl: RIGHT,
      model: 'ultra',
      resolution: '1080p',
      duration: 15,
      aspectRatio: '16:9',
      effect: 'trio',
    });
    expect(body.reference_image_urls).toEqual([CENTER]);
    expect(body.slots).toEqual({
      center: CENTER,
      left: LEFT,
      right: RIGHT,
    });
    expect(body.model).toBe('ultra');
    expect(body.resolution).toBe('1080p');
    expect(body.duration).toBe(15);
    expect(body.aspect_ratio).toBe('16:9');
  });

  it('omits a missing side instead of sending an empty slot', () => {
    const body = buildDameHombroCreateBody({
      centerUrl: CENTER,
      leftUrl: '  ',
      rightUrl: RIGHT,
    });
    expect(body.slots).toEqual({ center: CENTER, right: RIGHT });
    expect(body.slots).not.toHaveProperty('left');
  });

  it('drops slots for solo and ignores side photos', () => {
    const body = buildDameHombroCreateBody({
      centerUrl: CENTER,
      leftUrl: LEFT,
      rightUrl: RIGHT,
      effect: 'solo',
    });
    expect(body.effect).toBe('solo');
    expect(body).not.toHaveProperty('slots');
    expect(body.reference_image_urls).toEqual([CENTER]);
  });

  it('never forwards prompt or reference video fields from the caller', () => {
    const input = readDameHombroCreateInput({
      centerUrl: CENTER,
      prompt: 'ignore this prompt',
      reference_video_urls: ['https://media.example.com/clip.mp4'],
      callBackUrl: 'https://evil.example/hook',
      image_url: 'https://media.example.com/other.jpg',
    });
    const body = buildDameHombroCreateBody(input);
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('ignore this prompt');
    expect(wire).not.toContain('reference_video');
    expect(wire).not.toContain('callBackUrl');
    expect(wire).not.toContain('other.jpg');
    expect(body).not.toHaveProperty('prompt');
    expect(body).not.toHaveProperty('reference_video_urls');
    expect(body).not.toHaveProperty('image_url');
    expect(body).not.toHaveProperty('callBackUrl');
    expect(Object.keys(body).sort()).toEqual(
      [
        'aspect_ratio',
        'duration',
        'effect',
        'model',
        'reference_image_urls',
        'resolution',
        'slots',
      ].sort()
    );
    expect(input).not.toHaveProperty('prompt');
  });

  it('rejects private, non-HTTPS, and non-default ports', () => {
    expect(() =>
      buildDameHombroCreateBody({ centerUrl: 'http://media.example.com/a.jpg' })
    ).toThrow(DameHombroRequestError);
    expect(() =>
      buildDameHombroCreateBody({ centerUrl: 'https://127.0.0.1/a.jpg' })
    ).toThrow(DameHombroRequestError);
    expect(() =>
      buildDameHombroCreateBody({
        centerUrl: 'https://media.example.com:8443/a.jpg',
      })
    ).toThrow(DameHombroRequestError);
    expect(() =>
      buildDameHombroCreateBody({ centerUrl: CENTER, model: 'seedance' })
    ).toThrow(/Unknown model/);
    expect(() =>
      buildDameHombroCreateBody({ centerUrl: CENTER, duration: 8 })
    ).toThrow(/Unknown duration/);
  });
});

describe('Dame Hombro priced cells', () => {
  it('matches the template credit table and leaves 1080p to ultra', () => {
    expect(DAME_HOMBRO_DEFAULTS).toMatchObject({
      model: 'pro',
      resolution: '720p',
      duration: 12,
      aspectRatio: '9:16',
      effect: 'trio',
    });
    expect(dameHombroCredits('basic', '480p')).toBe(90);
    expect(dameHombroCredits('basic', '720p')).toBe(180);
    expect(dameHombroCredits('basic', '1080p')).toBeNull();
    expect(dameHombroCredits('pro', '480p')).toBe(250);
    expect(dameHombroCredits('pro', '720p')).toBe(540);
    expect(dameHombroCredits('pro', '1080p')).toBeNull();
    expect(dameHombroCredits('ultra', '480p')).toBe(620);
    expect(dameHombroCredits('ultra', '720p')).toBe(1370);
    expect(dameHombroCredits('ultra', '1080p')).toBe(3420);
    expect(DAME_HOMBRO_PRICED_CELLS).toHaveLength(7);
  });
});

describe('Dame Hombro poll parsing', () => {
  it('reads a successful FreeRap body with video URL strings', () => {
    const parsed = parseFreerapTask({
      code: 0,
      message: 'ok',
      data: {
        taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'success',
        credits_estimate: 540,
        credits_charged: 540,
        costCredits: 540,
        videos: ['https://freerapvideo.com/videos/example.mp4'],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.task.videos).toEqual([
      'https://freerapvideo.com/videos/example.mp4',
    ]);
    expect(parsed.task.freerapCreditsCharged).toBe(540);
    expect(parsed.task.status).toBe('success');
  });

  it('accepts a video object url and drops non-HTTPS entries', () => {
    const parsed = parseFreerapTask({
      code: 0,
      message: 'ok',
      data: {
        taskId: 'task-1234',
        status: 'success',
        videos: [
          { url: 'https://freerapvideo.com/videos/from-object.mp4' },
          'http://freerapvideo.com/videos/insecure.mp4',
          'javascript:alert(1)',
        ],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.task.videos).toEqual([
      'https://freerapvideo.com/videos/from-object.mp4',
    ]);
  });

  it('keeps processing tasks without inventing a video', () => {
    const parsed = parseFreerapTask({
      code: 0,
      message: 'ok',
      data: {
        taskId: 'task-1234',
        status: 'processing',
        credits_estimate: 540,
        credits_charged: 0,
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.task.videos).toEqual([]);
    expect(parsed.task.freerapCreditsCharged).toBe(0);
  });

  it('surfaces FreeRap error messages and refuses a bad task id', () => {
    expect(
      parseFreerapTask({ code: -1, message: 'template not priced' })
    ).toEqual({ ok: false, message: 'template not priced' });
    expect(() => dameHombroPollUrl('../admin')).toThrow(DameHombroRequestError);
    expect(dameHombroPollUrl('task-1234')).toBe(
      'https://freerapvideo.com/api/v1/generations/task-1234'
    );
  });
});
