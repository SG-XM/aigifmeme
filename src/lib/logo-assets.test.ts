import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = [
  'public/logo.svg',
  'public/logo-horizontal-black.svg',
  'public/logo-horizontal-white.svg',
];

function pathData(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\sd="([^"]*)"/g)].map(
    (match) => match[1]
  );
}

describe('approved logo svg paths', () => {
  it('uses a real G outline and valid drawing commands', () => {
    for (const file of files) {
      const svg = readFileSync(file, 'utf8');
      const paths = pathData(svg);
      expect(paths.length, file).toBeGreaterThan(0);
      expect(paths, file).not.toContain('g-mark');
      expect(svg, file).toContain('fill="url(#g-mark)"');
      expect(svg, file).toContain('#FF4B2A');
      expect(svg, file).toContain('#FFC014');
      for (const data of paths) {
        expect(data, file).toMatch(/^[Mm][\d\s.,-]/);
        expect(data, file).not.toMatch(/[^MmLlHhVvCcSsQqTtAaZz0-9\s.,+-]/);
      }
    }
  });

  it('keeps the approved domain spelling on the horizontal lockups', () => {
    for (const file of files.slice(1)) {
      const svg = readFileSync(file, 'utf8');
      expect(svg).toContain('aria-label="aigifmeme.com"');
      expect(svg).not.toContain('aigifmeme.com.com');
    }
  });
});
