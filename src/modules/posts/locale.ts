export const POST_LOCALES = ['en', 'zh', 'es', 'ar'] as const;
export type PostLocale = (typeof POST_LOCALES)[number];

export type PostTextFields = {
  title: string | null;
  description: string | null;
  content: string | null;
  titleZh: string | null;
  descriptionZh: string | null;
  contentZh: string | null;
  titleEs: string | null;
  descriptionEs: string | null;
  contentEs: string | null;
  titleAr: string | null;
  descriptionAr: string | null;
  contentAr: string | null;
};

const FIELDS: Record<
  PostLocale,
  {
    title: keyof PostTextFields;
    description: keyof PostTextFields;
    content: keyof PostTextFields;
  }
> = {
  en: { title: 'title', description: 'description', content: 'content' },
  zh: {
    title: 'titleZh',
    description: 'descriptionZh',
    content: 'contentZh',
  },
  es: {
    title: 'titleEs',
    description: 'descriptionEs',
    content: 'contentEs',
  },
  ar: {
    title: 'titleAr',
    description: 'descriptionAr',
    content: 'contentAr',
  },
};

function stored(
  row: PostTextFields,
  locale: PostLocale,
  kind: 'title' | 'description' | 'content'
): string {
  return row[FIELDS[locale][kind]] ?? '';
}

/** A locale counts only when that language has both a title and a body. */
export function postHasLocale(
  row: PostTextFields,
  locale: PostLocale
): boolean {
  return Boolean(
    stored(row, locale, 'title').trim() && stored(row, locale, 'content').trim()
  );
}

export function postLocales(row: PostTextFields): PostLocale[] {
  return POST_LOCALES.filter((locale) => postHasLocale(row, locale));
}

/**
 * Requested language when it has text; otherwise the English column.
 * An empty English column stays empty — there is no second fallback.
 */
export function postText(
  row: PostTextFields,
  locale: PostLocale,
  kind: 'title' | 'description' | 'content'
): string {
  const own = stored(row, locale, kind);
  if (own.trim()) return own;
  if (locale === 'en') return '';
  const english = stored(row, 'en', kind);
  return english.trim() ? english : '';
}

export function postContentLocale(
  row: PostTextFields,
  requested: PostLocale
): PostLocale {
  if (postHasLocale(row, requested)) return requested;
  if (postHasLocale(row, 'en')) return 'en';
  return requested;
}

export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() ? value : null;
}

export function isPostLocale(value: string): value is PostLocale {
  return (POST_LOCALES as readonly string[]).includes(value);
}
