import { describe, expect, it } from 'vitest';

import { inspectImage, sniffImage, stripImage } from './image';
import { inspectDocument, stripDocument } from './index';

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function tiffMake(make: string): Uint8Array {
  const makeBytes = ascii(`${make}\0`);
  const tiff = new Uint8Array(26 + makeBytes.length);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x010f, true);
  view.setUint16(12, 2, true);
  view.setUint32(14, makeBytes.length, true);
  view.setUint32(18, 26, true);
  tiff.set(makeBytes, 26);
  return tiff;
}

function jpegWithExif(make: string): Uint8Array {
  const payload = concat(ascii('Exif\0\0'), tiffMake(make));
  const app = new Uint8Array(4 + payload.length);
  app[0] = 0xff;
  app[1] = 0xe1;
  app[2] = (payload.length + 2) >> 8;
  app[3] = (payload.length + 2) & 0xff;
  app.set(payload, 4);
  return concat(
    new Uint8Array([0xff, 0xd8]),
    app,
    new Uint8Array([0xff, 0xda, 0x00, 0x02, 0x12, 0xff, 0xd9])
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const raw = new Uint8Array(12 + data.length);
  const view = new DataView(raw.buffer);
  view.setUint32(0, data.length);
  raw.set(ascii(type), 4);
  raw.set(data, 8);
  return raw;
}

function samplePng(): Uint8Array {
  const text = concat(ascii('Author\0'), ascii('Ada Lovelace'));
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('tEXt', text),
    pngChunk('IDAT', ascii('pixels')),
    pngChunk('IEND', new Uint8Array())
  );
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length % 2;
  const raw = new Uint8Array(8 + data.length + pad);
  raw.set(ascii(type), 0);
  raw[4] = data.length & 0xff;
  raw[5] = (data.length >> 8) & 0xff;
  raw[6] = (data.length >> 16) & 0xff;
  raw[7] = (data.length >> 24) & 0xff;
  raw.set(data, 8);
  return raw;
}

function sampleWebp(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x08;
  const body = concat(
    webpChunk('VP8X', vp8x),
    webpChunk('EXIF', tiffMake('Nikon'))
  );
  const file = concat(ascii('RIFF'), new Uint8Array(4), ascii('WEBP'), body);
  const size = file.length - 8;
  file[4] = size & 0xff;
  file[5] = (size >> 8) & 0xff;
  file[6] = (size >> 16) & 0xff;
  file[7] = (size >> 24) & 0xff;
  return file;
}

function sampleGif(): Uint8Array {
  return concat(
    ascii('GIF89a'),
    new Uint8Array([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
    new Uint8Array([0x21, 0xfe, 0x05]),
    ascii('hello'),
    new Uint8Array([0x00, 0x3b])
  );
}

describe('image metadata', () => {
  it('reads and strips JPEG EXIF without touching the scan', async () => {
    const bytes = jpegWithExif('Canon');
    expect(sniffImage(bytes)).toBe('jpeg');
    const before = inspectImage(bytes);
    expect(before.issue).toBeUndefined();
    expect(before.entries.some((row) => row.value === 'Canon')).toBe(true);
    const cleaned = stripImage(bytes);
    expect(cleaned?.changed).toBe(true);
    expect(inspectImage(cleaned!.bytes).entries).toEqual([]);
    expect(cleaned!.bytes[0]).toBe(0xff);
    expect(cleaned!.bytes[1]).toBe(0xd8);
    expect(cleaned!.bytes.at(-2)).toBe(0xff);
    expect(cleaned!.bytes.at(-1)).toBe(0xd9);
    const roundTrip = await stripDocument('photo.jpg', bytes);
    expect(roundTrip.changed).toBe(true);
    const after = await inspectDocument('photo.jpg', roundTrip.bytes);
    expect(after.entries).toEqual([]);
  });

  it('reads and strips a PNG text chunk and keeps the image data', () => {
    const bytes = samplePng();
    const before = inspectImage(bytes);
    expect(before.entries.map((row) => row.value)).toContain('Ada Lovelace');
    const cleaned = stripImage(bytes);
    expect(cleaned?.changed).toBe(true);
    expect(inspectImage(cleaned!.bytes).entries).toEqual([]);
    expect(new TextDecoder().decode(cleaned!.bytes)).toContain('pixels');
    expect(new TextDecoder().decode(cleaned!.bytes)).not.toContain('Ada');
  });

  it('strips a WebP EXIF chunk and clears the VP8X flag', () => {
    const bytes = sampleWebp();
    expect(
      inspectImage(bytes).entries.some((row) => row.value === 'Nikon')
    ).toBe(true);
    const cleaned = stripImage(bytes);
    expect(cleaned?.changed).toBe(true);
    expect(inspectImage(cleaned!.bytes).entries).toEqual([]);
    expect(cleaned!.bytes[8 + 4 + 8]).toBe(0);
  });

  it('strips a GIF comment and leaves the trailer', () => {
    const bytes = sampleGif();
    expect(inspectImage(bytes).entries.map((row) => row.value)).toContain(
      'hello'
    );
    const cleaned = stripImage(bytes);
    expect(cleaned?.changed).toBe(true);
    const text = new TextDecoder().decode(cleaned!.bytes);
    expect(text.startsWith('GIF89a')).toBe(true);
    expect(text.endsWith(';')).toBe(true);
    expect(text).not.toContain('hello');
    expect(inspectImage(cleaned!.bytes).entries).toEqual([]);
  });

  it('does not pretend a video file can be cleaned', async () => {
    const report = await inspectDocument('clip.mp4', ascii('not-a-video'));
    expect(report.kind).toBe('video');
    expect(report.issue).toBe('video');
    expect(report.removable).toBe(false);
  });
});
