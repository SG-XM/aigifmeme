/**
 * Sample frames for the I'm so sorry photo trend carousel.
 *
 * Five 1080×1440 JPEGs ship under `public/images/im-so-sorry/`. They are
 * examples made with this product (a Halloween costume set). The page always
 * uses these files. There is no admin URL override.
 *
 * 1. `01-dream.jpg` — first frame, dream version
 * 2. `02-wig.jpg` — wig confession
 * 3. `03-costume.jpg` — costume confession
 * 4. `04-party.jpg` — party confession
 * 5. `05-original.jpg` — the original photo with NO caption drawn in the file.
 *    The page paints the closing line in the burned-caption style.
 */
export const SORRY_DEMO_STATIC_PATHS = [
  '/images/im-so-sorry/01-dream.jpg',
  '/images/im-so-sorry/02-wig.jpg',
  '/images/im-so-sorry/03-costume.jpg',
  '/images/im-so-sorry/04-party.jpg',
  '/images/im-so-sorry/05-original.jpg',
] as const;

export const SORRY_DEMO_COUNT = SORRY_DEMO_STATIC_PATHS.length;

export function sorryDemoSources(): string[] {
  return [...SORRY_DEMO_STATIC_PATHS];
}
