import { decode as decodePng, encode as encodePng } from 'fast-png';
import { decode as decodeJpeg } from 'jpeg-js';

export type Raster = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

export class ImageDecodeError extends Error {
  constructor(
    readonly code: 'image_unsupported' | 'image_undecodable',
    message: string
  ) {
    super(message);
  }
}

function toRgba(
  width: number,
  height: number,
  data: Uint8Array,
  channels: number
): Raster {
  if (channels === 4 && data.length === width * height * 4) {
    return { width, height, rgba: data };
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i += 1, o += channels) {
    const t = i * 4;
    if (channels === 1) {
      rgba[t] = rgba[t + 1] = rgba[t + 2] = data[o] ?? 0;
      rgba[t + 3] = 255;
    } else if (channels === 2) {
      rgba[t] = rgba[t + 1] = rgba[t + 2] = data[o] ?? 0;
      rgba[t + 3] = data[o + 1] ?? 255;
    } else if (channels === 3) {
      rgba[t] = data[o] ?? 0;
      rgba[t + 1] = data[o + 1] ?? 0;
      rgba[t + 2] = data[o + 2] ?? 0;
      rgba[t + 3] = 255;
    } else {
      rgba[t] = data[o] ?? 0;
      rgba[t + 1] = data[o + 1] ?? 0;
      rgba[t + 2] = data[o + 2] ?? 0;
      rgba[t + 3] = data[o + 3] ?? 255;
    }
  }
  return { width, height, rgba };
}

function looksLikePng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
}

function looksLikeJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function looksLikeGif(bytes: Uint8Array) {
  return (
    bytes.length > 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  );
}

export function decodeRaster(bytes: Uint8Array, mime?: string): Raster {
  const type = (mime ?? '').toLowerCase();
  const png = type.includes('png') || looksLikePng(bytes);
  const jpeg =
    type.includes('jpeg') || type.includes('jpg') || looksLikeJpeg(bytes);
  const gif = type.includes('gif') || looksLikeGif(bytes);
  if (!png && !jpeg && !gif) {
    throw new ImageDecodeError(
      'image_unsupported',
      'Use a PNG, JPEG, or GIF. Replace the image and try again.'
    );
  }
  try {
    if (png) {
      const decoded = decodePng(bytes);
      return toRgba(
        decoded.width,
        decoded.height,
        decoded.data instanceof Uint8Array
          ? decoded.data
          : new Uint8Array(decoded.data),
        decoded.channels ?? 4
      );
    }
    if (jpeg) {
      const decoded = decodeJpeg(bytes, {
        useTArray: true,
        formatAsRGBA: true,
      });
      return {
        width: decoded.width,
        height: decoded.height,
        rgba: decoded.data,
      };
    }
    return decodeGifFrame(bytes);
  } catch (error) {
    if (error instanceof ImageDecodeError) throw error;
    throw new ImageDecodeError(
      'image_undecodable',
      'This image could not be read. Replace it with a PNG, JPEG, or GIF.'
    );
  }
}

export function encodeRasterPng(raster: Raster): Uint8Array {
  return encodePng({
    width: raster.width,
    height: raster.height,
    data: raster.rgba,
    channels: 4,
    depth: 8,
  });
}

export function lumaStddev(raster: Raster): number {
  const { rgba } = raster;
  const count = raster.width * raster.height;
  if (!count) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    sum += y;
    sumSq += y * y;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSq / count - mean * mean));
}

export function cropRaster(
  raster: Raster,
  box: { x: number; y: number; width: number; height: number },
  padRatio: number
): Raster {
  const padX = Math.round(box.width * padRatio);
  const padY = Math.round(box.height * padRatio);
  const x0 = Math.max(0, box.x - padX);
  const y0 = Math.max(0, box.y - padY);
  const x1 = Math.min(raster.width, box.x + box.width + padX);
  const y1 = Math.min(raster.height, box.y + box.height + padY);
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = ((y0 + y) * raster.width + x0) * 4;
    rgba.set(raster.rgba.subarray(src, src + width * 4), y * width * 4);
  }
  return { width, height, rgba };
}

export function resizeRaster(raster: Raster, size: number): Raster {
  if (raster.width === size && raster.height === size) return raster;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(
      raster.height - 1,
      Math.floor((y * raster.height) / size)
    );
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(
        raster.width - 1,
        Math.floor((x * raster.width) / size)
      );
      const src = (sy * raster.width + sx) * 4;
      const dst = (y * size + x) * 4;
      rgba[dst] = raster.rgba[src];
      rgba[dst + 1] = raster.rgba[src + 1];
      rgba[dst + 2] = raster.rgba[src + 2];
      rgba[dst + 3] = raster.rgba[src + 3];
    }
  }
  return { width: size, height: size, rgba };
}

export function compositeOnColor(raster: Raster, hex: string): Raster {
  const color = hexToRgb(hex);
  const rgba = new Uint8Array(raster.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    rgba[i] = Math.round(rgba[i] * a + color[0] * (1 - a));
    rgba[i + 1] = Math.round(rgba[i + 1] * a + color[1] * (1 - a));
    rgba[i + 2] = Math.round(rgba[i + 2] * a + color[2] * (1 - a));
    rgba[i + 3] = 255;
  }
  return { width: raster.width, height: raster.height, rgba };
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return [255, 255, 255];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** First GIF frame on the logical screen. Later frames are not needed for an upload. */
function decodeGifFrame(bytes: Uint8Array): Raster {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  if (!width || !height || width > 4096 || height > 4096) {
    throw new ImageDecodeError(
      'image_undecodable',
      'This GIF could not be read.'
    );
  }
  const packed = bytes[10] ?? 0;
  const gctFlag = (packed & 0x80) !== 0;
  const gctCount = gctFlag ? 1 << ((packed & 7) + 1) : 0;
  let offset = 13;
  const globalTable = bytes.subarray(offset, offset + gctCount * 3);
  offset += gctCount * 3;
  const screen = new Uint8Array(width * height * 4);
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 2;
      offset = skipSubBlocks(bytes, offset);
      continue;
    }
    if (marker !== 0x2c) {
      throw new ImageDecodeError(
        'image_undecodable',
        'This GIF could not be read.'
      );
    }
    const left = view.getUint16(offset + 1, true);
    const top = view.getUint16(offset + 3, true);
    const frameWidth = view.getUint16(offset + 5, true);
    const frameHeight = view.getUint16(offset + 7, true);
    const imagePacked = bytes[offset + 9] ?? 0;
    const localFlag = (imagePacked & 0x80) !== 0;
    const localCount = localFlag ? 1 << ((imagePacked & 7) + 1) : 0;
    offset += 10;
    const localTable = bytes.subarray(offset, offset + localCount * 3);
    offset += localCount * 3;
    const minCodeSize = bytes[offset] ?? 2;
    offset += 1;
    const start = offset;
    offset = skipSubBlocks(bytes, offset);
    const lzw = joinSubBlocks(bytes, start);
    const indexes = lzwDecode(lzw, minCodeSize, frameWidth * frameHeight);
    paintIndexes(
      screen,
      width,
      indexes,
      left,
      top,
      frameWidth,
      localFlag ? localTable : globalTable
    );
    return { width, height, rgba: screen };
  }
  throw new ImageDecodeError('image_undecodable', 'This GIF has no frame.');
}

function skipSubBlocks(bytes: Uint8Array, offset: number) {
  while (offset < bytes.length) {
    const size = bytes[offset] ?? 0;
    offset += 1 + size;
    if (size === 0) break;
  }
  return offset;
}

function joinSubBlocks(bytes: Uint8Array, offset: number) {
  const parts: Uint8Array[] = [];
  let total = 0;
  while (offset < bytes.length) {
    const size = bytes[offset] ?? 0;
    offset += 1;
    if (size === 0) break;
    parts.push(bytes.subarray(offset, offset + size));
    total += size;
    offset += size;
  }
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function paintIndexes(
  screen: Uint8Array,
  screenWidth: number,
  indexes: Uint8Array,
  left: number,
  top: number,
  frameWidth: number,
  table: Uint8Array
) {
  for (let i = 0; i < indexes.length; i += 1) {
    const x = left + (i % frameWidth);
    const y = top + Math.floor(i / frameWidth);
    if (
      x < 0 ||
      y < 0 ||
      x >= screenWidth ||
      y >= screen.length / (screenWidth * 4)
    ) {
      continue;
    }
    const color = indexes[i] * 3;
    const dst = (y * screenWidth + x) * 4;
    screen[dst] = table[color] ?? 0;
    screen[dst + 1] = table[color + 1] ?? 0;
    screen[dst + 2] = table[color + 2] ?? 0;
    screen[dst + 3] = 255;
  }
}

export function lzwDecode(
  data: Uint8Array,
  minCodeSize: number,
  limit: number
): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  const dict: number[][] = [];
  for (let i = 0; i < clear; i += 1) dict[i] = [i];
  let bit = 0;
  const read = () => {
    let value = 0;
    for (let i = 0; i < codeSize; i += 1) {
      const byte = data[bit >> 3] ?? 0;
      if ((byte >> (bit & 7)) & 1) value |= 1 << i;
      bit += 1;
    }
    return value;
  };
  const out: number[] = [];
  let prev: number[] | null = null;
  while (out.length < limit && bit >> 3 < data.length) {
    const code = read();
    if (code === clear) {
      dict.length = clear;
      codeSize = minCodeSize + 1;
      next = eoi + 1;
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry = dict[code];
    if (!entry && prev) entry = prev.concat(prev[0]);
    if (!entry) break;
    for (const value of entry) {
      out.push(value);
      if (out.length >= limit) break;
    }
    if (prev && next < 4096) {
      dict[next] = prev.concat(entry[0]);
      next += 1;
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    prev = entry;
  }
  return Uint8Array.from(out.slice(0, limit));
}
