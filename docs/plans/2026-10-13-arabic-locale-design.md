# Arabic locale and RTL support

Blog articles are database rows edited at `/admin/posts`. `0013_post_locale_columns.sql` added Arabic (and Chinese) title, description, and body columns. The design below was written when those columns did not exist and posts were also local MDX.

## Approved design

Add Arabic (`ar`) as a first-class Paraglide locale across the public site, account UI, admin UI, static pages, and blog. Arabic pages use `/ar` URLs, Arabic translations for the complete message catalog, existing local MDX articles, and static MDX pages, plus a document-level right-to-left direction. Preserve the current English fallback behavior for database-backed blog articles and pricing data because their schema has no Arabic fields; expose alternate-language URLs only when content really exists in that locale.

RTL layout support should use document direction and targeted logical CSS/RTL-aware utilities, while preserving LTR behavior for URLs, numeric identifiers, media controls, and other inherently directional content. Locale-aware date formatting should use the Arabic locale. The sitemap and page metadata must advertise the Arabic locale consistently.

No database schema changes or new translation service are part of this change.

## Implementation plan

1. Register `ar` in Paraglide and every explicit locale URL pattern; add its language-switcher name.
2. Add Arabic translations for all message keys, keeping the catalog keys and interpolation parameters aligned with existing locales.
3. Set `lang="ar"` and `dir="rtl"` on Arabic documents; inspect shared layout styles and directional icons for RTL behavior.
4. Add Arabic variants of all existing local blog posts and static pages; ensure metadata, structured data, hreflang, and sitemap entries reflect actual translations.
5. Extend server-side locale handling for database blog posts, subscription plans, and credit packs with the approved English fallback.
6. Run the required production build and review the final diff; run the repository security scan before staging and commit.
7. Commit only this change to `main`, then deploy through the existing Cloudflare workflow and verify the live sitemap and pages.

## Acceptance

- `/ar` and `/ar/...` resolve as Arabic routes and retain locale on internal links.
- Arabic UI text and local blog posts render with RTL document direction.
- Database content without Arabic translations falls back to English without claiming a false Arabic hreflang alternate.
- `/sitemap.xml` includes Arabic URLs and only valid blog translation alternates.
- `pnpm build` and the pre-commit security scan pass.
