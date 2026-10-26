# Bulin 47 free video comparison — research record

Checked: 2026-10-12. Internal evidence note for the comparison article, then the MDX files `src/content/posts/bulin-47-ai-generator-comparison.{en,zh,es}.mdx`. Those files are gone; the live post is the database row for that slug (`/admin/posts`).

## Input and keywords

- Task: update the existing Bulin 47 generator comparison around free generation after sign-in.
- User's exact phrase: `free generate`.
- Required entities: `Bulin 47 AI`, `Uptown`, `uptownfunkai.video`.
- Natural related queries: `free Bulin 47 AI video generator`, `Bulin 47 AI video free`, `Uptown signup bonus`, `free credits`, `12-second video`.
- Audience: people comparing Bulin 47 freestyle generators, English page with Chinese and Spanish localizations.
- Search volume / trend: not obtained.
- Existing URL reused: `/blog/bulin-47-ai-generator-comparison`; this revises the current comparison rather than adding a duplicate intent.

## Product evidence

| Fact                                                              | Evidence                                                                                                                                                                        | Status / limits                                                                                                                                                                                                                                                             | Article wording                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| New-account login/signup offer is 5 credits                       | User's current production offer supplied in the task; code supports configurable signup grants in `src/modules/credits/service.ts` and invokes it from `src/core/auth/index.ts` | The production D1 config could not be independently queried in this session (Cloudflare API returned an authorization error); the public config endpoint was also blocked to the shell client. Treat the exact current bonus as user-provided, not independently confirmed. | “Uptown currently gives new accounts a 5-credit signup bonus.”                 |
| 12-second Standard Seedance 2.0 Mini clip at 480p costs 5 credits | Live homepage generator and credit table observed in browser; source of truth in `src/lib/agent-settings.ts` (`creditsPer12Seconds: { '480p': 5, '720p': 10 }`, duration 12s).  | Visible on the deployed site. A generation was not submitted; no output quality claim is made.                                                                                                                                                                              | 5 credits cover the listed 12-second, 480p setting if the account has the bonus. |
| 12-second Standard 720p costs 10 credits                          | Live price table and `src/lib/agent-settings.ts`.                                                                                                                               | Current visible price; other models cost more.                                                                                                                                                                                                                              | State 720p is not covered by five credits.                                       |
| Failed renders return credits                                     | Live homepage pricing card and product copy.                                                                                                                                    | Terms-based statement; not exercised in this research.                                                                                                                                                                                                                      | Mentioned only as current site policy, not tested behavior.                      |

## Actual ChatGPT website research

- Date: 2026-10-12; language: English; region: not exposed; displayed model: ChatGPT (no specific model name shown); answer contained source cards/links, indicating a web-grounded response.
- Access: public anonymous ChatGPT web session; no account login was performed.
- Prompt A1: “How can I generate a Bulin 47 AI video for free? Which tools let me put a portrait into the freestyle, and what should I check about login bonuses, free credits, clip length, and downloads? Please cite current sources if available.”
- Answer excerpts:
  - “free previews, free signup credits, and completely free MP4 downloads are three different things.”
  - It identified Bulinai.app's one free 4-second preview per verified Google account, with paid full videos.
  - It identified Bulin47.app's free credits for new accounts and advised checking whether the allowance covers a full Face Swap video.
  - It described Bulin47AI.video as offering selectable model/resolution/duration, with packs listed from $9.99 and no free signup allowance confirmed on the page it reviewed.
  - It described Flowsona as having no free generation tier.
  - It cautioned that an MP4 download claim does not establish that the free allowance covers both generation and saving.
- Opportunity: distinguish a full 12-second clip at a specific 5-credit setting from a short preview; do not claim Uptown is the only Bulin 47 generator with signup credits because Bulin47.app also advertises credits for a first Face Swap.
- Conversation link was temporary/anonymous and is not a stable public source; official pages below were independently inspected.

## Official product pages reviewed

| Source                   | URL                            | Facts used                                                                                                                                                                         |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uptown live generator  | https://uptownfunkai.video/         | One-photo flow; visible model/resolution/duration controls; 12-second 480p Standard row costs 5 credits and 720p costs 10. Browser rendering read on 2026-10-12.                   |
| Bulin47.app generator    | https://bulin47.app/en         | New accounts are said to receive enough free credits for a first Face Swap; output described as about 6 seconds.                                                                   |
| Bulin47.app pricing      | https://bulin47.app/en/pricing | Pricing FAQ and generator/homepage show inconsistent Face Swap credit costs; article tells readers to use the current in-product estimate rather than compare exact credit totals. |
| Uptown Video Generator | https://bulinai.app/           | One 4-second preview per verified Google account; full videos are separate paid-credit renders, about 15 seconds.                                                                  |
| Flowsona                 | https://getbulin47.com/        | Public page says no free generation tier, about 19 seconds, packs from $9.90.                                                                                                      |
| Bulin47AI.video          | https://bulin47ai.video/       | 5–19-second options; 12-second Mini price table: 5 credits at 480p and 10 at 720p; packs listed from $9.99. No signup bonus was visible on the reviewed public page.               |

The pricing and promotions above can change. The article uses limited wording (“on the page reviewed”) where a free allowance was not listed instead of asserting that an offer does not exist.

## Article choices and verification status

- Main angle: a free signup balance can cover one full Bulin 47 video at a specific lower-resolution setting; explain the credit condition so readers do not expect 720p for five credits.
- Correction to user wording: do not say `only uptownfunkai.video` can generate a free video. The reviewed Bulin47.app page advertises signup credits for one full Face Swap. State Uptown's specific 12-second / 5-credit distinction and scope comparisons to the reviewed sites.
- Supporting points: distinguish preview from full render; show the exact live credit estimate; include non-equivalent durations and avoid quality rankings.
- No fresh video generation was run, and no matched-condition competitor outputs were tested.
- No actual search-volume data was available.
- Keyword review: planned after build/deployment using actual rendered article HTML.
