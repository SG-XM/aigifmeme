# Sitemap validation — 2026-10-11

Snapshot from that day, when the sitemap mixed local MDX articles with database posts and only English/Chinese alternates. Blog URLs now come only from published `post` rows. A locale alternate exists when that language has a title and body (`en`, `zh`, `es`, `ar`).

## Structure

- Canonical public routes: `/`, `/burning-bridges-ai`, `/pricing`, `/blog`,
  `/privacy-policy`, `/terms-of-service`.
- Three registered local blog articles, with English and Chinese versions.
- Published database articles are included dynamically without the former
  100-article listing limit; database articles take precedence for matching slugs.
- The production response contains 18 distinct URLs (9 pages × 2 locales).
- `/bulin-47-ai` is omitted because it declares the homepage canonical.
- Admin, settings, authentication, private creation/library routes and API
  endpoints are omitted.

## Checks

- Local sitemap returns HTTP 200 with XML UTF-8 content type; XML parses.
- All 18 listed production URLs return HTTP 200 without redirects.
- Each URL includes `en`, `zh` and `x-default` alternate links.
- `robots.txt` references the sitemap for the configured application origin.
- URLs and attributes are XML escaped; blog slugs are URL encoded.
- Database `lastmod` uses `updatedAt`, falling back to creation time. Local
  articles use their declared publication dates. The homepage and Bridges page
  share the actual content revision date, 2026-10-11; other static pages omit it.
- XML size: 7,319 bytes, below the single-file size and URL-count limits.
- `pnpm build` passed, including the 1,552-message bilingual i18n check.
- English and Chinese pages have one H1, their own localized metadata and
  canonical URL. Concurrent production requests keep their intended language
  after initializing Paraglide's AsyncLocalStorage once at module startup.

## Links and deployment state

- Local: <http://localhost:3000/sitemap.xml>
- Production: <https://uptownfunkai.video/sitemap.xml>
- Deployed to Cloudflare Workers. The sitemap was verified on the production
  domain; it has not been submitted to Search Console.
- Additional published database articles will be included automatically.
