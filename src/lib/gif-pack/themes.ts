export type ThemeMotionSeed = {
  intent: string;
  captionEn: string;
  captionZh: string;
};

export type ThemeSeed = {
  slug: string;
  nameEn: string;
  nameZh: string;
  backgroundColor: string;
  motions: ThemeMotionSeed[];
};

/** Fixed pack copy. These are product defaults, not a runnable upstream prompt template. */
export const DEFAULT_GIF_PACK_THEMES: ThemeSeed[] = [
  {
    slug: 'daily-reply',
    nameEn: 'Daily replies',
    nameZh: '日常回话',
    backgroundColor: '#FFF4D8',
    motions: [
      {
        intent: 'nods twice and gives a small thumbs up, then returns upright',
        captionEn: 'Got it',
        captionZh: '收到',
      },
      {
        intent: 'does a short polite bow and pops back up smiling',
        captionEn: 'Okay',
        captionZh: '好的',
      },
      {
        intent: 'raises one finger, glances aside, then looks back',
        captionEn: 'Wait',
        captionZh: '稍等',
      },
      {
        intent: 'crosses both arms and shakes its head, then uncrosses',
        captionEn: 'Nope',
        captionZh: '不行',
      },
      {
        intent: 'leans back laughing with a wide mouth, then sits upright',
        captionEn: 'Haha',
        captionZh: '哈哈',
      },
      {
        intent: 'presses both hands together and bows once',
        captionEn: 'Thanks',
        captionZh: '谢谢',
      },
      {
        intent: 'opens both arms wide for a hug, then closes them',
        captionEn: 'Hug',
        captionZh: '抱抱',
      },
      {
        intent: 'yawns, rubs one eye, and gives a small wave',
        captionEn: 'Night',
        captionZh: '晚安',
      },
    ],
  },
  {
    slug: 'mood',
    nameEn: 'Mood',
    nameZh: '心情',
    backgroundColor: '#E7F6FF',
    motions: [
      {
        intent: 'stares, blinks slowly, and tilts its head',
        captionEn: 'Really',
        captionZh: '无语',
      },
      {
        intent: 'shrinks down with watery eyes, then eases back up',
        captionEn: 'Sad',
        captionZh: '委屈',
      },
      {
        intent: 'puffs its cheeks and stomps once, then exhales',
        captionEn: 'Mad',
        captionZh: '生气',
      },
      {
        intent: 'jumps with both eyes wide, then lands in place',
        captionEn: 'Whoa',
        captionZh: '震惊',
      },
      {
        intent: 'covers its face with both hands and peeks through the fingers',
        captionEn: 'Shy',
        captionZh: '害羞',
      },
      {
        intent: 'pumps one fist upward and bounces',
        captionEn: 'Go',
        captionZh: '加油',
      },
      {
        intent: 'droops its head, then snaps awake',
        captionEn: 'Sleepy',
        captionZh: '困了',
      },
      {
        intent: 'hugs itself and sways side to side',
        captionEn: 'Love',
        captionZh: '爱你',
      },
    ],
  },
];

export const DEMO_REFERENCES = [
  'dog-01',
  'dog-02',
  'dog-03',
  'dog-04',
  'dog-05',
  'dog-06',
  'dog-07',
  'dog-08',
] as const;

export const DEMO_NOTE =
  'Private admin catalog only. Eight dog references times two themes. The 128 GIF and 80 support PNG files are not in this repository and are not public.';
