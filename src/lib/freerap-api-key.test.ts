import { afterEach, describe, expect, it } from 'vitest';

import { freerapApiKey } from './freerap-api-key';

const original = process.env.FREERAP_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.FREERAP_API_KEY;
  else process.env.FREERAP_API_KEY = original;
  delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
});

describe('freerapApiKey', () => {
  it('reads the process env name and trims it', () => {
    process.env.FREERAP_API_KEY = '  test-freerap-key  ';
    expect(freerapApiKey()).toBe('test-freerap-key');
  });

  it('falls back to the Workers env binding when the process env is empty', () => {
    delete process.env.FREERAP_API_KEY;
    (globalThis as { __CF_ENV__?: { FREERAP_API_KEY?: string } }).__CF_ENV__ = {
      FREERAP_API_KEY: 'worker-test-key',
    };
    expect(freerapApiKey()).toBe('worker-test-key');
  });

  it('returns an empty string when neither source is set', () => {
    delete process.env.FREERAP_API_KEY;
    expect(freerapApiKey()).toBe('');
  });
});
