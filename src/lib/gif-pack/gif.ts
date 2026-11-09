import type { Raster } from '@/lib/gif-pack/raster';

type GifApi = {
  GIFEncoder: (opts?: { initialCapacity?: number }) => {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        repeat?: number;
        dispose?: number;
      }
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  quantize: (rgba: Uint8Array, maxColors: number) => number[][];
};

async function gifApi(): Promise<GifApi> {
  const loaded = (await import('gifenc')) as GifApi & { default?: GifApi };
  return loaded.default?.GIFEncoder ? loaded.default : loaded;
}

export async function encodeAnimatedGif(
  frames: Raster[],
  delayMs: number,
  transparent: boolean
): Promise<Uint8Array> {
  if (frames.length < 2)
    throw new Error('A sticker GIF needs at least two frames');
  const { width, height } = frames[0];
  if (
    frames.some((frame) => frame.width !== width || frame.height !== height)
  ) {
    throw new Error('GIF frames must share one size');
  }
  const { GIFEncoder, quantize } = await gifApi();
  const opaque = new Uint8Array(
    frames.reduce((sum, frame) => sum + opaqueCount(frame) * 4, 0)
  );
  let cursor = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.rgba.length; i += 4) {
      if (!transparent || frame.rgba[i + 3] >= 128) {
        opaque.set(frame.rgba.subarray(i, i + 4), cursor);
        cursor += 4;
      }
    }
  }
  const sample = opaque.subarray(0, Math.max(4, cursor));
  const colors = quantize(sample, 255).slice(0, 255);
  const palette = transparent
    ? [[0, 0, 0], ...colors]
    : colors.length
      ? colors
      : [[0, 0, 0]];
  const gif = GIFEncoder({ initialCapacity: width * height * frames.length });
  frames.forEach((frame, frameIndex) => {
    gif.writeFrame(indexFrame(frame, palette, transparent), width, height, {
      palette: frameIndex === 0 ? palette : undefined,
      delay: delayMs,
      transparent,
      transparentIndex: 0,
      repeat: 0,
      dispose: transparent ? 2 : 1,
    });
  });
  gif.finish();
  const bytes = gif.bytes();
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
    throw new Error('GIF encoder did not write a GIF header');
  }
  return bytes;
}

function opaqueCount(frame: Raster) {
  let count = 0;
  for (let i = 3; i < frame.rgba.length; i += 4)
    if (frame.rgba[i] >= 128) count += 1;
  return count;
}

function indexFrame(frame: Raster, palette: number[][], transparent: boolean) {
  const count = frame.width * frame.height;
  const index = new Uint8Array(count);
  const cache = new Map<number, number>();
  const start = transparent ? 1 : 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    const o = pixel * 4;
    if (transparent && frame.rgba[o + 3] < 128) {
      index[pixel] = 0;
      continue;
    }
    const key =
      ((frame.rgba[o] >> 3) << 10) |
      ((frame.rgba[o + 1] >> 3) << 5) |
      (frame.rgba[o + 2] >> 3);
    let found = cache.get(key);
    if (found === undefined) {
      let best = start;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let color = start; color < palette.length; color += 1) {
        const dr = frame.rgba[o] - palette[color][0];
        const dg = frame.rgba[o + 1] - palette[color][1];
        const db = frame.rgba[o + 2] - palette[color][2];
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = color;
        }
      }
      found = best;
      cache.set(key, best);
    }
    index[pixel] = found;
  }
  return index;
}

export function motionDelayMs(motion: 'medium' | 'large' | 'fast') {
  if (motion === 'large') return 140;
  if (motion === 'fast') return 80;
  return 120;
}
