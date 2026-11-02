import {
  entry,
  withRemovable,
  type InspectResult,
  type MetadataEntry,
} from './types';

/**
 * Lossless photo metadata removal. Pixels, ICC profiles, and PNG color
 * chunks stay. EXIF, XMP, IPTC, GIF comments, and JPEG APP11
 * (content-credentials / JUMBF) segments are dropped.
 */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DROP_PNG = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
/** WebP VP8X feature bits. Spec diagram is MSB-first: I L E X A. */
const WEBP_EXIF = 0x08;
const WEBP_XMP = 0x04;

type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    PNG_SIG.every((byte, index) => bytes[index] === byte)
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'webp';
  }
  const gif = ascii(bytes, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  return null;
}

export function inspectImage(bytes: Uint8Array): InspectResult {
  const kind = sniffImage(bytes);
  if (!kind) return withRemovable('image', [], 'parse');
  try {
    const entries = readEntries(kind, bytes);
    if (!entries) return withRemovable('image', [], 'parse');
    return withRemovable('image', entries);
  } catch {
    return withRemovable('image', [], 'parse');
  }
}

export function stripImage(
  bytes: Uint8Array
): { bytes: Uint8Array; changed: boolean } | null {
  const kind = sniffImage(bytes);
  if (!kind) return null;
  if (kind === 'jpeg') return stripJpeg(bytes);
  if (kind === 'png') return stripPng(bytes);
  if (kind === 'webp') return stripWebp(bytes);
  return stripGif(bytes);
}

function readEntries(
  kind: ImageKind,
  bytes: Uint8Array
): MetadataEntry[] | null {
  if (kind === 'jpeg') return readJpeg(bytes);
  if (kind === 'png') return readPng(bytes);
  if (kind === 'webp') return readWebp(bytes);
  return readGif(bytes);
}

function push(
  rows: MetadataEntry[],
  id: string,
  label: string,
  value: string | undefined
) {
  const row = entry('exif', id, label, value);
  if (row) rows.push(row);
}

function readJpeg(bytes: Uint8Array): MetadataEntry[] | null {
  const segments = walkJpeg(bytes);
  if (!segments) return null;
  const rows: MetadataEntry[] = [];
  for (const segment of segments) {
    if (segment.marker === 0xe1) readApp1(segment.payload, rows);
    else if (segment.marker === 0xed) push(rows, 'iptc', 'IPTC', 'Photoshop');
    else if (segment.marker === 0xeb) {
      const text = ascii(
        segment.payload,
        0,
        Math.min(segment.payload.length, 64)
      );
      push(
        rows,
        'credentials',
        'Content credentials',
        /c2pa|jumb/i.test(text) ? 'C2PA' : 'APP11'
      );
    } else if (segment.marker === 0xfe) {
      push(rows, 'comment', 'Comment', decodeText(segment.payload));
    }
  }
  return rows;
}

function readApp1(payload: Uint8Array, rows: MetadataEntry[]) {
  if (ascii(payload, 0, 6) === 'Exif\u0000\u0000') {
    readTiff(payload.subarray(6), rows);
    return;
  }
  if (ascii(payload, 0, 29) === 'http://ns.adobe.com/xap/1.0/\u0000') {
    readXmp(decodeText(payload.subarray(29)), rows);
  }
}

function readXmp(xml: string, rows: MetadataEntry[]) {
  const creator = xml.match(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]+)/);
  const tool = xml.match(/<(?:xmp:)?CreatorTool>([^<]+)/);
  const when = xml.match(/<(?:xmp:)?CreateDate>([^<]+)/);
  const description = xml.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([^<]+)/);
  push(rows, 'author', 'Creator', creator?.[1]);
  push(rows, 'software', 'Creator tool', tool?.[1]);
  push(rows, 'created', 'Created', when?.[1]);
  push(rows, 'description', 'Description', description?.[1]);
  if (!creator && !tool && !when && !description) {
    push(rows, 'xmp', 'XMP', 'packet');
  }
}

const TIFF_TAGS: Record<number, [string, string]> = {
  0x010e: ['description', 'Description'],
  0x010f: ['make', 'Camera make'],
  0x0110: ['model', 'Camera model'],
  0x0131: ['software', 'Software'],
  0x0132: ['datetime', 'Date time'],
  0x013b: ['artist', 'Artist'],
  0x8298: ['copyright', 'Copyright'],
};

function readTiff(tiff: Uint8Array, rows: MetadataEntry[]) {
  if (tiff.length < 8) return;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = order === 'II';
  if (view.getUint16(2, le) !== 42) return;
  const ifd = view.getUint32(4, le);
  readIfd(view, tiff.length, ifd, le, rows, false);
}

function readIfd(
  view: DataView,
  length: number,
  offset: number,
  le: boolean,
  rows: MetadataEntry[],
  gps: boolean
) {
  if (offset < 0 || offset + 2 > length) return;
  const count = view.getUint16(offset, le);
  if (count > 256) return;
  let gpsAt = 0;
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12;
    if (at + 12 > length) return;
    const tag = view.getUint16(at, le);
    const type = view.getUint16(at + 2, le);
    const n = view.getUint32(at + 4, le);
    const value = view.getUint32(at + 8, le);
    if (!gps && tag === 0x8825) {
      gpsAt = value;
      continue;
    }
    if (gps) {
      readGpsTag(view, length, le, tag, type, n, value, rows);
      continue;
    }
    const named = TIFF_TAGS[tag];
    if (!named) continue;
    push(rows, named[0], named[1], readAscii(view, length, le, type, n, value));
  }
  if (gpsAt) readIfd(view, length, gpsAt, le, rows, true);
}

function readGpsTag(
  view: DataView,
  length: number,
  le: boolean,
  tag: number,
  type: number,
  count: number,
  value: number,
  rows: MetadataEntry[]
) {
  if (tag === 1 || tag === 3) {
    const ref = readAscii(view, length, le, type, count, value);
    rows.push({
      group: 'exif',
      id: tag === 1 ? 'lat-ref' : 'lon-ref',
      label: tag === 1 ? 'Latitude ref' : 'Longitude ref',
      value: ref || '',
    });
    if (!ref) rows.pop();
    return;
  }
  if ((tag === 2 || tag === 4) && type === 5 && count === 3) {
    const parts = readRationals(view, length, le, 3, value);
    if (!parts) return;
    const decimal = parts[0] + parts[1] / 60 + parts[2] / 3600;
    push(
      rows,
      tag === 2 ? 'latitude' : 'longitude',
      tag === 2 ? 'Latitude' : 'Longitude',
      decimal.toFixed(5)
    );
  }
}

function readAscii(
  view: DataView,
  length: number,
  le: boolean,
  type: number,
  count: number,
  value: number
): string {
  if (type !== 2 || count === 0) return '';
  const width = count;
  let offset = value;
  if (width <= 4) {
    const inline = new Uint8Array(4);
    new DataView(inline.buffer).setUint32(0, value, le);
    return cleanText(inline.subarray(0, width));
  }
  if (offset < 0 || offset + width > length) return '';
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, width);
  return cleanText(bytes);
}

function readRationals(
  view: DataView,
  length: number,
  le: boolean,
  count: number,
  offset: number
): number[] | null {
  if (offset < 0 || offset + count * 8 > length) return null;
  const parts: number[] = [];
  for (let index = 0; index < count; index++) {
    const at = offset + index * 8;
    const num = view.getUint32(at, le);
    const den = view.getUint32(at + 4, le);
    parts.push(den ? num / den : 0);
  }
  return parts;
}

type JpegSeg = { marker: number; payload: Uint8Array };

function walkJpeg(bytes: Uint8Array): JpegSeg[] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const segments: JpegSeg[] = [];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i++;
    if (marker === 0xd9) return segments;
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (i + 1 >= bytes.length) return null;
    const size = (bytes[i] << 8) | bytes[i + 1];
    if (size < 2 || i + size > bytes.length) return null;
    const payload = bytes.subarray(i + 2, i + size);
    if (marker === 0xda) return segments;
    segments.push({ marker, payload });
    i += size;
  }
  return null;
}

function jpegStripMarker(marker: number) {
  return (
    marker === 0xe1 || marker === 0xed || marker === 0xeb || marker === 0xfe
  );
}

function stripJpeg(
  bytes: Uint8Array
): { bytes: Uint8Array; changed: boolean } | null {
  if (!walkJpeg(bytes)) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let changed = false;
  while (i + 1 < bytes.length) {
    const markerAt = i;
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i++;
    if (marker === 0xd9) {
      parts.push(bytes.subarray(markerAt));
      break;
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      parts.push(bytes.subarray(markerAt, i));
      continue;
    }
    if (i + 1 >= bytes.length) return null;
    const size = (bytes[i] << 8) | bytes[i + 1];
    if (size < 2 || i + size > bytes.length) return null;
    if (marker === 0xda) {
      parts.push(bytes.subarray(markerAt));
      break;
    }
    if (jpegStripMarker(marker)) changed = true;
    else parts.push(bytes.subarray(markerAt, i + size));
    i += size;
  }
  return { bytes: changed ? concat(parts) : bytes, changed };
}

const PNG_META = DROP_PNG;

function readPng(bytes: Uint8Array): MetadataEntry[] | null {
  const chunks = walkPng(bytes);
  if (!chunks) return null;
  const rows: MetadataEntry[] = [];
  for (const chunk of chunks) {
    if (!PNG_META.has(chunk.type)) continue;
    if (chunk.type === 'tEXt') {
      const split = chunk.data.indexOf(0);
      if (split <= 0) continue;
      push(
        rows,
        'png-text',
        decodeText(chunk.data.subarray(0, split)),
        decodeText(chunk.data.subarray(split + 1))
      );
    } else if (chunk.type === 'tIME') {
      push(rows, 'datetime', 'Modification time', formatPngTime(chunk.data));
    } else if (chunk.type === 'eXIf') {
      readTiff(chunk.data, rows);
    } else if (chunk.type === 'iTXt' || chunk.type === 'zTXt') {
      const split = chunk.data.indexOf(0);
      push(
        rows,
        'png-text',
        split > 0 ? decodeText(chunk.data.subarray(0, split)) : chunk.type,
        chunk.type
      );
    }
  }
  return rows;
}

function formatPngTime(data: Uint8Array): string {
  if (data.length < 7) return '';
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const year = view.getUint16(0);
  const month = String(data[2]).padStart(2, '0');
  const day = String(data[3]).padStart(2, '0');
  const hour = String(data[4]).padStart(2, '0');
  const minute = String(data[5]).padStart(2, '0');
  const second = String(data[6]).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

type PngChunk = { type: string; data: Uint8Array; raw: Uint8Array };

function walkPng(bytes: Uint8Array): PngChunk[] | null {
  if (!PNG_SIG.every((byte, index) => bytes[index] === byte)) return null;
  const chunks: PngChunk[] = [];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const size =
      (bytes[i] << 24) |
      (bytes[i + 1] << 16) |
      (bytes[i + 2] << 8) |
      bytes[i + 3];
    if (size < 0 || i + 12 + size > bytes.length) return null;
    const type = ascii(bytes, i + 4, 4);
    const data = bytes.subarray(i + 8, i + 8 + size);
    const raw = bytes.subarray(i, i + 12 + size);
    chunks.push({ type, data, raw });
    i += 12 + size;
    if (type === 'IEND') return chunks;
  }
  return null;
}

function stripPng(
  bytes: Uint8Array
): { bytes: Uint8Array; changed: boolean } | null {
  const chunks = walkPng(bytes);
  if (!chunks) return null;
  const kept = chunks.filter((chunk) => !PNG_META.has(chunk.type));
  const changed = kept.length !== chunks.length;
  if (!changed) return { bytes, changed: false };
  return {
    bytes: concat([bytes.subarray(0, 8), ...kept.map((chunk) => chunk.raw)]),
    changed: true,
  };
}

function readWebp(bytes: Uint8Array): MetadataEntry[] | null {
  const chunks = walkWebp(bytes);
  if (!chunks) return null;
  const rows: MetadataEntry[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'EXIF') readTiff(chunk.data, rows);
    else if (chunk.type === 'XMP ') readXmp(decodeText(chunk.data), rows);
  }
  return rows;
}

type WebpChunk = { type: string; data: Uint8Array; raw: Uint8Array };

function walkWebp(bytes: Uint8Array): WebpChunk[] | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP')
    return null;
  const chunks: WebpChunk[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, 4);
    const size =
      bytes[i + 4] |
      (bytes[i + 5] << 8) |
      (bytes[i + 6] << 16) |
      (bytes[i + 7] << 24);
    const pad = size % 2;
    if (size < 0 || i + 8 + size + pad > bytes.length) return null;
    chunks.push({
      type,
      data: bytes.subarray(i + 8, i + 8 + size),
      raw: bytes.subarray(i, i + 8 + size + pad),
    });
    i += 8 + size + pad;
  }
  return chunks;
}

function stripWebp(
  bytes: Uint8Array
): { bytes: Uint8Array; changed: boolean } | null {
  const chunks = walkWebp(bytes);
  if (!chunks) return null;
  const drop = new Set(['EXIF', 'XMP ']);
  const kept = chunks.filter((chunk) => !drop.has(chunk.type));
  const changed = kept.length !== chunks.length;
  if (!changed) return { bytes, changed: false };
  const body = kept.map((chunk) => {
    if (chunk.type !== 'VP8X' || chunk.data.length < 1) return chunk.raw;
    const next = new Uint8Array(chunk.raw);
    next[8] = chunk.data[0] & ~(WEBP_EXIF | WEBP_XMP);
    return next;
  });
  const file = concat([bytes.subarray(0, 12), ...body]);
  const size = file.length - 8;
  file[4] = size & 0xff;
  file[5] = (size >> 8) & 0xff;
  file[6] = (size >> 16) & 0xff;
  file[7] = (size >> 24) & 0xff;
  return { bytes: file, changed: true };
}

function readGif(bytes: Uint8Array): MetadataEntry[] | null {
  const found = walkGif(bytes);
  if (!found) return null;
  const rows: MetadataEntry[] = [];
  for (const comment of found.comments)
    push(rows, 'comment', 'Comment', comment);
  if (found.xmp) push(rows, 'xmp', 'XMP', 'packet');
  return rows;
}

function walkGif(
  bytes: Uint8Array
): { comments: string[]; xmp: boolean; keep: Uint8Array[] } | null {
  const header = ascii(bytes, 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  if (bytes.length < 13) return null;
  const packed = bytes[10];
  let i = 13;
  if (packed & 0x80) {
    const colors = 3 * (1 << ((packed & 0x07) + 1));
    if (i + colors > bytes.length) return null;
    i += colors;
  }
  const keep: Uint8Array[] = [bytes.subarray(0, i)];
  const comments: string[] = [];
  let xmp = false;
  while (i < bytes.length) {
    const marker = bytes[i];
    if (marker === 0x3b) {
      keep.push(bytes.subarray(i, i + 1));
      return { comments, xmp, keep };
    }
    if (marker === 0x2c) {
      const start = i;
      i += 10;
      if (i > bytes.length) return null;
      if (bytes[i - 1] & 0x80) {
        const colors = 3 * (1 << ((bytes[i - 1] & 0x07) + 1));
        if (i + colors > bytes.length) return null;
        i += colors;
      }
      if (i >= bytes.length) return null;
      i++;
      const data = skipSubBlocks(bytes, i);
      if (data == null) return null;
      keep.push(bytes.subarray(start, data));
      i = data;
      continue;
    }
    if (marker === 0x21) {
      if (i + 1 >= bytes.length) return null;
      const label = bytes[i + 1];
      const start = i;
      i += 2;
      if (label === 0xfe || label === 0xff) {
        const end = skipSubBlocks(bytes, i);
        if (end == null) return null;
        if (label === 0xfe) {
          comments.push(readSubBlockText(bytes, i, end));
        } else if (ascii(bytes, i + 1, 8) === 'XMP Data') {
          xmp = true;
        } else {
          keep.push(bytes.subarray(start, end));
        }
        i = end;
        continue;
      }
      const end = skipSubBlocks(bytes, i);
      if (end == null) return null;
      keep.push(bytes.subarray(start, end));
      i = end;
      continue;
    }
    return null;
  }
  return null;
}

function readSubBlockText(
  bytes: Uint8Array,
  offset: number,
  end: number
): string {
  const parts: number[] = [];
  let i = offset;
  while (i < end) {
    const size = bytes[i];
    i++;
    if (size === 0) break;
    for (let n = 0; n < size && i < end; n++, i++) parts.push(bytes[i]);
  }
  return decodeText(Uint8Array.from(parts));
}

function skipSubBlocks(bytes: Uint8Array, offset: number): number | null {
  let i = offset;
  while (i < bytes.length) {
    const size = bytes[i];
    i++;
    if (size === 0) return i;
    if (i + size > bytes.length) return null;
    i += size;
  }
  return null;
}

function stripGif(
  bytes: Uint8Array
): { bytes: Uint8Array; changed: boolean } | null {
  const found = walkGif(bytes);
  if (!found) return null;
  const changed = found.comments.length > 0 || found.xmp;
  if (!changed) return { bytes, changed: false };
  return { bytes: concat(found.keep), changed: true };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return '';
  let text = '';
  for (let i = 0; i < length; i++)
    text += String.fromCharCode(bytes[offset + i]);
  return text;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/\u0000/g, '')
    .trim();
}

function cleanText(bytes: Uint8Array): string {
  return decodeText(bytes).replace(/\s+/g, ' ').trim();
}

function concat(parts: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
