import { describe, expect, it } from 'vitest';

import {
  createVideoProviderOverride,
  durationSeconds,
  normalizeProviderAspectRatio,
  pickVideoProvider,
  resolveReferenceImage,
} from './tools';

describe('resolveReferenceImage', () => {
  it('passes absolute URLs through untouched', () => {
    for (const url of [
      'https://cdn.example.com/a.png',
      'http://cdn.example.com/a.png',
      'HTTPS://CDN.EXAMPLE.COM/A.PNG',
    ]) {
      expect(resolveReferenceImage(url)).toBe(url);
    }
  });

  it('passes data URIs through untouched', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveReferenceImage(uri)).toBe(uri);
  });

  it('rejects site-relative paths that were not published by the composer', () => {
    expect(() => resolveReferenceImage('/imgs/examples/a.webp')).toThrow(
      /unsupported image reference/
    );
  });

  it('rejects absolute localhost URLs', () => {
    for (const local of [
      'http://localhost:3000/a.png',
      'http://127.0.0.1/a.png',
      'http://0.0.0.0/a.png',
      'http://[::1]/a.png',
    ]) {
      expect(() => resolveReferenceImage(local)).toThrow(
        /unsupported image reference/
      );
    }
  });

  it('rejects a protocol-relative URL', () => {
    // `//elsewhere/x` looks relative but resolves off-site.
    expect(() => resolveReferenceImage('//elsewhere.com/a.png')).toThrow(
      /unsupported image reference/
    );
  });

  it('rejects anything else', () => {
    for (const bad of ['a.png', 'file:///etc/passwd', '../secret.png', '']) {
      expect(() => resolveReferenceImage(bad)).toThrow(
        /unsupported image reference/
      );
    }
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(resolveReferenceImage('  https://cdn.example.com/a.png  ')).toBe(
      'https://cdn.example.com/a.png'
    );
  });
});

describe('normalizeProviderAspectRatio', () => {
  it('preserves adaptive mode for Seedance', () => {
    expect(normalizeProviderAspectRatio('seedance-2-mini', 'adaptive')).toBe(
      'adaptive'
    );
  });

  it('preserves concrete Seedance ratios', () => {
    expect(normalizeProviderAspectRatio('seedance-2-mini', '9:16')).toBe(
      '9:16'
    );
    expect(normalizeProviderAspectRatio('seedance-2-5', 'auto')).toBe('auto');
  });
});

describe('durationSeconds', () => {
  it('uses the nearest priced preset requested by the tool call', () => {
    expect(durationSeconds(10, 15, 'seedance-2-mini')).toBe(12);
    expect(durationSeconds(15, 12, 'seedance-2-mini')).toBe(15);
  });

  it('falls back to the composer setting', () => {
    expect(durationSeconds(undefined, 15, 'seedance-2-mini')).toBe(15);
  });

  it('uses the selected model default for non-numeric lengths', () => {
    for (const bad of [NaN, 'soon', null]) {
      expect(durationSeconds(bad, undefined, 'seedance-2-mini')).toBe(12);
    }
  });

  it('normalizes lengths to the priced presets', () => {
    expect(durationSeconds(1, undefined, 'seedance-2-mini')).toBe(12);
    expect(durationSeconds(99, undefined, 'seedance-2-mini')).toBe(15);
    expect(durationSeconds(99, undefined, 'seedance-2-5')).toBe(15);
  });
});

describe('pickVideoProvider', () => {
  it('routes the chosen model to a compatible configured provider', () => {
    const configs = {
      grouter_api_key: 'g',
      grouter_base_url: 'https://gateway.example.com',
      kie_api_key: 'k',
    };
    expect(pickVideoProvider(configs, 'seedance-2-mini')).toBe('kie');
    expect(pickVideoProvider(configs, 'seedance-2-5')).toBe('grouter');
    expect(
      pickVideoProvider({ fal_api_key: 'k' }, 'seedance-2-mini')
    ).toBeNull();
  });

  it('returns null when nothing is configured', () => {
    expect(pickVideoProvider({})).toBeNull();
  });

  it('prefers gRouter when auto and all are configured', () => {
    expect(
      pickVideoProvider({
        grouter_api_key: 'g',
        grouter_base_url: 'https://gateway.example.com',
        fal_api_key: 'k',
        replicate_api_token: 't',
      })
    ).toBe('grouter');
  });

  it('honours an explicit preference', () => {
    expect(
      pickVideoProvider({
        default_video_provider: 'replicate',
        fal_api_key: 'k',
        replicate_api_token: 't',
      })
    ).toBe('replicate');
  });

  it('falls back when the preferred provider has no credentials', () => {
    // A stale preference shouldn't take down generation that could still run.
    expect(
      pickVideoProvider({
        default_video_provider: 'replicate',
        fal_api_key: 'k',
      })
    ).toBe('fal');
  });

  it('keeps Kie when APIMart is configured but not selected', () => {
    expect(
      pickVideoProvider({
        kie_api_key: 'k',
        apimart_api_key: 'a',
      })
    ).toBe('kie');
    expect(
      pickVideoProvider(
        { kie_api_key: 'k', apimart_api_key: 'a' },
        'seedance-2-mini'
      )
    ).toBe('kie');
    expect(createVideoProviderOverride({ kie_api_key: 'k' })).toBe('kie');
    expect(
      createVideoProviderOverride({
        default_video_provider: 'auto',
        apimart_api_key: 'a',
        kie_api_key: 'k',
      })
    ).toBe('kie');
  });

  it('uses APIMart only when an admin selects it and a key is saved', () => {
    expect(
      pickVideoProvider(
        {
          default_video_provider: 'apimart',
          apimart_api_key: 'a',
          kie_api_key: 'k',
        },
        'seedance-2-5'
      )
    ).toBe('apimart');
    expect(
      createVideoProviderOverride({
        default_video_provider: 'apimart',
        apimart_api_key: 'a',
      })
    ).toBe('apimart');
    expect(
      pickVideoProvider({
        default_video_provider: 'apimart',
        kie_api_key: 'k',
      })
    ).toBe('kie');
    expect(
      createVideoProviderOverride({ default_video_provider: 'apimart' })
    ).toBe('kie');
  });
});
