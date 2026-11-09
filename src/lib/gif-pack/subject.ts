import {
  cropRaster,
  decodeRaster,
  encodeRasterPng,
  ImageDecodeError,
  lumaStddev,
  type Raster,
} from '@/lib/gif-pack/raster';

export type SubjectOk = { ok: true; raster: Raster; png: Uint8Array };
export type SubjectFail = {
  ok: false;
  code:
    | 'image_unsupported'
    | 'image_undecodable'
    | 'image_too_small'
    | 'subject_not_found'
    | 'subject_ambiguous';
  message: string;
};
export type SubjectResult = SubjectOk | SubjectFail;

const REPLACE =
  'Replace the image. No single main subject could be selected, and there is no manual crop.';

export function inspectSubject(
  bytes: Uint8Array,
  mime?: string
): SubjectResult {
  let raster: Raster;
  try {
    raster = decodeRaster(bytes, mime);
  } catch (error) {
    if (error instanceof ImageDecodeError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return {
      ok: false,
      code: 'image_undecodable',
      message:
        'This image could not be read. Replace it with a PNG, JPEG, or GIF.',
    };
  }
  if (raster.width < 64 || raster.height < 64) {
    return {
      ok: false,
      code: 'image_too_small',
      message:
        'This image is too small. Replace it with one at least 64 pixels on each side.',
    };
  }
  if (lumaStddev(raster) < 8) {
    return { ok: false, code: 'subject_not_found', message: REPLACE };
  }
  const analysis = downscale(raster, 160);
  const mask = foregroundMask(analysis);
  const components = componentsOf(mask, analysis.width, analysis.height);
  if (!components.length) {
    return { ok: false, code: 'subject_not_found', message: REPLACE };
  }
  components.sort((a, b) => b.area - a.area);
  const main = components[0];
  const pixels = analysis.width * analysis.height;
  if (main.area / pixels < 0.015) {
    return { ok: false, code: 'subject_not_found', message: REPLACE };
  }
  const second = components[1];
  if (second && second.area > main.area * 0.45) {
    const dist = Math.hypot(main.cx - second.cx, main.cy - second.cy);
    if (dist > Math.hypot(analysis.width, analysis.height) * 0.28) {
      return {
        ok: false,
        code: 'subject_ambiguous',
        message:
          'More than one main subject was found. Replace the image with a single subject.',
      };
    }
  }
  const scaleX = raster.width / analysis.width;
  const scaleY = raster.height / analysis.height;
  const cropped =
    main.area / pixels >= 0.92
      ? raster
      : cropRaster(
          raster,
          {
            x: Math.floor(main.minX * scaleX),
            y: Math.floor(main.minY * scaleY),
            width: Math.max(1, Math.ceil((main.maxX - main.minX + 1) * scaleX)),
            height: Math.max(
              1,
              Math.ceil((main.maxY - main.minY + 1) * scaleY)
            ),
          },
          0.08
        );
  return { ok: true, raster: cropped, png: encodeRasterPng(cropped) };
}

export function isFlatImage(bytes: Uint8Array): boolean {
  try {
    return lumaStddev(decodeRaster(bytes, 'image/png')) < 6;
  } catch {
    return false;
  }
}

function downscale(raster: Raster, maxSide: number): Raster {
  const scale = Math.min(1, maxSide / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(
      raster.height - 1,
      Math.floor((y * raster.height) / height)
    );
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(
        raster.width - 1,
        Math.floor((x * raster.width) / width)
      );
      const src = (sy * raster.width + sx) * 4;
      const dst = (y * width + x) * 4;
      rgba.set(raster.rgba.subarray(src, src + 4), dst);
    }
  }
  return { width, height, rgba };
}

function foregroundMask(raster: Raster): Uint8Array {
  const count = raster.width * raster.height;
  const mask = new Uint8Array(count);
  let low = 0;
  let high = 0;
  for (let i = 3; i < raster.rgba.length; i += 4) {
    if (raster.rgba[i] < 16) low += 1;
    if (raster.rgba[i] > 200) high += 1;
  }
  if (low > count * 0.02 && high > count * 0.02) {
    for (let i = 0; i < count; i += 1)
      mask[i] = raster.rgba[i * 4 + 3] > 128 ? 1 : 0;
    return mask;
  }
  const border = borderColor(raster);
  const background = new Uint8Array(count);
  const queue: number[] = [];
  const push = (index: number) => {
    if (background[index] || !near(raster, index, border)) return;
    background[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < raster.width; x += 1) {
    push(x);
    push((raster.height - 1) * raster.width + x);
  }
  for (let y = 0; y < raster.height; y += 1) {
    push(y * raster.width);
    push(y * raster.width + raster.width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % raster.width;
    const y = Math.floor(index / raster.width);
    if (x > 0) push(index - 1);
    if (x + 1 < raster.width) push(index + 1);
    if (y > 0) push(index - raster.width);
    if (y + 1 < raster.height) push(index + raster.width);
  }
  let foreground = 0;
  for (let i = 0; i < count; i += 1) {
    mask[i] = background[i] ? 0 : 1;
    foreground += mask[i];
  }
  if (foreground > count * 0.92) mask.fill(1);
  return mask;
}

function borderColor(raster: Raster): [number, number, number] {
  const samples: number[] = [];
  const take = (x: number, y: number) => {
    const o = (y * raster.width + x) * 4;
    samples.push(raster.rgba[o], raster.rgba[o + 1], raster.rgba[o + 2]);
  };
  for (let x = 0; x < raster.width; x += 2) {
    take(x, 0);
    take(x, raster.height - 1);
  }
  for (let y = 0; y < raster.height; y += 2) {
    take(0, y);
    take(raster.width - 1, y);
  }
  const mid = (channel: number) => {
    const values = [];
    for (let i = channel; i < samples.length; i += 3) values.push(samples[i]);
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  return [mid(0), mid(1), mid(2)];
}

function near(raster: Raster, index: number, color: [number, number, number]) {
  const o = index * 4;
  const dr = raster.rgba[o] - color[0];
  const dg = raster.rgba[o + 1] - color[1];
  const db = raster.rgba[o + 2] - color[2];
  return dr * dr + dg * dg + db * db < 36 * 36;
}

type Component = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
};

function componentsOf(
  mask: Uint8Array,
  width: number,
  height: number
): Component[] {
  const seen = new Uint8Array(mask.length);
  const found: Component[] = [];
  const queue: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    queue.length = 0;
    queue.push(start);
    seen[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[index - 1] && !seen[index - 1]) {
        seen[index - 1] = 1;
        queue.push(index - 1);
      }
      if (x + 1 < width && mask[index + 1] && !seen[index + 1]) {
        seen[index + 1] = 1;
        queue.push(index + 1);
      }
      if (y > 0 && mask[index - width] && !seen[index - width]) {
        seen[index - width] = 1;
        queue.push(index - width);
      }
      if (y + 1 < height && mask[index + width] && !seen[index + width]) {
        seen[index + width] = 1;
        queue.push(index + width);
      }
    }
    if (area < 12) continue;
    found.push({
      area,
      minX,
      minY,
      maxX,
      maxY,
      cx: sumX / area,
      cy: sumY / area,
    });
  }
  return found;
}
