import { SOLO_DEMO } from '@/lib/bulin-reference';

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
 * Homepage hero clips, copied from the live uptownfunkai.video loader.
 * Window Peeper and Burning Bridges keep their own constants.
 * Change these in a pull request. The admin Demo videos page is gone.
 * `home_demo_video` (migration 0014) is an unused leftover table.
 */
export const HOME_HERO_DEMOS: readonly HomeDemoSource[] = [
  {
    id: 'retention-werewolf-dance-v1',
    src: SOLO_DEMO.src,
    poster: SOLO_DEMO.poster,
    title: 'Werewolf dance example',
    titleZh: '狼人舞蹈示例',
    titleAr: 'مثال رقص المستذئب',
    titleEs: 'Ejemplo de baile del hombre lobo',
  },
  {
    id: 'seed-hero-1',
    src: '/videos/showcase/home/7693717519374224672.mp4',
    title: 'Freestyle example 1',
    titleZh: 'Freestyle 示例 1',
    titleAr: 'مثال حر 1',
    titleEs: 'Ejemplo de freestyle 1',
  },
  {
    id: 'seed-hero-2',
    src: '/videos/showcase/home/7693726580874464545.mp4',
    title: 'Freestyle example 2',
    titleZh: 'Freestyle 示例 2',
    titleAr: 'مثال حر 2',
    titleEs: 'Ejemplo de freestyle 2',
  },
  {
    id: 'seed-hero-3',
    src: '/videos/showcase/home/7693727814683462944.mp4',
    title: 'Freestyle example 3',
    titleZh: 'Freestyle 示例 3',
    titleAr: 'مثال حر 3',
    titleEs: 'Ejemplo de freestyle 3',
  },
  {
    id: 'seed-hero-4',
    src: '/videos/showcase/home/bulin-trio-hero-original-v1.mp4',
    poster: '/videos/showcase/home/bulin-trio-hero-original-v1.jpg',
    title: 'Dame Hombro trio — the original',
    titleZh: 'Dame Hombro 三人原版',
    titleAr: 'ثلاثي Dame Hombro — الأصل',
    titleEs: 'Trío Dame Hombro — el original',
  },
  {
    id: 'seed-hero-5',
    src: '/videos/showcase/home/bulin-trio-hero-second-v1.mp4',
    poster: '/videos/showcase/home/bulin-trio-hero-second-v1.jpg',
    title: 'Dame Hombro trio — street take',
    titleZh: 'Dame Hombro 三人街头版',
    titleAr: 'ثلاثي Dame Hombro — نسخة الشارع',
    titleEs: 'Trío Dame Hombro — versión calle',
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
