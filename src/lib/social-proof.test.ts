import { describe, expect, it } from 'vitest';

import { formatProofNumber, generatedVideoCount } from './social-proof';

describe('generatedVideoCount', () => {
  it('is registered users times 6 plus 3', () => {
    expect(generatedVideoCount(0)).toBe(3);
    expect(generatedVideoCount(1)).toBe(9);
    expect(generatedVideoCount(10)).toBe(63);
  });

  it('formats claim and live figures for the active locale', () => {
    expect(formatProofNumber(12345, 'en')).toBe('12,345');
    expect(formatProofNumber(200, 'es')).toBe(
      new Intl.NumberFormat('es').format(200)
    );
  });

  it('ignores fractional and unusable counts', () => {
    expect(generatedVideoCount(1.9)).toBe(9);
    expect(generatedVideoCount(-4)).toBe(3);
    expect(generatedVideoCount(Number.NaN)).toBe(3);
  });
});
