import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BULIN_FIXED_MEDIA_VERSION,
  BULIN_REFERENCE_VIDEOS,
  BULIN_SOUNDTRACKS,
} from './bulin-reference';
import { buildTrioPrompt, parseCreateVideoInput } from './create-video';
import {
  WINDOW_PEEPER_CASE,
  WINDOW_PEEPER_DEMOS,
  WINDOW_PEEPER_REFERENCE,
  WINDOW_PEEPER_RESULT,
  WINDOW_PEEPER_SOUNDTRACK,
} from './window-peeper-reference';

const valid = {
  campaign: 'bridges' as const,
  take: 0,
  images: ['https://media.example.com/photo.png'],
  settings: {
    modelName: 'seedance-2-mini',
    resolution: '720p',
    duration: 12,
    aspectRatio: '9:16',
  },
};

describe('Create input and server pricing', () => {
  it('rejects client attempts to choose or forge media sources', () => {
    for (const change of [
      { referenceVideoVersion: 'invalid' },
      { soundtrackVersion: 'invalid' },
      { soundtrackUrl: 'https://other.example.com/song.m4a' },
    ]) {
      expect(() =>
        parseCreateVideoInput({ ...valid, campaign: 'bulin', ...change })
      ).toThrow();
    }
  });
  it('pins Bulin jobs to the 7–22 second video and its matching audio', () => {
    const result = parseCreateVideoInput({ ...valid, campaign: 'bulin' });
    expect(result.referenceVideoVersion).toBe(BULIN_FIXED_MEDIA_VERSION);
    expect(result.soundtrackVersion).toBe(BULIN_FIXED_MEDIA_VERSION);
    expect(result.settings.referenceVideoDurationSeconds).toBe(15);
    expect(BULIN_REFERENCE_VIDEOS[result.referenceVideoVersion].url).toContain(
      'from-7s-15s'
    );
    expect(BULIN_SOUNDTRACKS[result.soundtrackVersion].url).toContain(
      'from-7s-15s'
    );
  });
  it('resolves a preset prompt and calculates the default price on the server', () => {
    const input = parseCreateVideoInput(valid);
    expect(input.prompt).toContain('dinner party');
    expect(input.settings.creditCost).toBe(10);
  });
  it('keeps the public output price when the Bulin source video is attached', () => {
    const input = parseCreateVideoInput({
      ...valid,
      campaign: 'bulin',
      settings: { ...valid.settings, resolution: '480p' },
    });
    expect(input.settings.referenceVideoDurationSeconds).toBe(15);
    expect(input.settings.duration).toBe(12);
    expect(input.settings.creditCost).toBe(5);
  });
  it('bills Seedance 2.5 reference jobs for 15 seconds when the client sends 12', () => {
    for (const [resolution, cost] of [
      ['480p', 22],
      ['720p', 47],
      ['1080p', 117],
    ] as const) {
      const input = parseCreateVideoInput({
        ...valid,
        campaign: 'bulin',
        settings: {
          ...valid.settings,
          modelName: 'seedance-2-5',
          resolution,
          duration: 12,
          aspectRatio: '9:16',
        },
      });
      expect(input.settings.duration).toBe(15);
      expect(input.settings.aspectRatio).toBe('auto');
      expect(input.settings.creditCost).toBe(cost);
    }
  });
  it('does not reprice other reference-video models to the 15-second clip', () => {
    const input = parseCreateVideoInput({
      ...valid,
      campaign: 'bulin',
      settings: {
        ...valid.settings,
        modelName: 'seedance-2',
        resolution: '1080p',
        duration: 12,
      },
    });
    expect(input.settings.duration).toBe(12);
    expect(input.settings.aspectRatio).toBe('9:16');
    expect(input.settings.creditCost).toBe(50);
  });
  it('forces Seedance 2.5 create jobs to match the reference ratio', () => {
    for (const campaign of ['bulin', 'bridges', 'peeper'] as const) {
      for (const aspectRatio of ['9:16', '16:9', 'auto']) {
        const input = parseCreateVideoInput({
          ...valid,
          campaign,
          settings: {
            ...valid.settings,
            modelName: 'seedance-2-5',
            duration: campaign === 'bridges' ? 15 : 12,
            aspectRatio,
          },
        });
        expect(input.settings.aspectRatio).toBe('auto');
      }
    }
  });
  it('keeps the ratio other create models submit', () => {
    const bulin = parseCreateVideoInput({
      ...valid,
      campaign: 'bulin',
      settings: { ...valid.settings, aspectRatio: '16:9' },
    });
    expect(bulin.settings.aspectRatio).toBe('16:9');
    const bridges = parseCreateVideoInput({
      ...valid,
      settings: { ...valid.settings, duration: 15, aspectRatio: '16:9' },
    });
    expect(bridges.settings.aspectRatio).toBe('16:9');
  });
  it('does not accept a price supplied by a client', () => {
    expect(() =>
      parseCreateVideoInput({
        ...valid,
        settings: { ...valid.settings, creditCost: 0 },
      })
    ).toThrow();
  });
  it('rejects unsupported quality and length rather than silently changing a render', () => {
    for (const settings of [
      { ...valid.settings, resolution: '1080p' },
      { ...valid.settings, duration: 30 },
      { ...valid.settings, modelName: 'unpriced-model' },
      { ...valid.settings, aspectRatio: '2:1' },
    ]) {
      expect(() => parseCreateVideoInput({ ...valid, settings })).toThrow();
    }
  });
  it('requires a known preset and one or two public uploaded images', () => {
    for (const change of [
      { campaign: 'unknown' },
      { take: 3 },
      { images: [] },
      { images: ['/local.png'] },
      { images: ['http://localhost/photo.png'] },
      { images: Array(3).fill(valid.images[0]) },
    ]) {
      expect(() => parseCreateVideoInput({ ...valid, ...change })).toThrow();
    }
  });
});

describe('Trio effect input', () => {
  const trioSettings = {
    modelName: 'seedance-2-mini',
    resolution: '720p',
    duration: 12,
    aspectRatio: '9:16',
  };
  const center = 'https://media.example.com/center.png';
  const left = 'https://media.example.com/left.png';
  const right = 'https://media.example.com/right.png';

  it('builds a center-only trio job at the 12-second default price', () => {
    const result = parseCreateVideoInput({
      campaign: 'bulin',
      take: 0,
      effect: 'trio',
      slots: { center },
      images: [center],
      settings: trioSettings,
    });
    expect(result.effect).toBe('trio');
    expect(result.referenceVideoVersion).toBe('trio12');
    expect(result.soundtrackVersion).toBe('trio12');
    expect(result.settings.duration).toBe(12);
    expect(result.settings.aspectRatio).toBe('auto');
    expect(result.settings.creditCost).toBe(10);
    expect(result.prompt).toContain('@Image1 is the CENTER dancer');
    expect(result.prompt).toContain('No photo is provided for the LEFT dancer');
    expect(result.prompt).toContain(
      'No photo is provided for the RIGHT dancer'
    );
    expect(result.prompt).toContain('not face swap');
  });

  it('maps three photos to left/center/right in order for 15 seconds', () => {
    const result = parseCreateVideoInput({
      campaign: 'bulin',
      take: 0,
      effect: 'trio',
      slots: { left, center, right },
      images: [left, center, right],
      settings: { ...trioSettings, duration: 15 },
    });
    expect(result.referenceVideoVersion).toBe('trio15');
    expect(result.settings.creditCost).toBe(13);
    expect(result.prompt).toContain('@Image1 is the LEFT dancer');
    expect(result.prompt).toContain('@Image2 is the CENTER dancer');
    expect(result.prompt).toContain('@Image3 is the RIGHT dancer');
    expect(result.prompt).not.toContain('No photo is provided');
  });

  it('renumbers a center+right pair and only invents the left dancer', () => {
    const prompt = buildTrioPrompt({ center, right });
    expect(prompt).toContain('@Image1 is the CENTER dancer');
    expect(prompt).toContain('@Image2 is the RIGHT dancer');
    expect(prompt).toContain('No photo is provided for the LEFT dancer');
    expect(prompt).not.toContain('No photo is provided for the RIGHT dancer');
  });

  it('bills Seedance 2.5 trio jobs for the selected 12-second cut', () => {
    const result = parseCreateVideoInput({
      campaign: 'bulin',
      take: 0,
      effect: 'trio',
      slots: { center },
      images: [center],
      settings: {
        ...trioSettings,
        modelName: 'seedance-2-5',
        duration: 12,
      },
    });
    expect(result.settings.duration).toBe(12);
    expect(result.settings.creditCost).toBe(37);
  });

  it('rejects invalid trio combinations', () => {
    const base = {
      campaign: 'bulin' as const,
      take: 0,
      effect: 'trio' as const,
      settings: trioSettings,
    };
    for (const change of [
      { slots: undefined, images: [center] },
      { slots: { center }, images: [right, center] },
      { slots: { center }, images: [center], campaign: 'bridges' as const },
      {
        slots: { center },
        images: [center],
        settings: { ...trioSettings, modelName: 'wan-3-video' },
      },
    ]) {
      expect(() => parseCreateVideoInput({ ...base, ...change })).toThrow();
    }
  });

  it('accepts Window Peeper once the night-window motion clip is set', () => {
    expect(WINDOW_PEEPER_REFERENCE.url).toBe(
      'https://media.uptownfunkai.video/reference/window-peeper-master.mp4'
    );
    expect(WINDOW_PEEPER_REFERENCE.durationSeconds).toBe(14);
    expect(WINDOW_PEEPER_RESULT).toEqual({
      src: '/videos/showcase/window-peeper/result-v1.mp4',
      poster: '/videos/showcase/window-peeper/result-v1.jpg',
    });
    expect(WINDOW_PEEPER_DEMOS.map((demo) => demo.id)).toEqual([
      'example',
      'artemis',
      'rodent',
      'viral',
    ]);
    expect(WINDOW_PEEPER_DEMOS[0]).toMatchObject(WINDOW_PEEPER_RESULT);
    expect(WINDOW_PEEPER_DEMOS.slice(1).map((demo) => demo.src)).toEqual([
      '/videos/showcase/window-peeper/7699137962344189206.mp4',
      '/videos/showcase/window-peeper/7698685812455591190.mp4',
      '/videos/showcase/window-peeper/7699214262907997462.mp4',
    ]);
    expect(WINDOW_PEEPER_CASE).toMatchObject({
      id: 'wolf',
      input: '/videos/showcase/window-peeper/wolf-case-input.png',
      src: WINDOW_PEEPER_RESULT.src,
      poster: WINDOW_PEEPER_RESULT.poster,
    });
    expect(WINDOW_PEEPER_DEMOS.every((demo) => !('cite' in demo))).toBe(true);
    expect(WINDOW_PEEPER_CASE.input).not.toBe(WINDOW_PEEPER_CASE.src);
    for (const file of [
      WINDOW_PEEPER_CASE.input,
      WINDOW_PEEPER_CASE.src,
      WINDOW_PEEPER_CASE.poster,
      ...WINDOW_PEEPER_DEMOS.flatMap((demo) =>
        'poster' in demo ? [demo.src, demo.poster] : [demo.src]
      ),
    ]) {
      expect(existsSync(`public${file}`)).toBe(true);
    }
    expect(
      WINDOW_PEEPER_DEMOS.every((demo) =>
        demo.src.startsWith('/videos/showcase/window-peeper/')
      )
    ).toBe(true);
    expect(WINDOW_PEEPER_SOUNDTRACK.url).toBe(
      '/audio/window-peeper-reference.m4a'
    );
    const mini = parseCreateVideoInput({
      ...valid,
      campaign: 'peeper',
      settings: { ...valid.settings, aspectRatio: '9:16', duration: 12 },
    });
    expect(mini.referenceVideoVersion).toBe('windowPeeper');
    expect(mini.soundtrackVersion).toBe('windowPeeper');
    expect(mini.settings.referenceVideoDurationSeconds).toBe(14);
    expect(mini.settings.duration).toBe(12);
    expect(mini.settings.aspectRatio).toBe('9:16');
    expect(mini.settings.creditCost).toBe(10);
    expect(mini.prompt).toContain(
      '@Image1 is the sole authority for who the person is'
    );
    expect(mini.prompt).toContain(
      '@Video1 is the sole authority for camera, scene, and timing'
    );
    for (const beat of [
      '0.0–2.0s',
      'dark apartment block with one lit window',
      '2.0–3.0s',
      'curtain hangs on one side',
      '3.0–5.0s',
      'big bite of a burger',
      '5.0–11.0s',
      'mid-chew',
      'nobody blinks',
      '11.0–12.0s',
      'put the food down',
      '12.0–14.0s',
      'window goes dark',
      'Do not invent unrelated actions',
      'original Window Peeper soundtrack is added',
      '12-second output',
      '15-second output',
    ]) {
      expect(mini.prompt).toContain(beat);
    }
    expect(mini.prompt).not.toContain('Generate no audio');
    const fifteen = parseCreateVideoInput({
      ...valid,
      campaign: 'peeper',
      settings: { ...valid.settings, aspectRatio: '9:16', duration: 15 },
    });
    expect(fifteen.settings.duration).toBe(15);
    expect(fifteen.settings.creditCost).toBe(13);
    const ultra = parseCreateVideoInput({
      ...valid,
      campaign: 'peeper',
      settings: {
        ...valid.settings,
        modelName: 'seedance-2-5',
        aspectRatio: '9:16',
        duration: 12,
      },
    });
    expect(ultra.settings.duration).toBe(14);
    expect(ultra.settings.aspectRatio).toBe('auto');
    expect(ultra.settings.creditCost).toBe(47);
  });
});
