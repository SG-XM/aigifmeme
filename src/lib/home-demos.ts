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
 * Homepage sticker frames. These are drawn placeholders for the AI meme
 * examples, not parent-campaign videos.
 */
export const HOME_HERO_DEMOS: readonly HomeDemoSource[] = [
  {
    id: 'reaction-sticker',
    src: '/images/stickers/reaction-sticker.png',
    poster: '/images/stickers/reaction-sticker.png',
    title: 'Reaction sticker',
    titleZh: '反应贴纸',
    titleAr: 'ملصق رد فعل',
    titleEs: 'Sticker de reacción',
  },
  {
    id: 'caption-loop',
    src: '/images/stickers/caption-loop.gif',
    poster: '/images/stickers/caption-loop.png',
    title: 'Caption GIF loop',
    titleZh: '字幕 GIF 循环',
    titleAr: 'حلقة GIF مع تعليق',
    titleEs: 'GIF con texto en bucle',
  },
  {
    id: 'pet-meme',
    src: '/images/stickers/pet-meme.png',
    poster: '/images/stickers/pet-meme.png',
    title: 'Pet meme sticker',
    titleZh: '宠物梗图贴纸',
    titleAr: 'ملصق ميم لحيوان',
    titleEs: 'Sticker de meme con mascota',
  },
  {
    id: 'poster-sticker',
    src: '/images/stickers/poster-sticker.png',
    poster: '/images/stickers/poster-sticker.png',
    title: 'Poster sticker',
    titleZh: '海报贴纸',
    titleAr: 'ملصق بوستر',
    titleEs: 'Sticker tipo póster',
  },
];

/** The homepage shows the sticker row above. There is no separate video gallery. */
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

/** Sticker and GIF frames for the AIGifMeme homepage. */
export function homeDemoClips(locale: string): {
  hero: HomeDemoClip[];
  gallery: HomeDemoClip[];
} {
  return {
    hero: HOME_HERO_DEMOS.map((row) => toClip(row, locale)),
    gallery: HOME_GALLERY_DEMOS.map((row) => toClip(row, locale)),
  };
}
