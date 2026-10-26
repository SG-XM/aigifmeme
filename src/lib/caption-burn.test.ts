import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import { burnCaptionJpeg, latinCaptionFont } from './caption-burn';

function solidJpeg(
  width: number,
  height: number,
  color: [number, number, number]
) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = 255;
  }
  return new Uint8Array(encodeJpeg({ data, width, height }, 90).data);
}

describe('caption burn', () => {
  it('draws centered white text with a dark outline on a jpeg', async () => {
    const source = solidJpeg(48, 64, [180, 30, 30]);
    const burned = await burnCaptionJpeg(source, "i'm so sorry", {
      width: 180,
      height: 240,
      closing: true,
      fonts: [latinCaptionFont()],
    });
    expect(burned[0]).toBe(0xff);
    expect(burned[1]).toBe(0xd8);
    const decoded = decodeJpeg(burned, { useTArray: true, formatAsRGBA: true });
    expect(decoded.width).toBe(180);
    expect(decoded.height).toBe(240);
    let white = 0;
    let black = 0;
    const pixels = decoded.data;
    for (let index = 0; index < decoded.width * decoded.height; index += 1) {
      const r = pixels[index * 4];
      const g = pixels[index * 4 + 1];
      const b = pixels[index * 4 + 2];
      if (r > 245 && g > 245 && b > 245) white += 1;
      if (r < 20 && g < 20 && b < 20) black += 1;
    }
    expect(white).toBeGreaterThan(40);
    expect(black).toBeGreaterThan(20);
  });

  it('covers the Spanish closer', async () => {
    const source = solidJpeg(32, 32, [20, 20, 20]);
    const burned = await burnCaptionJpeg(source, 'perdón', {
      width: 160,
      height: 200,
      fonts: [latinCaptionFont()],
    });
    expect(burned[0]).toBe(0xff);
  });
});
