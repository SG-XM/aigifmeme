import { describe, expect, it } from 'vitest';

import {
  AGENT_MODEL_OPTIONS,
  creditsForGeneration,
  defaultComposerSettings,
  generationDurationSeconds,
  labelForGeneratedModel,
  normalizeClientGenerationSettings,
  providerModelFor,
  SELECTABLE_AGENT_MODEL_OPTIONS,
  settingsForModel,
} from './agent-settings';

describe('the approved 12-second credit table', () => {
  it.each([
    ['seedance-2-mini', '480p', 5],
    ['seedance-2-mini', '720p', 10],
    ['seedance-2-fast', '480p', 8],
    ['seedance-2-fast', '720p', 17],
    ['seedance-2', '480p', 10],
    ['seedance-2', '720p', 20],
    ['seedance-2', '1080p', 50],
    ['seedance-2-5', '480p', 17],
    ['seedance-2-5', '720p', 37],
    ['seedance-2-5', '1080p', 93],
  ])('%s at %s costs %i credits', (model, resolution, expected) => {
    expect(
      creditsForGeneration(model as string, 12, resolution as string)
    ).toBe(expected);
  });
  it('rounds the complete render up once, with no per-second rounding', () => {
    expect(creditsForGeneration('seedance-2-mini', 5, '720p')).toBe(5);
    expect(creditsForGeneration('seedance-2-5', 5, '720p')).toBe(16);
    expect(creditsForGeneration('seedance-2-5', 30, '1080p')).toBe(233);
  });
  it('charges only for output duration when a reference video is used', () => {
    expect(creditsForGeneration('seedance-2-mini', 12, '480p')).toBe(5);
    expect(creditsForGeneration('seedance-2-mini', 15, '480p')).toBe(7);
  });
  it('prices a 15-second Seedance 2.5 reference render from the 12-second table', () => {
    expect(creditsForGeneration('seedance-2-5', 15, '480p')).toBe(22);
    expect(creditsForGeneration('seedance-2-5', 15, '720p')).toBe(47);
    expect(creditsForGeneration('seedance-2-5', 15, '1080p')).toBe(117);
    expect(generationDurationSeconds('seedance-2-5', 12, true)).toBe(15);
  });
  it('uses an explicit reference duration for Seedance 2.5 when given', () => {
    expect(generationDurationSeconds('seedance-2-5', 12, true, 12)).toBe(12);
    expect(generationDurationSeconds('seedance-2-5', 15, true, 15)).toBe(15);
  });
  it('keeps Seedance 2.5 durations selectable when there is no reference video', () => {
    expect(generationDurationSeconds('seedance-2-5', 12, false)).toBe(12);
    expect(generationDurationSeconds('seedance-2-5', 15, false)).toBe(15);
    expect(creditsForGeneration('seedance-2-5', 12, '720p')).toBe(37);
    expect(generationDurationSeconds('seedance-2', 12, true)).toBe(12);
    expect(generationDurationSeconds('wan-3-video', 30, true)).toBe(30);
  });
  it('does not silently undercharge an unsupported resolution', () => {
    expect(() =>
      creditsForGeneration('seedance-2-mini', 12, '1080p')
    ).toThrow();
  });
  it('normalizes unsupported client settings and recomputes forged creditCost', () => {
    expect(
      normalizeClientGenerationSettings({
        modelName: 'seedance-2-5',
        duration: 99,
        resolution: '4K',
        creditCost: 0,
      })
    ).toMatchObject({ duration: 15, resolution: '720p', creditCost: 47 });
    expect(
      normalizeClientGenerationSettings({ modelName: 'minimax-h3' })
    ).toBeNull();
    expect(
      normalizeClientGenerationSettings({ modelName: 'wan-3-video' })
    ).toBeNull();
    expect(
      normalizeClientGenerationSettings({ modelName: 'wan-3-video-prime' })
    ).toBeNull();
  });
  it('defaults to a standard 12-second 720p render', () => {
    expect(defaultComposerSettings()).toMatchObject({
      modelOption: 'seedance-2-mini',
      duration: 12,
      resolution: '720p',
    });
    expect(creditsForGeneration('seedance-2-mini')).toBe(10);
  });
  it('resets incompatible settings on model switch', () => {
    expect(
      settingsForModel(
        {
          modelOption: 'seedance-2-5',
          duration: 30,
          resolution: '1080p',
          aspectRatio: 'auto',
        },
        'seedance-2-mini'
      )
    ).toEqual(defaultComposerSettings());
  });
  it('uses a conservative nonzero price for unrecognized keys', () => {
    expect(creditsForGeneration('invalid', 12)).toBe(93);
    expect(creditsForGeneration(undefined)).toBe(93);
  });
});

describe('model routes and history', () => {
  it('maps all four tiers to their exact Kie model IDs', () => {
    expect(
      SELECTABLE_AGENT_MODEL_OPTIONS.map((option) => option.value)
    ).toEqual([
      'seedance-2-mini',
      'seedance-2-fast',
      'seedance-2',
      'seedance-2-5',
    ]);
    const apimartModels: Record<string, string> = {
      'seedance-2-mini': 'seedance-2.0-mini',
      'seedance-2-fast': 'seedance-2.0-fast',
      'seedance-2': 'seedance-2.0',
      'seedance-2-5': 'seedance-2.5',
    };
    for (const option of SELECTABLE_AGENT_MODEL_OPTIONS) {
      expect(providerModelFor(option.value, 'kie', 'generate')).toBe(
        'bytedance/' + option.value
      );
      expect(providerModelFor(option.value, 'kie', 'animate')).toBe(
        'bytedance/' + option.value
      );
      expect(providerModelFor(option.value, 'apimart', 'generate')).toBe(
        apimartModels[option.value]
      );
      expect(labelForGeneratedModel('bytedance/' + option.value)).toBe(
        option.label
      );
    }
  });
  it('does not substitute another model on unsupported providers', () => {
    expect(
      providerModelFor('seedance-2-mini', 'fal', 'generate')
    ).toBeUndefined();
    expect(
      providerModelFor('seedance-2-5', 'replicate', 'generate')
    ).toBeUndefined();
  });
  it('keeps Wan priced for old jobs and out of new selections', () => {
    expect(AGENT_MODEL_OPTIONS.map((option) => option.value)).toContain(
      'wan-3-video'
    );
    expect(AGENT_MODEL_OPTIONS.map((option) => option.value)).toContain(
      'wan-3-video-prime'
    );
    expect(providerModelFor('wan-3-video', 'kie', 'generate')).toBe(
      'wan/3-0-video'
    );
    expect(
      providerModelFor('wan-3-video', 'apimart', 'generate')
    ).toBeUndefined();
    expect(labelForGeneratedModel('wan/3-0-video-prime')).toBe(
      'Wan 3.0 Video Prime'
    );
    expect(creditsForGeneration('wan-3-video', 12, '720p')).toBe(20);
    expect(creditsForGeneration('wan-3-video-prime', 12, '1080p')).toBe(60);
    expect(defaultComposerSettings().modelOption.startsWith('wan')).toBe(false);
  });
  it('retains readable labels for existing MiniMax videos', () => {
    expect(
      labelForGeneratedModel('fal-ai/minimax/hailuo-2.3/pro/image-to-video')
    ).toBe('MiniMax H3');
  });
});
