import * as opentypeModule from 'opentype.js';
import type { Font, PathCommand } from 'opentype.js';

import { latinFontBase64, scFontBase64 } from '@/lib/gif-pack/font-data';
import type { Raster } from '@/lib/gif-pack/raster';

type Segment = { x1: number; y1: number; x2: number; y2: number };

let latinFont: Font | null = null;
let scFont: Font | null = null;

function parseFont(base64: string): Font {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  const parsed = opentypeModule as unknown as {
    parse?: (data: ArrayBuffer) => Font;
    default?: { parse?: (data: ArrayBuffer) => Font };
  };
  const parse = parsed.parse ?? parsed.default?.parse;
  if (!parse) throw new Error('Caption font parser is unavailable');
  return parse(buffer);
}

function fontsFor(language: 'zh' | 'en'): Font[] {
  if (!latinFont) latinFont = parseFont(latinFontBase64);
  if (language === 'en') return [latinFont];
  if (!scFont) scFont = parseFont(scFontBase64);
  return [scFont, latinFont];
}

function glyphFor(fonts: Font[], char: string) {
  for (const font of fonts) {
    const glyph = font.charToGlyph(char);
    if (glyph.unicode != null || char === ' ') return { font, glyph };
  }
  return { font: fonts[0], glyph: fonts[0].charToGlyph(char) };
}

/** Draw the same caption on every frame. Text is not asked of the image model. */
export function overlayCaption(
  frame: Raster,
  caption: string,
  language: 'zh' | 'en'
): Raster {
  const text = caption.trim();
  if (!text) return frame;
  const fonts = fontsFor(language);
  const maxWidth = frame.width * 0.9;
  let fontSize = Math.round(frame.width * 0.16);
  while (fontSize > 12 && measure(fonts, text, fontSize) > maxWidth)
    fontSize -= 1;
  const width = Math.ceil(measure(fonts, text, fontSize));
  const height = Math.ceil(fontSize * 1.25);
  const originX = Math.round((frame.width - width) / 2);
  const originY = frame.height - height - Math.round(frame.width * 0.04);
  const commands: PathCommand[] = [];
  let x = 0;
  for (const char of text) {
    const { font, glyph } = glyphFor(fonts, char);
    const path = glyph.getPath(x, fontSize, fontSize);
    commands.push(...path.commands);
    x += ((glyph.advanceWidth ?? font.unitsPerEm) * fontSize) / font.unitsPerEm;
  }
  const mask = fillMask(flatten(commands), width + 4, height + 4, -2, -2);
  const outline = dilate(
    mask,
    width + 4,
    height + 4,
    Math.max(1, Math.round(fontSize / 16))
  );
  const rgba = new Uint8Array(frame.rgba);
  blit(
    rgba,
    frame.width,
    frame.height,
    outline,
    width + 4,
    originX - 2,
    originY - 2,
    20,
    16,
    16,
    255
  );
  blit(
    rgba,
    frame.width,
    frame.height,
    mask,
    width + 4,
    originX - 2,
    originY - 2,
    255,
    255,
    255,
    255
  );
  return { width: frame.width, height: frame.height, rgba };
}

function measure(fonts: Font[], text: string, fontSize: number) {
  let width = 0;
  for (const char of text) {
    const { font, glyph } = glyphFor(fonts, char);
    width +=
      ((glyph.advanceWidth ?? font.unitsPerEm) * fontSize) / font.unitsPerEm;
  }
  return width;
}

function flatten(commands: PathCommand[]): Segment[] {
  const segments: Segment[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const line = (x: number, y: number) => {
    if (x !== cx || y !== cy) segments.push({ x1: cx, y1: cy, x2: x, y2: y });
    cx = x;
    cy = y;
  };
  const curve = (points: { x: number; y: number }[]) => {
    for (let step = 1; step <= 8; step += 1)
      line(sample(points, step / 8).x, sample(points, step / 8).y);
  };
  for (const command of commands) {
    if (command.type === 'M') {
      cx = command.x;
      cy = command.y;
      sx = cx;
      sy = cy;
    } else if (command.type === 'L') line(command.x, command.y);
    else if (command.type === 'Q') {
      curve([
        { x: cx, y: cy },
        { x: command.x1, y: command.y1 },
        { x: command.x, y: command.y },
      ]);
    } else if (command.type === 'C') {
      curve([
        { x: cx, y: cy },
        { x: command.x1, y: command.y1 },
        { x: command.x2, y: command.y2 },
        { x: command.x, y: command.y },
      ]);
    } else if (command.type === 'Z') line(sx, sy);
  }
  return segments;
}

function sample(points: { x: number; y: number }[], t: number) {
  let current = points;
  while (current.length > 1) {
    const next: { x: number; y: number }[] = [];
    for (let index = 0; index < current.length - 1; index += 1) {
      next.push({
        x: current[index].x + (current[index + 1].x - current[index].x) * t,
        y: current[index].y + (current[index + 1].y - current[index].y) * t,
      });
    }
    current = next;
  }
  return current[0];
}

function fillMask(
  segments: Segment[],
  width: number,
  height: number,
  originX: number,
  originY: number
) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const scan = y + 0.5;
    const hits: { x: number; dir: number }[] = [];
    for (const segment of segments) {
      const y1 = segment.y1 - originY;
      const y2 = segment.y2 - originY;
      if (y1 === y2) continue;
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      if (scan < yMin || scan >= yMax) continue;
      const t = (scan - y1) / (y2 - y1);
      hits.push({
        x: segment.x1 - originX + t * (segment.x2 - segment.x1),
        dir: y1 < y2 ? 1 : -1,
      });
    }
    hits.sort((a, b) => a.x - b.x);
    let winding = 0;
    let start = 0;
    for (const hit of hits) {
      const previous = winding;
      winding += hit.dir;
      if (previous === 0 && winding !== 0) start = hit.x;
      else if (previous !== 0 && winding === 0) {
        let x0 = Math.ceil(start);
        let x1 = Math.floor(hit.x);
        if (x0 < 0) x0 = 0;
        if (x1 >= width) x1 = width - 1;
        for (let x = x0; x <= x1; x += 1) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
) {
  const out = new Uint8Array(mask);
  const radiusSq = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (
        let yy = Math.max(0, y - radius);
        yy <= Math.min(height - 1, y + radius);
        yy += 1
      ) {
        for (
          let xx = Math.max(0, x - radius);
          xx <= Math.min(width - 1, x + radius);
          xx += 1
        ) {
          const dx = xx - x;
          const dy = yy - y;
          if (dx * dx + dy * dy <= radiusSq) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

function blit(
  rgba: Uint8Array,
  width: number,
  height: number,
  mask: Uint8Array,
  maskWidth: number,
  originX: number,
  originY: number,
  red: number,
  green: number,
  blue: number,
  alpha: number
) {
  const maskHeight = mask.length / maskWidth;
  for (let y = 0; y < maskHeight; y += 1) {
    const dy = originY + y;
    if (dy < 0 || dy >= height) continue;
    for (let x = 0; x < maskWidth; x += 1) {
      if (!mask[y * maskWidth + x]) continue;
      const dx = originX + x;
      if (dx < 0 || dx >= width) continue;
      const o = (dy * width + dx) * 4;
      rgba[o] = red;
      rgba[o + 1] = green;
      rgba[o + 2] = blue;
      rgba[o + 3] = alpha;
    }
  }
}
