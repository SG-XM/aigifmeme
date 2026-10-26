# Bulin 47 AI video generator launch article research

Date checked: 2026-10-13

## Brief and angle

- Request: publish a blog article emphasizing the convenience of uploading a photo and not having to write a prompt.
- Audience and language: people trying the Bulin 47 AI photo-recast flow; English, Chinese, Spanish, and Arabic articles, following all four supported site locales.
- Primary phrases selected because none were supplied: `Bulin 47 AI video generator` (English) and `Bulin 47 AI 视频生成器` (Chinese). Search volume and ranking data were not available in this task.
- Angle: explain the preset photo-to-video flow and its limits. No competitor comparison or performance claim.
- ChatGPT research: attempted to open ChatGPT on 2026-10-13, but the public page was logged out. No prompt was submitted and no ChatGPT recommendation or citation is claimed. The workflow's ChatGPT research requirement remains incomplete.

## Product facts checked

| Claim                                                                                                                    | Evidence                                                                                        | Status                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| User uploads one portrait; JPG, PNG, WebP up to 10 MB                                                                    | Live homepage generator form and upload guidance at https://uptownfunkai.video/                      | Visible in production UI                                     |
| Bulin 47 freestyle is already selected and supplies the source performance                                               | Live generator text: source clip guides performance, camera, framing, crowd, and street setting | Visible in production UI                                     |
| No user-authored prompt is required for this preset                                                                      | Live homepage FAQ (“Do I need to write a prompt?”) and fixed-source generator flow              | Visible in production UI; scoped to this preset              |
| User signs in before using the photo upload; form shows model, resolution, duration, format, and current credit estimate | Live generator UI at https://uptownfunkai.video/                                                     | Visible in production UI                                     |
| User can find completed videos under the form or in My Creations                                                         | Live homepage product explanation and usage steps                                               | Visible in production UI                                     |
| Failed generation credits are returned                                                                                   | Live product copy and current project content                                                   | Product statement; no paid generation was performed          |
| Generation output details may vary                                                                                       | Live product guidance                                                                           | Stated limitation; no output test performed for this article |

No generation success rate, latency, likeness score, or new sample is claimed. The article distinguishes this fixed-source preset from broader prompt-based creation.

## Research queries and references

- Web search queries on 2026-10-13: “Uptown photo upload no prompt Bulin 47 AI video generator” and “AI video generator upload photo no prompt reference image photo to video”. Search results showed that both photo upload and promptless presets are common in this product category; this did not establish search volume or user preference.
- Official product page checked in the browser: https://uptownfunkai.video/ . The page showed a one-photo upload flow, Bulin 47 source already selected, optional model/resolution/duration/format controls, a credit estimate, completed-video locations, and a no-prompt FAQ.
- Official generation page: https://uptownfunkai.video/bulin-47-ai
- Official pricing page: https://uptownfunkai.video/pricing
- ChatGPT: not queried because the accessible ChatGPT page was logged out. The articles are based on the product UI and repo evidence, not a simulated ChatGPT answer.

## Keyword layout

English phrase: `Bulin 47 AI video generator`

- HTML title / H1: `Bulin 47 AI Video Generator: Upload a Photo, No Prompt Writing`
- Description: contains the product name and task.
- Short answer: contains the exact phrase.
- Related H2: “How to make a Bulin 47 AI video”; “What can you check before generating?”
- Deployed HTML audit: exact phrase appears 6 times in article content (0.804 occurrences per 100 Latin word units; diagnostic only). The phrase appears once in the title, H1, description and one related H2. No audit findings.

Chinese phrase: `Bulin 47 AI 视频生成器`

- H1: `Bulin 47 AI 视频生成器：上传照片，无需自己写提示词`
- Description: contains the exact phrase.
- Short answer: contains the exact phrase.
- Related H2: “如何制作 Bulin 47 AI 视频”; “提交前能看到什么？”
- Deployed HTML audit: exact phrase appears 6 times in article content (5.765% matched-character share; Latin-word density is not meaningful for this CJK article). The phrase appears once in the title, H1, description and one related H2. No audit findings.

## Deployment and remaining verification

On 2026-10-13 the blog used local MDX files registered in `src/content/posts/index.ts`. The Cloudflare Worker `uptown` was deployed that day, version `e6ff9a97-dbd6-4596-92f6-bfb11c52b81b`, with only the English and Chinese article files and its index entry layered onto the current `ffd4098` commit. The Spanish and Arabic translations were later added and deployed on 2026-10-13 as Worker version `8ca562ea-ef76-4e18-8eea-a776bdf70666`, again from an isolated worktree based on `ffd4098`, including only the four language files and the slug registration. That deploy did not need a D1 migration. Those MDX files were later removed; edit the same slugs at `/admin/posts` (`0013_post_locale_columns.sql`).

All four article routes returned HTTP 200. Rendered titles and H1s matched each locale, and each page advertised the four locale alternates plus `x-default`. `sitemap.xml` returned HTTP 200 and contains 24 occurrences of the article slug across canonical and alternate entries. `git diff --check` passed and `pnpm build` plus the four-locale i18n check passed. Translated title/H1 and route availability were verified; Spanish and Arabic keyword-density audits were not run. The article is publicly available, but search indexing and AI citations have not been verified. ChatGPT research remains incomplete because the accessible page was logged out.
