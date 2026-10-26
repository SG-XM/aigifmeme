export type HomeDemoClip = {
  id: string;
  src: string;
  poster?: string;
  title: string;
};

type HomeDemoSource = {
  id: string;
  src: string;
  poster?: string;
  title: string;
  titleZh: string;
  titleAr: string;
  titleEs: string;
};

/**
 * Homepage hero clips: four Uptown Funk AI video examples.
 * Window Peeper and Burning Bridges keep their own constants.
 * Change these in a pull request. The admin Demo videos page is gone.
 * `home_demo_video` (migration 0014) is an unused leftover table.
 */
export const HOME_HERO_DEMOS: readonly HomeDemoSource[] = [
  {
    id: 'uptown-demo-ceo-hallelujah-v1',
    src: '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.mp4',
    poster: '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.jpg',
    title: 'CEO crew AI video example',
    titleZh: 'CEO 团队 AI 视频示例',
    titleAr: 'مثال فيديو AI لفريق الرئيس التنفيذي',
    titleEs: 'Ejemplo de video IA del equipo CEO',
  },
  {
    id: 'uptown-demo-ceo-dutch-v1',
    src: '/videos/showcase/home/uptown-demo-ceo-dutch-v1.mp4',
    poster: '/videos/showcase/home/uptown-demo-ceo-dutch-v1.jpg',
    title: 'Street dance AI video example',
    titleZh: '街舞 AI 视频示例',
    titleAr: 'مثال فيديو AI لرقص الشارع',
    titleEs: 'Ejemplo de video IA de baile callejero',
  },
  {
    id: 'uptown-demo-zhaobenshan-v1',
    src: '/videos/showcase/home/uptown-demo-zhaobenshan-v1.mp4',
    poster: '/videos/showcase/home/uptown-demo-zhaobenshan-v1.jpg',
    title: 'Ivory Mountain remake AI example',
    titleZh: '象牙山重制 AI 示例',
    titleAr: 'مثال إعادة إنتاج Ivory Mountain بالذكاء الاصطناعي',
    titleEs: 'Ejemplo de remake IA de Ivory Mountain',
  },
  {
    id: 'uptown-demo-ceo-justwatch-v1',
    src: '/videos/showcase/home/uptown-demo-ceo-justwatch-v1.mp4',
    poster: '/videos/showcase/home/uptown-demo-ceo-justwatch-v1.jpg',
    title: 'Just Watch AI video example',
    titleZh: 'Just Watch AI 视频示例',
    titleAr: 'مثال فيديو AI: Just Watch',
    titleEs: 'Ejemplo de video IA Just Watch',
  },
];

/** Live homepage has no gallery clips, so the examples section stays hidden. */
export const HOME_GALLERY_DEMOS: readonly HomeDemoSource[] = [];

/** Default title, with zh/ar/es overrides when those fields are filled in. */
export function homeDemoTitle(
  row: {
    title: string;
    titleZh?: string | null;
    titleAr?: string | null;
    titleEs?: string | null;
  },
  locale: string
): string {
  const localized =
    locale === 'zh'
      ? row.titleZh
      : locale === 'ar'
        ? row.titleAr
        : locale === 'es'
          ? row.titleEs
          : row.title;
  const value = localized?.trim();
  return value || row.title;
}

function toClip(row: HomeDemoSource, locale: string): HomeDemoClip {
  return {
    id: row.id,
    src: row.src,
    ...(row.poster ? { poster: row.poster } : {}),
    title: homeDemoTitle(row, locale),
  };
}

/** Clips for `/` and `/bulin-47-ai`. Other campaigns ignore this list. */
export function homeDemoClips(locale: string): {
  hero: HomeDemoClip[];
  gallery: HomeDemoClip[];
} {
  return {
    hero: HOME_HERO_DEMOS.map((row) => toClip(row, locale)),
    gallery: HOME_GALLERY_DEMOS.map((row) => toClip(row, locale)),
  };
}
