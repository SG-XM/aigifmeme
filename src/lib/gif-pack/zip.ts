function dosTime(date: Date) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored ZIP. GIF bytes are already compressed, so this stays valid without a deflate library. */
export function zipStored(
  files: { name: string; bytes: Uint8Array }[],
  now = new Date()
): Uint8Array {
  const { time, day } = dosTime(now);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, time, true);
    view.setUint16(10, day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.bytes.length, true);
    view.setUint32(22, file.bytes.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, file.bytes);
    const entry = new Uint8Array(46 + name.length);
    const centralView = new DataView(entry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, day, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.bytes.length, true);
    centralView.setUint32(24, file.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length + file.bytes.length;
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function unzipStored(
  bytes: Uint8Array
): { name: string; bytes: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('ZIP directory is missing');
  const count = view.getUint16(end + 10, true);
  let central = view.getUint32(end + 16, true);
  const files: { name: string; bytes: Uint8Array }[] = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(central, true) !== 0x02014b50)
      throw new Error('ZIP entry is invalid');
    const method = view.getUint16(central + 10, true);
    const size = view.getUint32(central + 20, true);
    const nameLength = view.getUint16(central + 28, true);
    const extra = view.getUint16(central + 30, true);
    const comment = view.getUint16(central + 32, true);
    const local = view.getUint32(central + 42, true);
    const name = decoder.decode(
      bytes.subarray(central + 46, central + 46 + nameLength)
    );
    if (method !== 0) throw new Error(`ZIP entry ${name} is compressed`);
    const nameAtLocal = view.getUint16(local + 26, true);
    const extraAtLocal = view.getUint16(local + 28, true);
    const start = local + 30 + nameAtLocal + extraAtLocal;
    files.push({ name, bytes: bytes.slice(start, start + size) });
    central += 46 + nameLength + extra + comment;
  }
  return files;
}
