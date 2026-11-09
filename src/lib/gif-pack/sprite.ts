import {
  compositeOnColor,
  resizeRaster,
  type Raster,
} from '@/lib/gif-pack/raster';

/**
 * Integer cut points for one axis. 1254 / 4 is 313.5, so cells differ by a pixel.
 * The first edge is 0 and the last is `size`, with no gaps and no dropped pixels.
 */
export function gridEdges(size: number, parts: number): number[] {
  if (
    !Number.isInteger(size) ||
    size < parts ||
    !Number.isInteger(parts) ||
    parts < 1
  ) {
    throw new Error('Sprite grid produced an empty cell');
  }
  const edges = [0];
  for (let index = 1; index < parts; index += 1) {
    edges.push(Math.round((index * size) / parts));
  }
  edges.push(size);
  for (let index = 1; index < edges.length; index += 1) {
    if (edges[index] <= edges[index - 1]) {
      throw new Error('Sprite grid produced an empty cell');
    }
  }
  return edges;
}

export function sliceSheet(sheet: Raster, grid = 4): Raster[] {
  const ratio =
    Math.max(sheet.width, sheet.height) / Math.min(sheet.width, sheet.height);
  if (!Number.isFinite(ratio) || ratio > 1.25) {
    throw new Error('Sprite sheet is not a square grid');
  }
  const xs = gridEdges(sheet.width, grid);
  const ys = gridEdges(sheet.height, grid);
  const frames: Raster[] = [];
  for (let row = 0; row < grid; row += 1) {
    const y0 = ys[row];
    const y1 = ys[row + 1];
    for (let column = 0; column < grid; column += 1) {
      const x0 = xs[column];
      const x1 = xs[column + 1];
      const cellW = x1 - x0;
      const cellH = y1 - y0;
      if (cellW < 2 || cellH < 2)
        throw new Error('Sprite sheet frame is too small');
      const rgba = new Uint8Array(cellW * cellH * 4);
      for (let y = 0; y < cellH; y += 1) {
        const src = ((y0 + y) * sheet.width + x0) * 4;
        rgba.set(sheet.rgba.subarray(src, src + cellW * 4), y * cellW * 4);
      }
      frames.push({ width: cellW, height: cellH, rgba });
    }
  }
  const covered = frames.reduce(
    (sum, frame) => sum + frame.width * frame.height,
    0
  );
  if (covered !== sheet.width * sheet.height || frames.length !== grid * grid) {
    throw new Error('Sprite grid did not cover the sheet');
  }
  return frames;
}

export function prepareFrames(
  frames: Raster[],
  outputSize: number,
  background: 'transparent' | 'theme',
  themeColor: string
): Raster[] {
  const keyed = frames.map((frame) =>
    background === 'theme'
      ? compositeOnColor(frame, themeColor)
      : keyBackground(frame)
  );
  const resized = keyed.map((frame) => resizeRaster(frame, outputSize));
  return alignFrames(resized, background === 'transparent');
}

function keyBackground(frame: Raster): Raster {
  let transparent = 0;
  let opaque = 0;
  for (let i = 3; i < frame.rgba.length; i += 4) {
    if (frame.rgba[i] < 16) transparent += 1;
    else opaque += 1;
  }
  if (transparent > frame.width * 2 && opaque > frame.width * 2) return frame;
  const color = cornerColor(frame);
  const rgba = new Uint8Array(frame.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const dr = rgba[i] - color[0];
    const dg = rgba[i + 1] - color[1];
    const db = rgba[i + 2] - color[2];
    if (dr * dr + dg * dg + db * db < 48 * 48) rgba[i + 3] = 0;
  }
  return { width: frame.width, height: frame.height, rgba };
}

function cornerColor(frame: Raster): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const take = (x: number, y: number) => {
    const o = (y * frame.width + x) * 4;
    r += frame.rgba[o];
    g += frame.rgba[o + 1];
    b += frame.rgba[o + 2];
    n += 1;
  };
  const m = Math.max(1, Math.min(4, Math.floor(frame.width / 16)));
  for (let y = 0; y < m; y += 1) {
    for (let x = 0; x < m; x += 1) {
      take(x, y);
      take(frame.width - 1 - x, y);
      take(x, frame.height - 1 - y);
      take(frame.width - 1 - x, frame.height - 1 - y);
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function alignFrames(frames: Raster[], transparent: boolean): Raster[] {
  const centers = frames.map((frame) => centroid(frame));
  const xs = centers.map((center) => center.x).sort((a, b) => a - b);
  const ys = centers.map((center) => center.y).sort((a, b) => a - b);
  const targetX = xs[Math.floor(xs.length / 2)] ?? frames[0].width / 2;
  const targetY = ys[Math.floor(ys.length / 2)] ?? frames[0].height / 2;
  return frames.map((frame, index) => {
    const dx = Math.round(targetX - centers[index].x);
    const dy = Math.round(targetY - centers[index].y);
    if (!dx && !dy) return frame;
    const rgba = new Uint8Array(frame.rgba.length);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const sx = x - dx;
        const sy = y - dy;
        const dst = (y * frame.width + x) * 4;
        if (sx < 0 || sy < 0 || sx >= frame.width || sy >= frame.height) {
          rgba[dst + 3] = transparent ? 0 : 255;
          continue;
        }
        rgba.set(
          frame.rgba.subarray(
            (sy * frame.width + sx) * 4,
            (sy * frame.width + sx) * 4 + 4
          ),
          dst
        );
      }
    }
    return { width: frame.width, height: frame.height, rgba };
  });
}

function centroid(frame: Raster) {
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.rgba[(y * frame.width + x) * 4 + 3] < 128) continue;
      sumX += x;
      sumY += y;
      n += 1;
    }
  }
  if (!n) return { x: frame.width / 2, y: frame.height / 2 };
  return { x: sumX / n, y: sumY / n };
}
