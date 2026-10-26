# Spanish localization implementation plan

This is the 2026-10-11 execution plan. Blog posts are database rows at `/admin/posts`, not the local MDX files named below.

This is the manual execution plan because a `writing-plans` skill is not
installed in the available skill roots.

## 1. Locale and app messages

- Register `es` in Inlang and Paraglide with `/es` URL patterns; retain
  unprefixed English and `/zh` Chinese URLs.
- Add `Español` to the language selector and Spanish locale-aware number/date
  formatting.
- Translate the full message catalog and verify exact key parity with English
  and Chinese. Translate homepage, campaign pages, pricing, auth, navigation,
  account, create/video/agent, settings, and admin text.
- Update locale-specific API selection for plans and top-ups.

## 2. CMS and database model

- Add optional Spanish title, description, and content to CMS posts.
- Add Spanish plan name, description, feature list, and badge; add Spanish
  credit-pack name and description.
- Update SQLite, PostgreSQL, and MySQL schema templates, public service output,
  admin forms, checkout labels, and locale-aware blog queries.
- Generate an additive production migration and include verified Spanish copy
  for currently configured public products where possible.
- Stop before applying the production migration; show the user the exact SQL
  and wait for review as required by the repository instructions.

## 3. Pages and content

- Translate all five current local blog posts and both legal pages to Spanish.
- Add a distinct Spanish guide targeting `cómo hacer el video de Bulin 47`.
- Revise the Spanish homepage to answer original-video, identity, input photo,
  audio, credits, output, and sharing questions.
- Keep third-person copy and the independent fan-project disclaimer. Claims
  about original-source recasting and identity use product copy and visible
  examples; avoid unsupported exact-match guarantees or competitor claims.

## 4. SEO and publishing checks

- Verify metadata, canonical, hreflang, structured-data language, sitemap,
  robots, and LLM text endpoints for Spanish routes.
- Audit exact Spanish target query placement in rendered HTML for the Spanish
  homepage and main guide; check internal links and localized date output.
- Run the required production build; fix regressions in the files touched by
  this task.
- After migration review, apply production migrations, deploy with
  `pnpm run cf:deploy`, and smoke-check production `/`, `/es/`, Spanish blog
  routes, sitemap, and `/api/config/public`.

## 5. Boundaries

- Do not reset, revert, or reformat unrelated dirty workspace changes.
- Do not expose environment secrets or apply schema changes before the user
  reviews generated SQL.
- Do not claim search indexing or improved rankings from deployment alone.
