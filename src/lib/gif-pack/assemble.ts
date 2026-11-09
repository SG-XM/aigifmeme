import { encodeAnimatedGif, motionDelayMs } from '@/lib/gif-pack/gif';
import {
  GIF_PACK_FRAME_COUNT,
  GIF_PACK_OUTPUT_SIZE,
} from '@/lib/gif-pack/options';
import { decodeRaster, type Raster } from '@/lib/gif-pack/raster';
import { prepareFrames, sliceSheet } from '@/lib/gif-pack/sprite';
import { overlayCaption } from '@/lib/gif-pack/text';

export async function assembleStickerGif(input: {
  sheetPng: Uint8Array;
  caption: string;
  language: 'zh' | 'en';
  background: 'transparent' | 'theme';
  themeColor: string;
  motion: 'medium' | 'large' | 'fast';
  outputSize?: number;
}): Promise<Uint8Array> {
  const sheet = decodeRaster(input.sheetPng, 'image/png');
  const cells = sliceSheet(sheet);
  if (cells.length !== GIF_PACK_FRAME_COUNT) {
    throw new Error('Sprite sheet did not produce 16 frames');
  }
  const frames = prepareFrames(
    cells,
    input.outputSize ?? GIF_PACK_OUTPUT_SIZE,
    input.background,
    input.themeColor
  ).map((frame) => overlayCaption(frame, input.caption, input.language));
  assertFrameVariation(frames);
  return encodeAnimatedGif(
    frames,
    motionDelayMs(input.motion),
    input.background === 'transparent'
  );
}

function assertFrameVariation(frames: Raster[]) {
  const first = frames[0].rgba;
  const mid = frames[Math.floor(frames.length / 2)].rgba;
  let diff = 0;
  const step = Math.max(4, Math.floor(first.length / 4000));
  for (let i = 0; i < first.length; i += step) {
    diff += Math.abs(first[i] - mid[i]);
  }
  if (diff === 0) {
    throw new Error(
      'Sprite sheet frames do not move. The sheet was not turned into a shaken still.'
    );
  }
}
