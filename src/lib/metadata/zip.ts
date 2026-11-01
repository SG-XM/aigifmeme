const MAX_ENTRIES = 10_000;
const MAX_UNCOMPRESSED = 64 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      const comment = u16(bytes, i + 20);
      if (i + 22 + comment === bytes.length) return i;
    }
  }
  throw new Error('zip');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('zip');
  }
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const write = writer.write(new Uint8Array(data)).then(() => writer.close());
  const read = (async () => {
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > MAX_UNCOMPRESSED) throw new Error('zip');
      chunks.push(step.value);
    }
  })();
  await Promise.all([write, read]);
  return concat(chunks);
}

function zip64Sizes(
  extra: Uint8Array,
  compressed: number,
  uncompressed: number,
  offset: number
): { compressed: number; uncompressed: number; offset: number } {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = u16(extra, cursor);
    const size = u16(extra, cursor + 2);
    const start = cursor + 4;
    const end = start + size;
    if (end > extra.length) break;
    if (id === 0x0001) {
      let pos = start;
      const take = () => {
        if (pos + 8 > end) return undefined;
        const view = new DataView(extra.buffer, extra.byteOffset + pos, 8);
        pos += 8;
        return Number(view.getBigUint64(0, true));
      };
      const nextUncompressed =
        uncompressed === 0xffffffff ? take() : uncompressed;
      const nextCompressed = compressed === 0xffffffff ? take() : compressed;
      const nextOffset = offset === 0xffffffff ? take() : offset;
      if (
        nextUncompressed === undefined ||
        nextCompressed === undefined ||
        nextOffset === undefined
      ) {
        throw new Error('zip');
      }
      return {
        compressed: nextCompressed,
        uncompressed: nextUncompressed,
        offset: nextOffset,
      };
    }
    cursor = end;
  }
  throw new Error('zip');
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const eocd = findEocd(bytes);
  const count = u16(bytes, eocd + 10);
  let cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('zip');
  if (count > MAX_ENTRIES) throw new Error('zip');

  const entries: ZipEntry[] = [];
  let total = 0;
  let cursor = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new Error('zip');
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const crc = u32(bytes, cursor + 16);
    let compressed = u32(bytes, cursor + 20);
    let uncompressed = u32(bytes, cursor + 24);
    const nameLen = u16(bytes, cursor + 28);
    const extraLen = u16(bytes, cursor + 30);
    const commentLen = u16(bytes, cursor + 32);
    let localOffset = u32(bytes, cursor + 42);
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLen);
    const extra = bytes.subarray(
      cursor + 46 + nameLen,
      cursor + 46 + nameLen + extraLen
    );
    if (
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      const sizes = zip64Sizes(extra, compressed, uncompressed, localOffset);
      compressed = sizes.compressed;
      uncompressed = sizes.uncompressed;
      localOffset = sizes.offset;
    }
    if (flags & 0x1) throw new Error('zip');
    if (uncompressed > MAX_UNCOMPRESSED) throw new Error('zip');
    const name = new TextDecoder('utf-8').decode(nameBytes).replace(/^\/+/, '');
    if (u32(bytes, localOffset) !== 0x04034b50) throw new Error('zip');
    const localName = u16(bytes, localOffset + 26);
    const localExtra = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localName + localExtra;
    const payload = bytes.subarray(dataStart, dataStart + compressed);
    let data: Uint8Array;
    if (method === 0) data = new Uint8Array(payload);
    else if (method === 8) data = await inflateRaw(payload);
    else throw new Error('zip');
    if (data.length !== uncompressed && uncompressed !== 0) {
      // Some writers leave uncompressed size 0 until the data descriptor.
      if (uncompressed !== 0) throw new Error('zip');
    }
    if (crc32(data) !== crc && crc !== 0) throw new Error('zip');
    total += data.length;
    if (total > MAX_TOTAL) throw new Error('zip');
    if (!name.endsWith('/')) entries.push({ name, data });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function pushU16(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function pushU32(out: number[], value: number) {
  out.push(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff
  );
}

/** Stored ZIP. Office opens this; sizes stay exact. */
export function writeZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const local: number[] = [];
    pushU32(local, 0x04034b50);
    pushU16(local, 20);
    pushU16(local, 0x800);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU32(local, crc);
    pushU32(local, entry.data.length);
    pushU32(local, entry.data.length);
    pushU16(local, name.length);
    pushU16(local, 0);
    const header = new Uint8Array(local);
    locals.push(header, name, entry.data);
    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, 0x800);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, crc);
    pushU32(central, entry.data.length);
    pushU32(central, entry.data.length);
    pushU16(central, name.length);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0);
    pushU32(central, offset);
    central.push(...name);
    offset += header.length + name.length + entry.data.length;
  }
  const cd = new Uint8Array(central);
  const eocd: number[] = [];
  pushU32(eocd, 0x06054b50);
  pushU16(eocd, 0);
  pushU16(eocd, 0);
  pushU16(eocd, entries.length);
  pushU16(eocd, entries.length);
  pushU32(eocd, cd.length);
  pushU32(eocd, offset);
  pushU16(eocd, 0);
  return concat([...locals, cd, new Uint8Array(eocd)]);
}
