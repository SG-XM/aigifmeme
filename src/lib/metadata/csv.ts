import {
  entry,
  withRemovable,
  type InspectResult,
  type MetadataEntry,
} from './types';

function bomKind(bytes: Uint8Array): 'utf8' | 'utf16le' | 'utf16be' | 'none' {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return 'utf8';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return 'utf16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return 'utf16be';
  return 'none';
}

function sepLineLength(bytes: Uint8Array, start: number): number {
  const rest = bytes.subarray(start, Math.min(bytes.length, start + 16));
  let text = '';
  for (const byte of rest) {
    if (byte === 10 || byte === 13) break;
    if (byte > 0x7e || byte < 0x20) return 0;
    text += String.fromCharCode(byte);
  }
  if (!/^sep=.$/i.test(text)) return 0;
  let end = start + text.length;
  if (bytes[end] === 13) end += 1;
  if (bytes[end] === 10) end += 1;
  return end - start;
}

export function inspectCsv(bytes: Uint8Array): InspectResult {
  const entries: MetadataEntry[] = [];
  const bom = bomKind(bytes);
  const start = bom === 'utf8' ? 3 : bom === 'none' ? 0 : 2;
  if (bom === 'utf8') {
    const row = entry('csv', 'bom', 'UTF-8 BOM', 'EF BB BF');
    if (row) entries.push(row);
  }
  if (sepLineLength(bytes, start) > 0) {
    const line = new TextDecoder('latin1').decode(
      bytes.subarray(start, start + 5)
    );
    const row = entry('csv', 'separator', 'Excel separator', line.trim());
    if (row) entries.push(row);
  }
  return withRemovable('csv', entries);
}

export function stripCsv(bytes: Uint8Array): {
  bytes: Uint8Array;
  changed: boolean;
} {
  const bom = bomKind(bytes);
  let start = 0;
  if (bom === 'utf8') start = 3;
  const sep = sepLineLength(bytes, start);
  if (start === 0 && sep === 0) return { bytes, changed: false };
  return { bytes: bytes.subarray(start + sep), changed: true };
}
