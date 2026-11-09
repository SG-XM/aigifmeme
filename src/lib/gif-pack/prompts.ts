import type {
  GifPackBackground,
  GifPackMotion,
  GifPackStyle,
} from '@/lib/gif-pack/options';

const STYLES: Record<GifPackStyle, string> = {
  original:
    'Keep the subject’s original colors, proportions, clothing, and medium. Do not redraw it as a different style.',
  'q-cartoon':
    'Redraw the subject as a cute Q-version cartoon, about two heads tall, with clean dark outlines and flat color.',
  anime:
    'Redraw the subject as a Japanese anime character with crisp line art and cel color.',
  'cute-3d':
    'Redraw the subject as a cute rounded 3D character with soft studio light and simple materials.',
  doodle:
    'Redraw the subject as a hand-drawn doodle with slightly uneven ink lines and paper-flat color.',
  pixel:
    'Redraw the subject as readable pixel art with chunky pixels and a limited palette.',
  clay: 'Redraw the subject as a clay sculpture with soft fingerprints and rounded limbs.',
  felt: 'Redraw the subject as a felt toy with stitched edges and soft fabric color.',
};

const MOTIONS: Record<GifPackMotion, string> = {
  medium:
    'Use a medium amount of body and face motion, one clear beat, and return to the opening pose.',
  large:
    'Use larger poses and a bigger travel distance, while keeping the whole subject inside every cell.',
  fast: 'Use quicker pose changes across the 16 frames. Complex motion quality is not guaranteed.',
};

export function anchorPrompt(
  style: GifPackStyle,
  background: GifPackBackground,
  themeColor: string
) {
  return [
    'Identify the single main person, animal, or character in the reference image.',
    'Draw only that subject, full body, centered, facing forward, with a margin inside the frame.',
    STYLES[style],
    background === 'transparent'
      ? 'Place the subject on a completely flat #FF00FF background with no floor, shadow, scenery, or text.'
      : `Place the subject on a completely flat ${themeColor} background with no scenery or text.`,
    'If the reference has no single clear main subject, output a completely flat #FF00FF image and nothing else.',
    'No letters, watermark, border, or extra character.',
  ].join(' ');
}

export function sheetPrompt(
  style: GifPackStyle,
  motion: GifPackMotion,
  background: GifPackBackground,
  themeColor: string,
  intent: string
) {
  return [
    `Use the character in the reference exactly: same face, body, colors, clothing, and ${style} style.`,
    'Do not invent a new character or restyle it.',
    'Draw one 4 by 4 animation sprite sheet with 16 equal square cells, read left to right, top to bottom.',
    'No grid lines, numbers, borders, motion blur, or text.',
    'Keep the character the same size and grounded in the same place in every cell, fully inside the cell with margin.',
    'The last frame must lead back to the first.',
    MOTIONS[motion],
    background === 'transparent'
      ? 'Every cell has a completely flat #FF00FF background.'
      : `Every cell has a completely flat ${themeColor} background.`,
    `Action: ${intent}`,
  ].join(' ');
}
