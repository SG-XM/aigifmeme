# Reference recast — production delivery

Deployed on 2026-10-11 through `pnpm run cf:deploy` to the existing
Cloudflare Worker `uptown`, serving `https://uptownfunkai.video`.
Final version: `1a49f766-8638-4c79-aade-30a50a312e75`.

Follow-up: moved the complete “What does the trend look like?” showcase to the
first section below navigation on both keyword pages, as requested. Verified
the production section order and retained one H1. The gallery class now uses
complete class strings so formatting cannot remove the separator.

## Delivered

- Reference proportions, Anton display headings, Space Grotesk body text,
  orange accents, dark stages and alternating light content sections.
- Top pair of small demos, followed by the real two-column upload/generation
  form. Homepage fixes Bulin; Bridges keeps its own scene and server preset.
- On 2026-10-11: six Bulin community videos and three Bridges videos, with no
  source links on Bulin cards, and media on external URLs. The homepage hero
  and gallery now load enabled `home_demo_video` rows (`/admin/demo-videos`).
  Burning Bridges still uses its hardcoded clips.
- All published blog summaries from the server loader, with internal links.
- Literal content revision date, a one-sentence page summary, localized
  metadata, canonical links, WebPage JSON-LD and updated sitemap lastmod.
- Existing credit packs, monthly/yearly plans and credit table retained.
  Savings badges and the recommended annual Studio offer are emphasized.
- Smooth anchors and restrained reveal animations; reduced motion respected.
- Fixed automatic aspect-ratio selection, theme overrides on pricing buttons,
  Bridges gallery class spacing, showcase video fitting and concurrent initial
  locale-context setup.

## Launch checks

| Dimension   | Evidence                                                                                                                                                                                 | Limits                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Responsive  | Browser views at 390, 768 and 1440px; document width stays within viewport. Mobile form stacks; credit table scrolls inside its wrapper.                                                 | Checked the changed consumer surfaces.             |
| Theme       | Scoped public palette; light sections retain readable colors in the site's dark theme. Pricing buttons correctly use white/orange backgrounds.                                           | No Admin redesign.                                 |
| SEO         | One H1 and localized canonical/meta per keyword page. All 18 sitemap URLs return 200; en/zh/x-default alternates present. Concurrent requests preserve their language.                   | Search Console submission not performed.           |
| Performance | Videos load near the viewport and pause outside it; reduced motion supported. Anton Latin subset used, font display swap. SSR exposes content.                                           | Lighthouse and field Core Web Vitals not measured. |
| Security    | Worktree scan clean; public summaries only expose published article fields. React escapes text; JSON-LD escapes `<`; existing auth, credit estimation and server-owned presets retained. | No paid generation or checkout executed.           |

`pnpm exec tsc --noEmit` passed. `pnpm build` and Cloudflare build passed,
including the 1,552-message bilingual check. No automated tests were added
or run for this layout request. Existing D1 schema and secrets were retained.

## Browser evidence

- `docs/previews/2026-10-11-live-recast-home.png`
- `docs/previews/2026-10-11-live-recast-showcase.png`
- `docs/previews/2026-10-11-live-recast-pricing.png`
- `docs/previews/2026-10-11-live-recast-bridges.png`

Live sitemap: <https://uptownfunkai.video/sitemap.xml>.

Keyword counts are recorded in
`2026-10-11-reference-recast-keyword-counts.json`. Each page has one H1;
exact main-text keyword phrases appear five times for Bulin and six times for
Bridges. This is an observed count, not a claim that a universal keyword-density
percentage predicts rankings.
