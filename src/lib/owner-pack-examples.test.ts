import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OWNER_PACK_EXAMPLES, ownerPackExamples } from './owner-pack-examples';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SHA256: Record<string, string> = {
  ex01: '2fb7914db9b41e3a1cf672cb0f6fee10803175a30d3920a421ff693c3b335653',
  ex02: '9f60d5b5fd5060a4557f39a343758f494558954acf0a3175933bf89e635a5c00',
  ex03: '5161703a363ba5d0b00d4f530567bac38c41ebb2d918318567c95465a3a03289',
  ex04: 'dbb88e8c34ca7d485a71a4109762c9c9274192abbabd8caf96263046fde805e3',
  ex05: 'cae49eea20977c29eaf10fea80a6958712d87d9a2442eac14e40e344810b552e',
  ex06: '7a1ea545cd0a88daa4f16f07abfa9ec88a81b30d998f8f4246919d1e1f2b190e',
};

const GEOMETRIC = [
  'reaction-sticker',
  'caption-loop',
  'pet-meme',
  'poster-sticker',
];

describe('owner pack homepage examples', () => {
  it('uses the six curated GIF files and not the geometric placeholders', () => {
    expect(OWNER_PACK_EXAMPLES.map((row) => row.id)).toEqual([
      'ex01',
      'ex02',
      'ex03',
      'ex04',
      'ex05',
      'ex06',
    ]);
    for (const row of OWNER_PACK_EXAMPLES) {
      expect(row.src.startsWith('/examples/owner-packs/')).toBe(true);
      expect(row.src.endsWith('.gif')).toBe(true);
      expect(row.src.includes('contact-sheet')).toBe(false);
      expect(GEOMETRIC.some((id) => row.src.includes(id))).toBe(false);
      const file = resolve(ROOT, 'public', row.src.slice(1));
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
      expect(bytes.readUInt16LE(6)).toBe(240);
      expect(bytes.readUInt16LE(8)).toBe(240);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        SHA256[row.id]
      );
    }
  });

  it('keeps Chinese as the file label and translates only the page label', () => {
    const zh = ownerPackExamples('zh');
    const en = ownerPackExamples('en');
    expect(zh.map((row) => row.label)).toEqual([
      '今天也棒',
      '笑死我了',
      '无语了',
      '笑不活了',
      '抱抱嘛',
      '不想动',
    ]);
    expect(en.map((row) => row.label)).toEqual([
      'Feeling great today',
      'Dying of laughter',
      'Speechless',
      "Can't stop laughing",
      'Hug me',
      "Don't wanna move",
    ]);
    expect(en.every((row) => row.alt.includes('Chinese'))).toBe(true);
    expect(zh.every((row) => row.alt.startsWith('以前做好的表情包'))).toBe(
      true
    );
    expect(ownerPackExamples('es')[0]?.label).toBe('Hoy también va bien');
    expect(ownerPackExamples('ar')[4]?.label).toBe('حضني');
  });
});
