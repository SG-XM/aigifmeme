# Spanish localization and search content design

Blog posts are no longer local MDX. Edit them at `/admin/posts` (`title_es`, `description_es`, `content_es`). The plan below is the 2026-10-11 design.

## Goal

Make the complete Uptown application usable in Spanish while improving the
Spanish homepage and blog for users searching for the Bulin 47 video effect.
Use neutral Spanish for Spain and Latin America under one `es` locale. Keep the
existing English and Chinese experience intact.

## Research and audience

Google Trends checks for Mexico, Spain, Colombia, and Argentina surfaced the
queries `como hacer el video de bulin 47`, `video de bulin 47`, `bulin 47 ia`,
`bulin 47 video viral`, and `freestyle de bulin 47`. Trends values are relative
interest indices, not search-volume estimates. Reference explorations:

- Mexico: https://trends.google.com/trends/explore?date=today%2012-m&geo=MX&q=Bulin%2047
- Spain: https://trends.google.com/trends/explore?date=today%2012-m&geo=ES&q=Bulin%2047
- Colombia: https://trends.google.com/trends/explore?date=today%2012-m&geo=CO&q=Bulin%2047
- Argentina: https://trends.google.com/trends/explore?date=today%2012-m&geo=AR&q=Bulin%2047

An actual Spanish-language ChatGPT search asked how to make the viral Bulin 47
video from one photo, whether the original performance and audio remain, how
identity looks through the clip, what is free or paid, and what to check before
using a tool. The answer highlighted questions about source footage, facial
consistency, photo quality and permission, prompt requirements, price and
credits, output length and resolution, retries, privacy, and publishing rights.
The separate brand-specific follow-up found that clear page copy and visible
examples are important evidence; it did not establish a measured identity
consistency score. Do not present the research as a product benchmark.

## Localization architecture

1. Register `es` in Paraglide and Inlang; use `/es/...` URL prefixes and leave
   `/api/...` unchanged. Add `Español` to the language selector.
2. Add Spanish messages matching every key in `messages/en.json` and
   `messages/zh.json`. This covers the public site, campaign pages, auth,
   account dashboard, agent/video tools, and admin UI.
3. Add Spanish local MDX variants for the five existing blog posts and both
   legal pages. Add a Spanish how-to page for the highest-intent query
   `cómo hacer el video de Bulin 47`; keep it distinct from the existing
   identity-consistency and tool-selection articles.
4. Extend the CMS post model with optional Spanish title, description, and
   content fields. Public Spanish article lists only show Spanish-authored
   articles or translated content; English-only database articles do not leak
   English text into `/es` pages. Add corresponding admin fields.
5. Add Spanish name, description, feature, and badge columns for subscription
   plans; add Spanish name and description columns for credit packs. API output
   chooses the active locale and uses an explicit fallback for older records.
   Translate currently configured public plans and packs as part of the
   reviewed data migration where applicable.
6. Use locale-aware date and number formatting. Ensure canonical, hreflang,
   JSON-LD language, sitemap, and LLM text outputs include Spanish URLs and
   Spanish content.

## Content strategy

- Homepage: target product/action intent around `Bulin 47 AI` and the Spanish
  variant `Bulin 47 IA`; explain that the effect uses the original source video
  and the uploaded photo to recast its lead performer.
- Main how-to article: target the exact query `cómo hacer el video de Bulin
47`, explain the one-photo flow, source-video behavior, visible credit
  estimate, and photo preparation.
- Supporting posts: separate identity consistency, choosing a tool for a
  desired result, the trend explanation, the Burning Bridges effect, and photo
  preparation. Avoid making each page target the same how-to query.
- Preserve the requested third-person editorial voice. Describe competitors
  only in terms of needs they can satisfy; do not speculate about their
  implementation or add flattering adjectives. State Uptown capabilities
  from product facts and visible examples, avoid unsupported speed, price, or
  absolute frame-perfect guarantees, and keep the independent fan-project
  disclaimer.

## Data migration and deployment

Add nullable Spanish CMS columns and non-null plan/top-up Spanish columns with
empty defaults across SQLite, PostgreSQL, and MySQL templates. Generate and
review an additive migration. Per repository production rules, do not apply the
migration until the user reviews the concrete SQL. After approval, apply the
migration, build the Cloudflare Worker, deploy through `pnpm run cf:deploy`,
and smoke-check `/`, `/es/`, Spanish blog routes, sitemap, and the public config
endpoint. Do not deploy until the production migration and build are ready.

## Completion checks

- Spanish locale compiles and every message key exists.
- Spanish homepage, campaigns, blog index/details, legal pages, sign-in, pricing,
  dashboard, and admin surfaces render in Spanish.
- Spanish metadata, canonical/hreflang, sitemap, and structured-data language
  agree with the route.
- Current pricing and CMS responses do not show untranslated English copy on
  Spanish pages.
- Production migration SQL is reviewed before application; build passes; the
  deployed routes and API smoke checks pass.
