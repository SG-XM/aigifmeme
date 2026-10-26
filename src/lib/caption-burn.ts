import { decode as decodePng } from 'fast-png';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import * as opentypeModule from 'opentype.js';
import type { Font, Glyph, PathCommand } from 'opentype.js';

import { latinBoldWoffBase64 } from '@/lib/caption-font';

function parseFont(buffer: ArrayBuffer): Font {
  // Dev SSR resolves the CJS build, which has no named `parse` export.
  const parsed = opentypeModule as unknown as {
    parse?: (data: ArrayBuffer) => Font;
    default?: { parse?: (data: ArrayBuffer) => Font };
  };
  const parse = parsed.parse ?? parsed.default?.parse;
  if (!parse) throw new Error('Caption font parser is unavailable');
  return parse(buffer);
}

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1440;

const LATIN_FONT_SIZE = 64;
const CLOSING_FONT_SCALE = 1.18;
const MAX_TEXT_WIDTH_RATIO = 0.86;

let latinFont: Font | null = null;

export function latinCaptionFont(): Font {
  if (!latinFont) {
    const bytes = Uint8Array.from(atob(latinBoldWoffBase64), (char) =>
      char.charCodeAt(0)
    );
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    latinFont = parseFont(buffer);
  }
  return latinFont;
}

function glyphFor(fonts: Font[], char: string): { font: Font; glyph: Glyph } {
  for (const font of fonts) {
    const glyph = font.charToGlyph(char);
    if (glyph.index !== 0 || char === ' ') return { font, glyph };
  }
  return { font: fonts[0], glyph: fonts[0].charToGlyph(char) };
}

function missingGlyphs(fonts: Font[], text: string): string[] {
  const missing = new Set<string>();
  for (const char of text) {
    if (!char.trim()) continue;
    const { glyph } = glyphFor(fonts, char);
    if (glyph.index === 0) missing.add(char);
  }
  return [...missing];
}

/** Google Fonts subset, TTF only, from fonts.gstatic.com. */
export async function fetchCoveringFont(
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<Font | null> {
  const family = /[\u4e00-\u9fff]/.test(text)
    ? 'Noto Sans SC:700'
    : /[\u0600-\u06FF]/.test(text)
      ? 'Noto Naskh Arabic:700'
      : 'Noto Sans:700';
  const cssUrl = `https://fonts.googleapis.com/css?family=${family.replace(/ /g, '+')}&text=${encodeURIComponent(text)}`;
  const cssResponse = await fetchImpl(cssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0',
    },
  });
  if (!cssResponse.ok) return null;
  const css = await cssResponse.text();
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!match) return null;
  const fontResponse = await fetchImpl(match[1]);
  if (!fontResponse.ok) return null;
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  if (bytes.byteLength > 2_000_000) return null;
  return parseFont(bytes.buffer);
}

export async function fontsForCaption(
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<Font[]> {
  const latin = latinCaptionFont();
  const missing = missingGlyphs([latin], text);
  if (!missing.length) return [latin];
  const extra = await fetchCoveringFont(missing.join(''), fetchImpl).catch(
    () => null
  );
  const fonts = extra ? [extra, latin] : [latin];
  if (missingGlyphs(fonts, text).length) {
    throw new Error('Caption font is missing glyphs');
  }
  return fonts;
}

type Segment = { x1: number; y1: number; x2: number; y2: number };

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
  // Sample each quadratic/cubic into short lines. Treating those samples as
  // new control points bends the glyph; a fixed De Casteljau step does not.
  const curve = (points: { x: number; y: number }[]) => {
    const steps = 16;
    for (let step = 1; step <= steps; step += 1) {
      const point = sample(points, step / steps);
      line(point.x, point.y);
    }
  };
  for (const command of commands) {
    if (command.type === 'M') {
      cx = command.x;
      cy = command.y;
      sx = cx;
      sy = cy;
    } else if (command.type === 'L') {
      line(command.x, command.y);
    } else if (command.type === 'Q') {
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
    } else if (command.type === 'Z') {
      line(sx, sy);
    }
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
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const shifted = segments.map((segment) => ({
    x1: segment.x1 - originX,
    y1: segment.y1 - originY,
    x2: segment.x2 - originX,
    y2: segment.y2 - originY,
  }));
  for (let y = 0; y < height; y += 1) {
    const scan = y + 0.5;
    const hits: { x: number; dir: number }[] = [];
    for (const segment of shifted) {
      const { x1, y1, x2, y2 } = segment;
      if (y1 === y2) continue;
      const downward = y1 < y2;
      const yMin = downward ? y1 : y2;
      const yMax = downward ? y2 : y1;
      if (scan < yMin || scan >= yMax) continue;
      const t = (scan - y1) / (y2 - y1);
      hits.push({ x: x1 + t * (x2 - x1), dir: downward ? 1 : -1 });
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
        const row = y * width;
        for (let x = x0; x <= x1; x += 1) mask[row + x] = 1;
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
  const out = new Uint8Array(mask.length);
  const radiusSq = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let yy = y0; yy <= y1; yy += 1) {
        const dy = yy - y;
        for (let xx = x0; xx <= x1; xx += 1) {
          const dx = xx - x;
          if (dx * dx + dy * dy <= radiusSq) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

function measureLine(fonts: Font[], text: string, fontSize: number): number {
  let width = 0;
  let previous: Glyph | null = null;
  let previousFont: Font | null = null;
  for (const char of text) {
    const { font, glyph } = glyphFor(fonts, char);
    if (previous && previousFont === font) {
      width +=
        font.getKerningValue(previous, glyph) * (fontSize / font.unitsPerEm);
    }
    width +=
      ((glyph.advanceWidth ?? font.unitsPerEm) * fontSize) / font.unitsPerEm;
    previous = glyph;
    previousFont = font;
  }
  return width;
}

function wrapLine(
  fonts: Font[],
  text: string,
  fontSize: number,
  maxWidth: number
) {
  const words = text.split(/(\s+)/).filter((part) => part.length > 0);
  const lines: string[] = [];
  let current = '';
  const push = (value: string) => {
    if (value.trim()) lines.push(value.trim());
  };
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      if (current) current += ' ';
      continue;
    }
    const next = current ? `${current}${word}` : word;
    if (measureLine(fonts, next, fontSize) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) push(current);
    if (measureLine(fonts, word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      const trial = chunk + char;
      if (chunk && measureLine(fonts, trial, fontSize) > maxWidth) {
        push(chunk);
        chunk = char;
      } else chunk = trial;
    }
    current = chunk;
  }
  if (current) push(current);
  return lines.length ? lines : [''];
}

function layoutCaption(
  fonts: Font[],
  caption: string,
  maxWidth: number,
  closing: boolean
) {
  let fontSize = Math.round(
    LATIN_FONT_SIZE * (closing ? CLOSING_FONT_SCALE : 1)
  );
  let lines = wrapLine(fonts, caption, fontSize, maxWidth);
  while (
    (lines.length > 3 ||
      lines.some((line) => measureLine(fonts, line, fontSize) > maxWidth)) &&
    fontSize > 36
  ) {
    fontSize -= 2;
    lines = wrapLine(fonts, caption, fontSize, maxWidth);
  }
  return { fontSize, lines };
}

function rasterCaption(
  fonts: Font[],
  caption: string,
  closing: boolean,
  frameWidth: number
): { mask: Uint8Array; outline: Uint8Array; width: number; height: number } {
  const maxWidth = Math.floor(frameWidth * MAX_TEXT_WIDTH_RATIO);
  const { fontSize, lines } = layoutCaption(fonts, caption, maxWidth, closing);
  const radius = Math.max(2, Math.round(fontSize * 0.055));
  const lineHeight = Math.round(fontSize * 1.2);
  const textWidth = Math.max(
    1,
    ...lines.map((line) => Math.ceil(measureLine(fonts, line, fontSize)))
  );
  const textHeight = Math.max(1, lines.length * lineHeight);
  const pad = radius + 4;
  const width = textWidth + pad * 2;
  const height = textHeight + pad * 2;
  const fill = new Uint8Array(width * height);
  lines.forEach((line, lineIndex) => {
    const lineWidth = measureLine(fonts, line, fontSize);
    let pen = pad + (textWidth - lineWidth) / 2;
    const baseline = pad + lineIndex * lineHeight + fontSize * 0.82;
    let previous: Glyph | null = null;
    let previousFont: Font | null = null;
    for (const char of line) {
      const { font, glyph } = glyphFor(fonts, char);
      if (previous && previousFont === font) {
        pen +=
          font.getKerningValue(previous, glyph) * (fontSize / font.unitsPerEm);
      }
      const path = glyph.getPath(pen, baseline, fontSize);
      const segments = flatten(path.commands);
      const glyphMask = fillMask(segments, width, height, 0, 0);
      for (let index = 0; index < fill.length; index += 1) {
        if (glyphMask[index]) fill[index] = 1;
      }
      pen +=
        ((glyph.advanceWidth ?? font.unitsPerEm) * fontSize) / font.unitsPerEm;
      previous = glyph;
      previousFont = font;
    }
  });
  return {
    mask: fill,
    outline: dilate(fill, width, height, radius),
    width,
    height,
  };
}

function blit(
  frame: Uint8Array,
  frameWidth: number,
  frameHeight: number,
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  originX: number,
  originY: number,
  color: [number, number, number]
) {
  for (let y = 0; y < maskHeight; y += 1) {
    const fy = originY + y;
    if (fy < 0 || fy >= frameHeight) continue;
    for (let x = 0; x < maskWidth; x += 1) {
      if (!mask[y * maskWidth + x]) continue;
      const fx = originX + x;
      if (fx < 0 || fx >= frameWidth) continue;
      const index = (fy * frameWidth + fx) * 4;
      frame[index] = color[0];
      frame[index + 1] = color[1];
      frame[index + 2] = color[2];
      frame[index + 3] = 255;
    }
  }
}

function coverCrop(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  channels: number,
  targetWidth: number,
  targetHeight: number
): Uint8Array {
  const frame = new Uint8Array(targetWidth * targetHeight * 4);
  const scale = Math.max(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight
  );
  const cropWidth = targetWidth / scale;
  const cropHeight = targetHeight / scale;
  const offsetX = (sourceWidth - cropWidth) / 2;
  const offsetY = (sourceHeight - cropHeight) / 2;
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(
      sourceHeight - 1,
      Math.max(0, offsetY + (y + 0.5) / scale - 0.5)
    );
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(
        sourceWidth - 1,
        Math.max(0, offsetX + (x + 0.5) / scale - 0.5)
      );
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = sx - x0;
      const dest = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const sample = (px: number, py: number) =>
          source[(py * sourceWidth + px) * channels + channel];
        const value =
          sample(x0, y0) * (1 - fx) * (1 - fy) +
          sample(x1, y0) * fx * (1 - fy) +
          sample(x0, y1) * (1 - fx) * fy +
          sample(x1, y1) * fx * fy;
        frame[dest + channel] = Math.max(0, Math.min(255, Math.round(value)));
      }
      frame[dest + 3] = 255;
    }
  }
  return frame;
}

function decodePhoto(bytes: Uint8Array): {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
} {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 24,
    });
    return {
      data: decoded.data,
      width: decoded.width,
      height: decoded.height,
      channels: 4,
    };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const decoded = decodePng(bytes);
    return {
      data: decoded.data,
      width: decoded.width,
      height: decoded.height,
      channels: decoded.channels,
    };
  }
  throw new Error('Slide photo must be a JPEG or PNG');
}

export async function burnCaptionJpeg(
  bytes: Uint8Array,
  caption: string,
  options: {
    width?: number;
    height?: number;
    closing?: boolean;
    fonts?: Font[];
  } = {}
): Promise<Uint8Array> {
  const width = options.width ?? SLIDE_WIDTH;
  const height = options.height ?? SLIDE_HEIGHT;
  const text = caption.trim();
  if (!text) throw new Error('Caption is empty');
  const fonts = options.fonts ?? (await fontsForCaption(text));
  if (missingGlyphs(fonts, text).length) {
    throw new Error('Caption font is missing glyphs');
  }
  const photo = decodePhoto(bytes);
  const frame = coverCrop(
    photo.data,
    photo.width,
    photo.height,
    photo.channels,
    width,
    height
  );
  const raster = rasterCaption(fonts, text, options.closing === true, width);
  const originX = Math.round((width - raster.width) / 2);
  const originY = Math.round((height - raster.height) / 2);
  blit(
    frame,
    width,
    height,
    raster.outline,
    raster.width,
    raster.height,
    originX,
    originY,
    [0, 0, 0]
  );
  blit(
    frame,
    width,
    height,
    raster.mask,
    raster.width,
    raster.height,
    originX,
    originY,
    [255, 255, 255]
  );
  const encoded = encodeJpeg({ data: frame, width, height }, 85);
  return new Uint8Array(encoded.data);
}
