import type { LiveEffectId } from '@/lib/ai-video-paths';

/**
 * Effect pages keep one primary effect. A post that hits another effect more
 * strongly (or equally) stays off this page. Home is not one of these brands.
 */
export const EFFECT_BRAND_SLUGS = [
  'bulin-47',
  'burning-bridges',
  'window-peeper',
  'im-so-sorry',
] as const;

export type EffectBrandSlug = (typeof EFFECT_BRAND_SLUGS)[number];

export const EFFECT_SLUG_BY_ID: Record<LiveEffectId, EffectBrandSlug> = {
  bulin: 'bulin-47',
  bridges: 'burning-bridges',
  peeper: 'window-peeper',
  sorry: 'im-so-sorry',
};

/** Site-level related guides. Not an effect brand and not `bulin-47`. */
export const HOME_RELATED_SLUG = 'home';

/**
 * Phrases from the SEO keyword tables. Matching is case-insensitive and
 * ignores apostrophes and hyphens. Home is the site-level list.
 */
export const RELATED_KEYWORDS = {
  home: ['AI video', 'one photo', 'credits', 'Seedance', 'how to', 'generator'],
  'bulin-47': ['bulin 47', 'dame hombro', 'freestyle'],
  'window-peeper': ['window peeper', 'peeper', 'night window', 'curtain'],
  'burning-bridges': [
    'burning bridges',
    'chandelier',
    'burning bridges ai',
    'burning-bridges',
    'chandelier party',
  ],
  'im-so-sorry': [
    "i'm so sorry",
    'im so sorry',
    'photo trend',
    'lie carousel',
    'sorry filter',
  ],
} as const satisfies Record<
  typeof HOME_RELATED_SLUG | EffectBrandSlug,
  readonly string[]
>;

type RelatedScope = keyof typeof RELATED_KEYWORDS;

export const EFFECT_RELATED_CONFIG_PREFIX = 'effect_related_';
/**
 * Leftover keys from the removed sorry-slide URL override
 * (`effect_demo_slides__im-so-sorry`). Still reserved so the custom-config
 * tab does not show or delete them. The page does not read these keys.
 */
export const EFFECT_DEMO_CONFIG_PREFIX = 'effect_demo_';

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 48;
const MAX_IDS = 20;
const MAX_ID_LENGTH = 80;

export function isEffectBrandSlug(value: string): value is EffectBrandSlug {
  return (EFFECT_BRAND_SLUGS as readonly string[]).includes(value);
}

export function isEffectAdminConfigKey(name: string): boolean {
  return (
    name.startsWith(EFFECT_RELATED_CONFIG_PREFIX) ||
    name.startsWith(EFFECT_DEMO_CONFIG_PREFIX)
  );
}

export function effectTagsKey(slug: EffectBrandSlug): string {
  return `${EFFECT_RELATED_CONFIG_PREFIX}tags__${slug}`;
}

export function effectIdsKey(slug: EffectBrandSlug): string {
  return `${EFFECT_RELATED_CONFIG_PREFIX}ids__${slug}`;
}

/** Lowercase slug form used for tags and brand checks. Apostrophes are removed. */
export function normalizeTag(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTagList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(/[,，\n]/)) {
    const tag = normalizeTag(part);
    if (!tag || tag.length > MAX_TAG_LENGTH || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function formatTagList(tags: readonly string[]): string {
  return parseTagList(tags.join(', ')).join(', ');
}

export function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of value.split(/[,，\s]+/)) {
    const id = part.trim();
    if (!id || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9-]+$/.test(id)) {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_IDS) break;
  }
  return ids;
}

export function formatIdList(ids: readonly string[]): string {
  return parseIdList(ids.join(', ')).join(', ');
}

export type RelatedPostSource = {
  id: string;
  slug: string;
  title?: string;
  /** Summary shown on cards. Keyword matching reads this with the title and body. */
  description?: string;
  /** Article body. Callers can omit it after matching. */
  content?: string;
  tags?: readonly string[];
};

export type EffectRelatedQuery = {
  /**
   * `home` for the site-level guide list. An effect brand slug for that
   * effect's landing page.
   */
  slug: string;
  /** Extra tags that count as a bonus match. They do not replace keywords. */
  relatedPostTags?: readonly string[] | null;
  relatedPostIds?: readonly string[] | null;
};

/**
 * Admin tag list. An empty list falls back to the effect slug so a slug tag
 * still counts. Keyword matching does not require this list.
 */
export function resolveRelatedPostTags(query: EffectRelatedQuery): string[] {
  const tags = parseTagList((query.relatedPostTags ?? []).join(', '));
  if (tags.length > 0) return tags;
  const slug = normalizeTag(query.slug);
  return slug ? [slug] : [];
}

type Relevance = {
  title: number;
  description: number;
  body: number;
  bonus: number;
};

function foldMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’‘ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const folded: string[] = [];
  for (const keyword of keywords) {
    const value = foldMatchText(keyword);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    folded.push(value);
  }
  folded.sort(
    (left, right) => right.length - left.length || left.localeCompare(right)
  );
  return folded;
}

const FOLDED_KEYWORDS: Record<RelatedScope, readonly string[]> = {
  home: foldKeywords(RELATED_KEYWORDS.home),
  'bulin-47': foldKeywords(RELATED_KEYWORDS['bulin-47']),
  'window-peeper': foldKeywords(RELATED_KEYWORDS['window-peeper']),
  'burning-bridges': foldKeywords(RELATED_KEYWORDS['burning-bridges']),
  'im-so-sorry': foldKeywords(RELATED_KEYWORDS['im-so-sorry']),
};

function relatedScope(slug: string): RelatedScope | null {
  if (slug === HOME_RELATED_SLUG) return HOME_RELATED_SLUG;
  const normalized = normalizeTag(slug);
  if (normalized === HOME_RELATED_SLUG) return HOME_RELATED_SLUG;
  return isEffectBrandSlug(normalized) ? normalized : null;
}

/** Distinct keyword hits. A longer phrase consumes its own shorter pieces. */
function keywordHits(text: string, keywords: readonly string[]): number {
  let remaining = text;
  let hits = 0;
  for (const keyword of keywords) {
    if (!keyword || !remaining.includes(keyword)) continue;
    hits += 1;
    remaining = remaining.split(keyword).join(' ');
  }
  return hits;
}

function isRelevant(score: Relevance): boolean {
  return (
    score.title > 0 ||
    score.description > 0 ||
    score.body > 0 ||
    score.bonus > 0
  );
}

/** Title outranks summary, summary outranks body, body outranks a tag or id. */
function compareRelevance(left: Relevance, right: Relevance): number {
  if (left.title !== right.title) return left.title - right.title;
  if (left.description !== right.description)
    return left.description - right.description;
  if (left.body !== right.body) return left.body - right.body;
  return left.bonus - right.bonus;
}

function tagMatches(
  post: RelatedPostSource,
  scope: EffectBrandSlug,
  extraTags: readonly string[]
): boolean {
  const tags = (post.tags ?? []).map((tag) => foldMatchText(tag));
  if (!tags.some(Boolean)) return false;
  const accepted = new Set<string>([
    foldMatchText(scope),
    ...FOLDED_KEYWORDS[scope],
    ...extraTags.map((tag) => foldMatchText(tag)),
  ]);
  return tags.some((tag) => tag.length > 0 && accepted.has(tag));
}

function textScore(
  post: RelatedPostSource,
  scope: EffectBrandSlug,
  bonus: number
): Relevance {
  const keywords = FOLDED_KEYWORDS[scope];
  return {
    title: keywordHits(foldMatchText(post.title ?? ''), keywords),
    description: keywordHits(foldMatchText(post.description ?? ''), keywords),
    body: keywordHits(foldMatchText(post.content ?? ''), keywords),
    bonus,
  };
}

function matchesHome(post: RelatedPostSource): boolean {
  const keywords = FOLDED_KEYWORDS.home;
  return (
    keywordHits(foldMatchText(post.title ?? ''), keywords) > 0 ||
    keywordHits(foldMatchText(post.description ?? ''), keywords) > 0 ||
    keywordHits(foldMatchText(post.content ?? ''), keywords) > 0
  );
}

function matchesEffect(
  post: RelatedPostSource,
  scope: EffectBrandSlug,
  query: EffectRelatedQuery
): boolean {
  const extraTags = parseTagList((query.relatedPostTags ?? []).join(', '));
  const ids = new Set(parseIdList((query.relatedPostIds ?? []).join(', ')));
  let bonus = 0;
  if (tagMatches(post, scope, extraTags)) bonus += 1;
  if (ids.has(post.id)) bonus += 1;
  const own = textScore(post, scope, bonus);
  if (!isRelevant(own)) return false;
  for (const brand of EFFECT_BRAND_SLUGS) {
    if (brand === scope) continue;
    const other = textScore(post, brand, tagMatches(post, brand, []) ? 1 : 0);
    if (!isRelevant(other)) continue;
    if (compareRelevance(other, own) >= 0) return false;
  }
  return true;
}

/**
 * Home matches the site keyword list and does not apply effect exclusion.
 * Effect pages match keywords in the title, summary, or body. Tags and ids
 * are a bonus. A post that hits another effect as strongly, or more strongly,
 * is left off this page.
 */
export function selectRelatedPosts<T extends RelatedPostSource>(
  posts: readonly T[],
  query: EffectRelatedQuery
): T[] {
  const scope = relatedScope(query.slug);
  if (!scope) return [];
  if (scope === HOME_RELATED_SLUG) return posts.filter(matchesHome);
  return posts.filter((post) => matchesEffect(post, scope, query));
}

/** Matched cards for a page loader. Drops bodies after they have been searched. */
export function presentRelatedPosts<T extends RelatedPostSource>(
  posts: readonly T[],
  query: EffectRelatedQuery
): T[] {
  return selectRelatedPosts(posts, query).map((post) => {
    if (post.content == null) return post;
    const { content: _content, ...card } = post;
    return card as T;
  });
}

export type EffectRelatedSettings = {
  slug: EffectBrandSlug;
  relatedPostTags: string[];
  relatedPostIds: string[];
};

export function effectRelatedFromConfigs(
  slug: EffectBrandSlug,
  configs: Record<string, string | undefined>
): EffectRelatedSettings {
  return {
    slug,
    relatedPostTags: parseTagList(configs[effectTagsKey(slug)]),
    relatedPostIds: parseIdList(configs[effectIdsKey(slug)]),
  };
}
