import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('homepage SSR boundary', () => {
  it('does not statically import the pdf-lib metadata engine', () => {
    const source = readFileSync(
      new URL('./metadata-remover-home.tsx', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"]@\/lib\/metadata['"]/);
    expect(source).toContain("import('@/lib/metadata')");
    expect(source).toContain("m['home.check_title']()");
    expect(source).toContain("m['home.title']()");
    expect(source).toContain("m['home.faq_a11']()");
  });
});
