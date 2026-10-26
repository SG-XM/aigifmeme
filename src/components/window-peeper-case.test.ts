import { describe, expect, it } from 'vitest';

import { wipePercent } from './window-peeper-wipe';

describe('window peeper wipe', () => {
  it('maps pointer x onto the stage from the left', () => {
    expect(wipePercent(100, 100, 200)).toBe(0);
    expect(wipePercent(200, 100, 200)).toBe(50);
    expect(wipePercent(300, 100, 200)).toBe(100);
    expect(wipePercent(40, 100, 200)).toBe(0);
    expect(wipePercent(400, 100, 200)).toBe(100);
    expect(wipePercent(150, 0, 0)).toBe(0);
  });
});
