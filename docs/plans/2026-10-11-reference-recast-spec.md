# Approved reference layout specification

Reference: https://bulin47ai.video/ — inspected at 1280px on 2026-10-11.
User approved the layout proposal and requested implementation plus deployment
to uptownfunkai.video. This replaces the previous section-order restriction.

## Foundation

Scope `.trend-site`; retain Admin theme. Body Space Grotesk, heading Anton
(Chinese uses existing sans fallback). Background oklch(.175 .018 266), panel
oklch(.215 .02 266), text oklch(.94 .006 255), muted oklch(.73 .016 256), accent
oklch(.72 .18 48), light introduction oklch(.955 .018 265). Container max1280,
padding24 desktop/16 mobile. Header60px. Hero padding40px top/64px bottom.
Hero stage orange/blue diffuse light, tiny dot grid. H1 Anton weight400,
clamp(36px,5.2vw,72px), line-height.98, max1000 centered, orange offset shadow.
Body hero text clamp16–18px, line-height1.6, max780 centered. Section titles
clamp(36px,4.6vw,64px), Anton400; local Chinese headings use a readable sans.
Other sections padding96px vertical (64px mobile). Short colored eyebrow.

## Approved component contract

- `.trend-container`: shared max1280 wrapper.
- `.trend-stage`, `.trend-hero`, `.trend-hero-title`, `.trend-hero-description`,
  `.trend-sticker`, `.trend-update`: centered hero, summary and changelog line.
- `.trend-compare`: max360, two 9:16 videos, gap14, radius18, light2px outline,
  small orange offset shadow; top labels describe external references accurately.
- `.trend-generator`: max1040, below pair. Embedded CreateVideo form will use
  `.trend-console`: 2px pale outline, radius20, padding22, gap20px28px,
  columns .82fr/1.18fr. `.trend-upload-step` left, `.trend-settings-step` right,
  `.trend-console-footer` spans both. Mobile stacks. Uploadbox `.trend-upload-box`
  about395px high desktop. Optional settings show summary first; pill/radio
  controls when expanded, real model/resolution/duration values only.
- `.trend-introduce`: light section with definition + 4 concise fact cards.
- `.trend-section`, `.trend-section-title`, `.trend-section-description` standard.
- `.trend-steps`: 3 tutorial cards, numbered01–03.
- `.trend-showcase-grid`: 6 columns >=1280, 3 columns641–1279, 2 <=640,
  1 <=360, gap20 (mobile12). Video9:16; six Bulin examples1–6 unchanged.
  `.trend-showcase-grid--three` uses3 for Bridges. No source links on Bulin cards.
- `.trend-feature-grid`: 3x2 simple cards for true capabilities and photo tips.
- `.trend-guide-grid`, `.trend-guide-card`: all published blogs, title, short
  description, publication date and internal link; rendered from route loader.
- `.trend-next-grid`: effect navigation cards, no effect picker in generator.
- `.trend-pricing`: real existing packs/subscriptions/credit table, orange
  recommendation and savings badges. Apply the new palette to cinematic tone.
- `.trend-faq-list`, `.trend-faq`: numbered native disclosure rows.
- `.trend-end-cta`: orange/light panel with create and pricing actions.
- Smooth anchors + gentle entrance motions, with reduced-motion support.

## Content and routes

Order (updated at user request): nav → gallery → short H1/summary/update →
two demos → generator → definition → 3 steps → features → tips → Guides → other effect → pricing → FAQ →
CTA → footer. Homepage fixes Bulin; Bridges uses the same sections but its own
copy, demos and preset. Blog summaries come from published database posts.
Update date is a literal content date, not per-request time.
SEO metadata WebPage/dateModified describes the actual workflow. Domain remains
uptownfunkai.video; alias /bulin-47-ai canonical homepage. Sitemap lists canonical
public pages plus published posts, with alternates only for locales that have a title and body.

Use actual auth/upload/generation/credit/checkout APIs. Do not promise original
motion matching or bundled songs. No paid render in layout validation. Build,
type check, screenshots and deployment verification; no automated tests added.
