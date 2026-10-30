#### 声明：① 注册 https://goofish.win 资源站 可以免费获取shipany docs源码; ② 只认证咸鱼上作者为「厨房清新的海蜇灯」或附属网站 https://goofish.win 购买，任何其他获取来源均为二次售卖；

# Uptown

A production-ready conversational AI video SaaS, built to rebrand and ship.
Users describe a shot or attach source media; the agent decides how to use the
material, chooses the right video tool, writes the cinematic prompt, renders
the clip, and charges credits for it. Payments, subscriptions, credits, auth,
admin, sharing, media library, and i18n are already wired.

Built on [ShipAny](https://shipany.ai) (TanStack Start + Drizzle + better-auth).
It runs on Node or Cloudflare Workers without relying on a writable filesystem.

## What it does

The chat is an agent loop, not a prompt box. A message goes to an LLM that has
two tools — `generate_video` (text-to-video) and `animate_image`
(image-to-video) — and it picks one, writes the cinematic prompt, and calls it.
That's why a user can say "slow push in on her while the background goes soft"
and get a clip back instead of a form to fill in.

Around that loop:

- **Agent-owned media routing** — the composer only asks users to upload from
  their device or choose something from their library. The agent decides
  whether each image, audio file, or video is a frame or reference input and
  maps it to the generation tool's parameters.
- **Seedance composer** — Standard, Fast, Pro and Ultra expose the
  same duration, resolution, aspect-ratio, provider model mapping, and example
  settings and integer credit totals.
- **Living showcase** — chat examples use a responsive masonry layout, load and
  autoplay only near the viewport, and open in a full-screen preview with
  “Use this prompt” and “Use as reference” actions. Homepage hero and gallery
  clips are the constants in `src/lib/home-demos.ts`.
- **Credits** — the approved per-model, per-resolution 12-second price table scales
  by duration and rounds the render total to one whole credit. Deductions are atomic;
  failed/canceled renders refund the original deduction. Balance is checked before
  starting an agent turn.
- **Paywall** — a one-time pack can fund a render without any subscription.
- **Providers** — Kie supports all four Seedance tiers. Compatible configured gRouter
  and Fal routes remain available for Seedance 2.5.
- **Renders take minutes, not seconds** — the tool polls for up to 15 minutes
  at a 5-second interval. The upstream and local task ids are persisted; the
  composer becomes a stop button while work is active, cancellation is sent
  upstream when supported, and stale unfinished transcript rows are shown as
  interrupted instead of spinning forever.
- **Stateless** — conversation history replays from the database each turn, and
  generated clips go straight to object storage. No session files, no disk.
- **Product shell included** — chat history, reusable media library, clip
  preview/download, public share pages, English/Chinese/Spanish/Arabic UI,
  billing, top-ups, and an admin settings/test surface are included.

## How generation works

```text
User message + uploaded/library media
  → agent chooses generate_video or animate_image
  → provider accepts an asynchronous task
  → server stores both task ids and polls every 5 seconds over the chat SSE
  → completed clip is copied to object storage
  → tool result and final answer are persisted in the conversation
```

The active chat request owns the polling loop; this repository does not ship a
separate queue consumer. Task metadata is durable so the UI can recover the
correct active/interrupted state and cancel a provider task after navigation
or reconnection. If you need renders to survive server process restarts and
continue without an open request, move the same polling service behind a queue
or workflow runner.

## Quick start

```bash
pnpm install
cp .env.example .env.development     # set AUTH_SECRET at minimum
pnpm db:push                         # creates data/local.db
pnpm rbac:init --admin-email=you@example.com --admin-password=<pick-one>
pnpm dev                             # http://localhost:3000
```

Then sign in and open `/admin/settings` — **the app cannot generate anything
until you configure a chat model, video provider, and object storage there.**
Provider credentials are stored in the database rather than baked into env.

## Configure

Admin → Settings → **AI**:

| Group                | What to set                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Chat Model**       | Default provider (`auto` prefers OpenAI, falls back to Anthropic), plus its model id    |
| **OpenAI**           | Base URL + API key. OpenAI-compatible gateways such as OpenRouter or Together also work |
| **Anthropic**        | Base URL + API key when Claude should drive the agent                                   |
| **Video Generation** | Model-aware provider routing; Kie serves all four tiers                                 |
| **Kie**              | API key for Seedance 2.0 Mini, Fast, Pro and Seedance 2.5                               |
| **gRouter / Fal**    | Existing Seedance 2.5 routes remain available when configured                           |

Current catalog: Standard / Fast / Pro support 4–15s; Ultra supports 4–30s.
All tiers support 480p and 720p; Pro and Ultra also support 1080p. The default
is Standard, 720p, 12 seconds. Historical MiniMax videos retain their labels.
Text, image and audio references are supported. Video references are rejected
before charging because their input duration adds an upstream cost not covered
by the agreed output-only credit table.

Admin → Settings → **Storage** (Cloudflare R2 / S3). Generated clips are uploaded there,
and **on Cloudflare Workers this is not optional** — there is no disk to fall
back to. Video files are far larger than images were, so budget storage
accordingly. Composer attachments and bundled example media are published to
the same storage first, ensuring video providers receive a downloadable public
URL instead of a localhost or site-relative path.

Every group has a **Test** button that makes one real request, so you find out
a key is wrong before a user does. For Fal and Replicate that request queues a
real render on the cheapest model — it proves the account can reach the video
models, and it costs what one clip costs.

Also worth setting: Payment (Stripe/Creem/PayPal), Email (Resend or Cloudflare
Email) for verification mail, and Google OAuth.

## Make it yours

| What                      | Where                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Name, description, logo   | Admin → Settings → General (`app_name`, `app_description`). Env is the fallback. Logo files in `public/`.  |
| Theme colour              | `src/styles/globals.css` — one `oklch` hue drives accent and neutrals                                      |
| Landing copy              | `messages/{en,zh,es,ar}.json`. Homepage and trend titles are these strings, not `app_name`.                |
| Homepage hero and gallery | `HOME_HERO_DEMOS` and `HOME_GALLERY_DEMOS` in `src/lib/home-demos.ts`. A change ships with a pull request. |
| Chat example clips        | `src/components/agent/prompt-examples.ts`, `public/videos/showcase/generated/`, `woman.mp4`                |
| Blog                      | `/admin/posts`. Database only.                                                                             |
| Clarity, Google Analytics | Admin → Settings → Analytics. Empty or non-alphanumeric `clarity_project_id` does not load Clarity.        |
| Models and prices         | `AGENT_MODEL_OPTIONS` in `src/lib/agent-settings.ts`                                                       |
| Plans and top-ups         | `src/lib/video-pricing.ts` (presets) and Admin → Plans / Top-ups (live catalog)                            |

A category's examples end at the first missing translation, so removing one is
an edit to `messages/*.json` — no code change.

User credits are defined by the 12-second table in `src/lib/agent-settings.ts`.
Each render scales by output duration and rounds its complete cost up to one
whole credit. This is independent of Kie account credits; the composer shows
only the total user credits. See [pricing cutover](docs/plans/2026-10-09-video-pricing-design.md)
for the full catalog, migration, rollback and payment-provider setup.

After the database schema exists, initialize the live catalog:

```bash
pnpm db:init-pricing                # dry-run: print what would be inserted
pnpm db:init-pricing -- --apply     # one-command init for a FRESH database
```

`db:init-pricing` is the new-site path: it seeds all top-up packs and
subscription plans from `src/lib/video-pricing.ts`, plus the hidden retention
product `single_retention_v2` (the row formerly seeded by hand from
`scripts/seed-video-retention-offer.sql`) plus the hidden name-your-price
chips `single_retention_name_499/599/799/999`, and sets the pricing version gate.
It inserts only missing product IDs and never updates existing rows, so it is
safe to re-run — admin catalog edits survive and nothing duplicates. On a
database that already has legacy financial data (credits/orders/subscriptions/
tasks) or a non-current catalog without the version gate, it refuses and
points you at the cutover instead:

```bash
pnpm pricing:update                # read-only preview (existing DBs / cutover)
pnpm pricing:update -- --apply     # legacy -> v2 cutover, with backup + ratio flow
```

The version gate blocks checkout and generation until pricing is installed.
Like `rbac:init`, DB scripts cannot reach remote D1 over libsql: run them
against wrangler's local D1 file (or any sqlite/libsql `DATABASE_URL`) and
copy the rows up, following step 4 below.

## Content, email, and checkout

**Blog.** Articles are rows in `post`, edited at `/admin/posts`. English is
`title` / `description` / `content`; Chinese, Spanish, and Arabic are the
`*_zh`, `*_es`, and `*_ar` columns. A locale is listed only when that language
has both a title and a body; otherwise the page uses English. `/blog` and
`/blog/$slug` send `Cache-Control: public, max-age=300, s-maxage=86400`.
Sitemap and `llms.txt` read the same rows. There are no MDX files under
`src/content/posts/`. Legal pages in `src/content/pages/` are still MDX.
Migration `0013_post_locale_columns.sql` adds the Chinese and Arabic columns
(Spanish columns were already there).

**Name.** Admin `app_name` is the default document title, the email From
display name (kept as-is when the sender address already includes one), and
the chat system-prompt persona. Admin `app_description` is the default meta
description. Empty admin values fall back to `VITE_APP_NAME` /
`VITE_APP_DESCRIPTION`; a missing name falls back to `Uptown`. Homepage,
trend, and blog titles override that default — see the reuse section.

**Recall email.** Admin → Settings → Email → Resend. `email_recall_daily_limit`
(default 80) and `email_recall_monthly_limit` (default 2500) are hard caps,
reserved before each send and shared by overlapping cron runs. `0` sends none.
Candidates are accounts with a paywall or site checkout in the last 24 hours.
A Resend daily or monthly quota error pauses recall until the next UTC midnight.

**Checkout funnel.** The five-stage funnel is unchanged. These extra events are
stored on `funnel_event` with `metadata` (`0015_funnel_event_metadata.sql`):
`checkout_click`, `checkout_signin_redirect`, `checkout_create_failed`,
`checkout_redirected`, `checkout_cancel_return`. Sign-in keeps the chosen
product on the return URL (`checkout`, `checkout_from`) and resumes it.
A cancel return does not.

**Homepage demos.** `/` and `/bulin-47-ai` play `HOME_HERO_DEMOS` and
`HOME_GALLERY_DEMOS` in `src/lib/home-demos.ts`. The live gallery list is empty.
Playback clips are same-origin files under `public/videos/showcase/home/`.
Window Peeper uses `WINDOW_PEEPER_DEMOS`. Burning Bridges clips stay in
`src/blocks/home-landing.tsx` and `public/videos/showcase/burning-bridges/`. I'm so sorry slides are
`public/images/im-so-sorry/`. The `home_demo_video` table
(`0014_home_demo_video.sql`) is an unused leftover and is not read. Do not
drop it just to tidy a production database.

## Deploy to Cloudflare Workers

The build target is `cloudflare_module`; nitro merges your `wrangler.jsonc`
into the generated config. Database is D1.

### 1. Config file

`wrangler.jsonc` is already set for this product:

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| Worker `name`      | `uptown`                                             |
| `workers_dev`      | `true`                                               |
| Public URL         | `https://uptownfunkai.video`                         |
| App name           | `Uptown`                                             |
| D1 `database_name` | `uptown-db`                                          |
| Worker binding     | `DB`                                                 |
| `database_id`      | `00000000-0000-4000-8000-000000000000` (placeholder) |
| Route              | `uptownfunkai.video/*` on zone `uptownfunkai.video`  |
| Media host         | `https://media.uptownfunkai.video` (placeholder)     |

`wrangler d1 create` suggests a binding named after the database — ignore it
and keep `"binding": "DB"`. Commit only the placeholder `database_id`.
`.env.production` stays gitignored. Do not commit secrets.

### 2. Create the database

```bash
npx wrangler login
npx wrangler d1 create uptown-db
```

Paste the returned `database_id` into local `wrangler.jsonc`. Leave
`database_name` as `uptown-db`. Do not commit that real id. Create a new R2
bucket and point public media at `https://media.uptownfunkai.video`.

### 3. Push the schema

Apply the committed files in `drizzle/`. They currently run through
`0015_funnel_event_metadata.sql`. Generate a new file only after you change
`src/config/db/schema.ts`.

```bash
npx wrangler d1 migrations apply uptown-db --remote
```

### 4. Seed roles and permissions

`rbac:init` talks to a database over libsql, which can't reach remote D1. Run
it against wrangler's **local** D1 — a plain SQLite file — and copy the rows
up:

```bash
npx wrangler d1 migrations apply uptown-db --local

# miniflare keeps its own metadata.sqlite next to the database — skip it or
# you will seed the wrong file and the copy below comes out empty.
LOCAL_D1=$(find .wrangler/state -path '*d1*' -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" pnpm rbac:init

sqlite3 "$LOCAL_D1" ".dump role permission role_permission" \
  | grep '^INSERT INTO' | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > /tmp/rbac.sql
npx wrangler d1 execute uptown-db --remote --file=/tmp/rbac.sql
```

### 5. Secrets

Never put these in `vars` — that block is public.

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
openssl rand -base64 32 | npx wrangler secret put CONFIG_ENCRYPTION_KEY
npx wrangler secret put FREERAP_API_KEY
```

`FREERAP_API_KEY` is only for the Dame Hombro page (`/dame-hombro`). The
browser calls `/api/dame-hombro` and never sees the key. For local Node, put
the same name in `.env.development`. Do not add it to `wrangler.jsonc` `vars`.

### 6. Production URL — in two places

```bash
cat > .env.production <<'EOF'
VITE_APP_URL=https://uptownfunkai.video
VITE_APP_NAME="Uptown"
DATABASE_PROVIDER=d1
EOF
```

`wrangler.jsonc` `vars.VITE_APP_URL` is already `https://uptownfunkai.video`.
Both are needed and for different reasons: `.env.production` is read at build
time and baked into the bundle, while `vars` is what the server reads at
runtime. Miss the second and better-auth rejects every sign-in with
`Invalid origin`. `pnpm cf:deploy` stops before building if either file is
missing, the URL is a localhost/placeholder value, or the two URLs do not match.

The custom domain route is already in `wrangler.jsonc`. `workers_dev` stays
on so the Worker can be reached at `*.workers.dev` before the zone exists.
The `uptownfunkai.video` zone must already be in this Cloudflare account
before a custom-domain deploy:

```jsonc
"routes": [
  { "pattern": "uptownfunkai.video/*", "zone_name": "uptownfunkai.video" }
]
```

### 7. Deploy

```bash
pnpm cf:deploy
```

That sources `.env.production`, builds with the Cloudflare preset, and runs
`wrangler deploy`.

### 8. Admin account

Sign up through the site, then grant yourself the role:

```bash
npx wrangler d1 execute uptown-db --remote --command="
  INSERT INTO user_role (id, user_id, role_id)
  SELECT lower(hex(randomblob(16))),
         (SELECT id FROM user WHERE email='you@example.com'),
         (SELECT id FROM role WHERE name='super_admin')"
```

Now open `/admin/settings` on the live site and fill in the providers — the
production database starts empty, and none of your local configuration
travels with the deploy.

### Redeploying

`pnpm cf:deploy` again. Secrets, database and settings persist; only the code
and the baked env change.

## Deploy elsewhere

`pnpm build && pnpm start` runs the Node build on any host. A `Dockerfile` is
included. Postgres and MySQL are supported via `DATABASE_PROVIDER` — run
`pnpm db:setup` after changing it to swap the schema template. Object storage
is still required for generated clips.

## Reusing this template for a new project

This repository is Uptown: Worker `uptown`, D1 `uptown-db`, site
`https://uptownfunkai.video`. `wrangler.jsonc` is committed with a placeholder
`database_id` only. `.env.production` stays gitignored. A further fork needs
its own Worker, D1 database, R2 bucket, and zone.

Fill in Admin → Settings before launch: app name, app description, Clarity
(`clarity_project_id` on the Analytics tab; empty or non-alphanumeric stays off),
Google Analytics, Resend, Stripe, and R2. Homepage clips are
`src/lib/home-demos.ts`. Articles are `/admin/posts`.

These are still this product, in code. Changing them is a code change:

- Burning Bridges page and links: `src/routes/burning-bridges-ai.tsx`,
  `src/blocks/header.tsx`, `src/blocks/footer.tsx`,
  the Bridges clips in
  `src/blocks/home-landing.tsx`, `src/lib/burning-bridges-reference.ts`
  (the reference URL is `uptownfunkai.video`), `public/videos/reference/`,
  `public/audio/burning-bridges-party-2m37s-15s.m4a`, and the
  `/burning-bridges-ai` entry in `src/routes/sitemap[.]xml.ts`.
- Bulin 47 homepage and `/bulin-47-ai` alias: `src/routes/index.tsx`,
  `src/routes/bulin-47-ai.tsx`, `src/lib/bulin-reference.ts`,
  `src/lib/create-video.ts`, `public/audio/bulin-reference-*.m4a`.
- Product copy in `messages/{en,zh,es,ar}.json` (`home.*`, `trend.*`,
  `effect.*`, `recast.*`, `create.bulin_*`, `create.bridges_*`, and most of
  `landing.*`). Homepage and trend `<title>` / description come from these
  keys. Blog title suffixes and trend/landing JSON-LD site names read the
  admin `app_name` first (via `src/lib/site-name.ts`), falling back to
  `VITE_APP_NAME` / `Uptown` — renaming in Admin → Settings is enough, no
  rebuild needed for the name.
- Bulin 47 homepage demos: `src/lib/home-demos.ts`, plus the files those
  constants point at under `public/videos/showcase/home/`.
- Chat examples: `public/videos/showcase/generated/`,
  `public/videos/showcase/woman.mp4`, and
  `src/components/agent/prompt-examples.ts`.
- uptownfunkai.video directory badges in `src/components/site-footer.tsx`.
- The chat system prompt in `src/modules/agent/service.ts` (only the name is
  the admin app name).
- `TREND_PAGE_UPDATED_AT` in `src/lib/trend-page-meta.ts` (`2026-10-11`).

## Template optimizations for a new site

1. **Pricing init (one command)** — `pnpm db:init-pricing -- --apply`
   (dry-run without `--apply`). See the catalog section above. Re-running is
   a no-op that preserves admin edits.
2. **Site name from admin** — blog (`/blog`, `/blog/$slug`) title suffixes
   and trend/landing JSON-LD (`src/lib/trend-page-meta.ts`, used by `/`,
   `/bulin-47-ai`, `/burning-bridges-ai`) resolve the DB `app_name` first,
   then `VITE_APP_NAME`, then `Uptown` (`resolveSiteName`). When the admin
   name matches the env name (e.g. both `Uptown`), output is unchanged.
   `VITE_APP_NAME` is still worth setting correctly as the fallback.
3. **Config import** — Admin → Settings has an “Import config (JSON)” card
   (guarded by `admin.settings.write`, same as other settings saves):
   paste or upload JSON, or download the template
   (`GET /api/admin/config/import` returns every known key with an empty
   value). Only keys defined in `src/modules/config/settings.ts` are
   accepted; unknown keys are rejected and listed, blank/masked values are
   skipped, and accepted values are saved through `saveConfigs` — secrets
   are encrypted at rest, protected keys are dropped, and only the provided
   keys are overwritten, so re-importing is safe. It writes config rows
   only — never orders or users. Validation lives in
   `src/modules/config/config-import.ts`.
4. **Launch checklist** — after deploying, verify the new site read-only:

   ```bash
   pnpm launch:check -- https://your-domain.com
   # or: LAUNCH_CHECK_URL=https://your-domain.com pnpm launch:check
   ```

   Checks `/`, `/pricing`, `/blog`, terms/privacy in en/zh/es/ar,
   `/sitemap.xml`, `/robots.txt`, and `/api/top-up-products` (must be
   non-empty with `single_v2`/`duo_v2`; `single_retention_v2` and the
   name-your-price chips are hidden from that API by design. Exits non-zero on any
   failure.

## Commands

| Command                | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `pnpm dev`             | Dev server on port 3000                                           |
| `pnpm build`           | Production Node build                                             |
| `pnpm start`           | Run the production build                                          |
| `pnpm test`            | Unit tests (Vitest)                                               |
| `pnpm cf:build`        | Production Cloudflare Workers build                               |
| `pnpm cf:deploy`       | Build and deploy to Cloudflare Workers                            |
| `pnpm db:init-pricing` | Seed pricing catalog on a fresh DB (dry-run; `-- --apply` writes) |
| `pnpm launch:check`    | Read-only launch checklist against a base URL                     |
| `pnpm db:push`         | Sync schema to the database — dev only                            |
| `pnpm db:generate`     | Write a migration to `drizzle/`                                   |
| `pnpm db:migrate`      | Apply pending migrations                                          |
| `pnpm db:studio`       | Drizzle Studio                                                    |
| `pnpm rbac:init`       | Seed roles and permissions, optional admin                        |

## Structure

```
src/
├── modules/agent/          # Agent runtime, tools, provider polling, paywall
├── modules/ai-tasks/       # Durable task status and credit refund lifecycle
├── modules/chats/          # Chat history, sharing, and generated-media library
├── core/ai/                # gRouter, Fal, and Replicate adapters
├── routes/(agent)/         # Chat, library, and editor surfaces
├── routes/api/agent/       # Chat SSE, history/status, stop, library, CRUD
├── routes/admin/           # Settings, posts, effects, funnel
├── routes/blog/            # Published posts from the database
├── components/agent/       # Composer, transcript, preview pane, sidebar
├── lib/agent-settings.ts   # Model catalog, capabilities, prices, route mapping
└── config/pricing.ts       # Plans and top-up packs

messages/{en,zh,es,ar}.json # All copy, flat dot-keyed
public/videos/showcase/home/       # Homepage clips referenced by src/lib/home-demos.ts
public/videos/showcase/generated/ # Chat composer examples, plus woman.mp4
```

## License

Proprietary. See [LICENSE](./LICENSE).

**ShipAny** — [shipany.ai](https://shipany.ai)
