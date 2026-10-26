# Consumer trend pages redesign

Approved direction: preserve the homepage hero, example gallery, creation area and pricing order. Both `/` (Bulin) and `/burning-bridges-ai` use one shared page. The generator fixes the campaign automatically. `/bulin-47-ai` remains a compatible page with a canonical pointing to the homepage.

Visual system: night street performance, navy background oklch(0.22 0.035 260), raised panels oklch(0.29 0.04 260), white foreground oklch(0.97 0.008 250), orange primary oklch(0.76 0.16 48), blue accent oklch(0.8 0.1 220), pink details oklch(0.74 0.16 350). Existing IBM Plex Sans typography. Generated speaker/sunglasses/play logo. Theme scoped to public trend pages; Admin untouched. Short entrance transitions, smooth anchors and reduced-motion support.

Content: one keyword-specific H1; concise photo-to-video promise; real examples attributed to their sources; one short definition and source explanation; three actual steps beside the upload form; compact FAQ. No unsupported duration, speed, original song or identical-motion promise. Count visible main-content keyword variants after rendering; exclude navigation/footer/schema, report counts and phrase occurrences per 100 words without asserting a universal ideal density.

Generator: sign in, upload one JPG/PNG/WebP up to 10 MB, review default scene and credit estimate, generate, review/download in results or library. Preset is fixed; optional quality settings stay folded. Each campaign has its own scene instructions. Prompt improvements retain identity, limit actions and use recognizable street/speaker versus chandelier/cup/search gestures. Existing credits, auth, APIs and checkout logic remain.

Research: https://rapduo.ai/bulin-47-ai (palette), https://bulin47ai.com/ (plain-language information hierarchy), https://rapduo.ai/burning-bridges-ai (party routine), https://www.media.io/ai/explore/zone/drake-burning-bridges-ai-video-generator (identity and cup-hand consistency), https://deultimominuto.com/entretenimiento/video-de-freestyle-de-bulin-47/ (freestyle origin), https://www.youtube.com/watch?v=bpD-JVy2zV4 (official party video).

Implementation sequence: shared landing + localized content; generator preset simplification; scoped colors and motion; logo; metadata/canonical/sitemap; build and browser/keyword checks. No automated tests added. Actual paid generation requires an authenticated account and configured video/storage provider and is not executed as part of visual preview.

## Homepage showcase update

User requested all six videos from `https://bulin47ai.video/#showcase` in the
Bulin homepage gallery, without visible source links on the example cards.
Keep the three-column desktop gallery, ordered examples 1–6, and use the
reference video's corresponding JPG covers. Media remain external URLs;
original video text and marks are unchanged. Burning Bridges retains its
existing examples. Six homepage video elements loaded with readyState 4 and
no media errors; the gallery has no source anchors. Build, bilingual message
check (1,492 messages) and TypeScript check passed. Local update only.
