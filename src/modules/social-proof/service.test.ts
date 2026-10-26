import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGeneratedVideoCount } from './service';

const state = vi.hoisted(() => ({
  users: 0 as number | string,
  calls: 0,
}));

vi.mock('@/core/db', () => ({
  db: () => ({
    select: () => ({
      from: () => {
        state.calls += 1;
        return Promise.resolve([{ value: state.users }]);
      },
    }),
  }),
}));

let clock = Date.parse('2026-01-01T00:00:00Z');

describe('getGeneratedVideoCount', () => {
  beforeEach(() => {
    state.users = 0;
    state.calls = 0;
    clock += 120_000;
    vi.useFakeTimers();
    vi.setSystemTime(clock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts live users and reuses the result for a minute', async () => {
    state.users = 2;
    expect(await getGeneratedVideoCount()).toBe(15);
    state.users = 10;
    expect(await getGeneratedVideoCount()).toBe(15);
    expect(state.calls).toBe(1);

    vi.setSystemTime(Date.now() + 60_000);
    expect(await getGeneratedVideoCount()).toBe(63);
    expect(state.calls).toBe(2);
  });

  it('accepts a numeric string from the database driver', async () => {
    state.users = '8';
    expect(await getGeneratedVideoCount()).toBe(51);
  });
});
