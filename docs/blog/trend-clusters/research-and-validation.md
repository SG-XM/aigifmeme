# Research and validation record

Checked: 2026-10-11  
Language/market: English-first, broad/global; Chinese versions also provided  
Exact user terms: `bulin-47-ai`; `burning-bridges-ai`  
Owned domain: `https://uptownfunkai.video` (Cloudflare deployment completed 2026-10-11; key pages and sitemap returned HTTP 200 in post-deploy checks)

## Product facts checked in source

| Fact                                                                                                        | Source                                                                                         | Evidence status                                          | Publish-safe wording                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Each effect accepts one uploaded image; JPEG/PNG/WebP and 10 MB limit are checked in the UI                 | `src/blocks/create-video.tsx`                                                                  | Implemented in source; live endpoint not verified        | Upload one JPG, PNG or WebP image up to 10 MB                 |
| First scene take is selected by default; user may generate without editing prompt or selecting another take | `src/blocks/create-video.tsx`                                                                  | Implemented in source                                    | The scene direction is prepared; a different take is optional |
| Allowed scene prompts are resolved server-side from validated campaign/take                                 | `src/lib/create-video.ts`, `src/routes/api/agent/create.ts`                                    | Implemented in source; no public request smoke test      | No prompt writing is required for the preset flow             |
| User session is required before upload/generation; generation uses available credits and current settings   | `src/blocks/create-video.tsx`, `src/routes/api/agent/create.ts`, `src/lib/agent-settings.ts`   | Implemented in source; production settings not inspected | Sign in, check the displayed credit estimate, then generate   |
| Tasks can be refreshed and completed items are surfaced in the library                                      | `src/routes/api/agent/create-tasks.ts`, `src/modules/agent/tools.ts`, existing Library changes | Source path present; live lifecycle not exercised        | Check completed clips in My Creations after generation        |
| Page preview is an illustrated preset plan, not a generated clip                                            | `src/blocks/trend-landing.tsx`                                                                 | Explicitly labeled in source                             | The page does not present unverified sample output            |

No generated output, average generation time, success rate, retention behavior or audio track was inspected. The articles do not promise a fixed result, quality level, or turnaround time.

## Search observations

On 2026-10-11, public search queries returned several recent sites targeting each exact phrase. The main page intent was upload-photo-and-generate; informational pages answered what the scene is and how to make a clip. Results overlapped heavily across generator pages, supporting one explainer per phrase rather than 3–5 near-duplicates per phrase. This is qualitative SERP observation only, not a volume or ranking dataset.

Sample queries:

- `"Bulin 47 AI" video trend generator`
- `"Bulin 47 AI" trend`
- `"Bulin 47" freestyle AI trend`
- `"Burning Bridges AI" trend video generator`
- `"Burning Bridges AI" video trend party`
- `how to do the Burning Bridges AI trend`

Semrush keyword volume/difficulty, Google Trends time series and Search Console metrics were not obtained. A Google Trends related-query check for the U.S. surfaced broader trend-name queries but did not establish demand for photo-preparation or pricing terms. Search result pages and promotional generator copy were not treated as independent proof of trend origin, licensed music, or competitor quality.

## ChatGPT Search

Required neutral prompts:

1. `What is the Bulin 47 AI trend, and how can someone make a personal version from one photo?`
2. `What is the Burning Bridges AI trend, and what is the easiest way to make a personal version from one photo?`

Status: **pending**. ChatGPT Search was unavailable in the signed-out session; no query was submitted and no model, response, recommendation, or citation was recorded. Article angles remain provisional until this check is performed.

## Implemented content and SEO notes

| Target               | Generator title/head                | Supporting article        | Internal link                                                      |
| -------------------- | ----------------------------------- | ------------------------- | ------------------------------------------------------------------ | --------------------- |
| `bulin-47-ai`        | “Bulin 47 AI Video Generator        | Make the Freestyle Trend” | `/blog/bulin-47-ai-trend-explained` (database post; MDX removed)        | `/bulin-47-ai`        |
| `burning-bridges-ai` | “Burning Bridges AI Video Generator | Make the Party Trend”     | `/blog/burning-bridges-ai-trend-explained` (database post; MDX removed) | `/burning-bridges-ai` |

On 2026-10-11 those articles were MDX modules registered in `src/content/posts/index.ts`, and the sitemap merged them with English and Chinese URLs. The MDX files are gone; the same slugs are database posts. A shared photo-preparation guide is at `/blog/ai-video-photo-preparation-guide` when that row is published. Post-deploy checks that day confirmed HTTP 200 and matching canonical/hreflang URLs. This does not establish search indexing or rankings.
