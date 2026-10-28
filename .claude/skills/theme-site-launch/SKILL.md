---
name: theme-site-launch
description: "First launch of a NEW product fork of this Uptown template onto a new domain/Worker/D1/brand. Not for daily redeploy (use deploy-cloudflare). Covers new repo, strip parent campaign leftovers, Cloudflare Worker/D1/R2, committing wrangler.jsonc with real D1 id + zone_name routes, .env.production (gitignored), migrations and db:init-pricing, admin settings including create_reference_video_*, Dynadot nameservers, Stripe webhook, Google OAuth, GA4/Clarity, and pnpm cf:deploy. Use when forking this template or first-deploying a themed video site."
argument-hint: "[--domain=example.com --worker=name --db=name]"
user-invocable: true
---

# Theme site launch — $ARGUMENTS

**Fork workflow (this skill only):** first production launch of a **new product** forked from this Uptown template onto a **new domain / new Worker / new D1 / new brand**. Live parent today: Worker `uptown`, site [uptownfunkai.video](https://uptownfunkai.video). The human checklist is `docs/theme-site-launch.md`.

**Not this skill:** daily redeploy of an already-live Worker — that is `/deploy-cloudflare` / `pnpm cf:deploy` (Node 22+). Do not run the full fork checklist for a silent ship.

This path is D1. Postgres via Hyperdrive stays on `/deploy-cloudflare`.

Human steps are only: new repo, buy the domain, Stripe KYC plus API keys, reconnect Cloudflare with Full access, Google/Clarity login or ids, and a copyright check. Everything else in this skill is an API or script the agent runs. Do not send the user to mint R2 keys, click through Resend DNS, or sign up on the site and then promote themselves.

## Rules

- This template product is Worker `uptown` and D1 `uptown-db`. A further fork needs a **new** Worker name and a **new** D1 name.
- **`wrangler.jsonc` is tracked in git.** Template/main may keep placeholder `database_id` `00000000-0000-4000-8000-000000000000`. After `wrangler d1 create` on a LIVE product fork, **commit** the real `database_id` and `routes` (with `zone_name`) so box silent redeploy matches git. `.env.production` stays gitignored forever. Never commit secrets, Stripe/Dynadot/Resend keys, or secret values. Provider secrets go in admin settings or `wrangler secret put`, never in `vars` (public).
- **DNS / routing primary path:** Cloudflare zone + Worker routes with `zone_name`, e.g. `{ "pattern": "example.com/*", "zone_name": "example.com" }` and optionally `www`. Do **not** recommend `custom_domain: true` as the primary path.
- Create reference MP4s: Admin D1 keys `create_reference_video_url` / `create_reference_video_url_12s` / `create_reference_video_url_15s`. Probe `Range: bytes=0-1` → expect **HTTP 206** before trusting a URL. Point the new fork at **its own** media host — not parent `media.uptownfunkai.video` unless intentional.
- Ask for secret values on the secret card. Do not echo them, do not write them into the repo, and do not put them in the transcript.
- `pnpm cf:deploy` (`scripts/cf-deploy.sh`) requires Node 22+, sources `.env.production`, requires an `https` `VITE_APP_URL` (no localhost, no `<placeholder>`), and requires the same URL in `wrangler.jsonc` `vars.VITE_APP_URL`.
- `getAllConfigs()` is `{ ...envConfigs, ...dbConfigs }` (`src/modules/config/service.ts`). A `config` row wins over the same key from env. Admin → Settings is where provider credentials live.
- Uploads use admin `r2_*` fields through the S3-compatible client in `src/modules/storage/service.ts` (`R2Provider` / `aws4fetch`). The commented `r2_buckets` binding in `wrangler.example.jsonc` is unused. Env `STORAGE_*` names are not `r2_*`, so they do not configure uploads.
- Keep the D1 binding name `DB`. `wrangler d1 create` prints a different binding name; ignore that suggestion.
- Nitro schedules `email-recall` every five minutes (`vite.config.ts` `scheduledTasks: { '*/5 * * * *': ['email-recall'] }`, handler `src/tasks/email-recall.ts`). `pnpm cf:build` emits the Cloudflare Cron Trigger. Leave the schedule. Sends stay off until admin `email_recall_enabled` is `true`.
- Confirm once before the **first-ever** production deploy of a brand-new Worker. When the owner already asked to ship this first launch after setup, or on later redeploys, run `pnpm cf:deploy` without a redundant yes.
- Default `super_admin` email to seed: `admin@example.com`. Create that user while seeding RBAC. The password comes from the secret card.

Parse `$ARGUMENTS` for `--domain=`, `--worker=`, `--db=`. Otherwise ask once for the domain, worker name, and D1 name, then proceed.

## 1. New repo

The human creates the Git remote. Brand edits are normal commits in that repo. On the product fork, commit the real `wrangler.jsonc` (D1 id + routes) after create; keep `.env.production` gitignored.

## 2. Strip template leftovers (Uptown / Bulin / Burning Bridges)

This template product is **Uptown / uptownfunkai.video**. A new theme must replace campaign routes, reference media, demos, and copy in code — do **not** leave bulin/bridges URLs or media hosts from the parent product. Admin `app_name` does not rewrite those paths. The human copyright check has to pass before new media ships.

Checklist of parent leftovers still on `main` (strip or replace for the fork):

Routes and chrome:

- `src/routes/index.tsx` — homepage
- `src/routes/bulin-47-ai.tsx` — `/bulin-47-ai` (homepage canonical; omitted from the sitemap on purpose)
- `src/routes/burning-bridges-ai.tsx` — `/burning-bridges-ai`
- `src/routes/sitemap[.]xml.ts` — `STATIC_PATHS` includes `/burning-bridges-ai`
- `src/blocks/header.tsx`, `src/blocks/footer.tsx`, `src/blocks/home-landing.tsx`, `src/blocks/create-video.tsx` (`campaign: 'bulin' | 'bridges'`)

Reference media (do not keep serving the parent bucket or uptownfunkai.video / media.uptownfunkai.video unless intentional; set Admin `create_reference_video_*` on the new media host after Range-206 probe):

- `src/lib/bulin-reference.ts` — freestyle reference MP4s stay on the template `r2.dev` host (generation fetch), `/audio/bulin-reference-*.m4a`. `SOLO_DEMO` and `WEREWOLF_OFFER_MEDIA` are same-origin under `public/videos/showcase/home/`
- `src/lib/bulin-trio-reference.ts` — trio reference video and audio stay on that host. `TRIO_DEMO` is same-origin under `public/videos/showcase/home/`
- `src/lib/burning-bridges-reference.ts` — `https://uptownfunkai.video/videos/reference/burning-bridges-party-2m37s-15s.mp4`
- `src/lib/create-video.ts`, `src/modules/agent/tools.ts`, `src/routes/api/agent/create.ts`, `src/routes/api/agent/create-tasks.ts`
- `src/routes/api/payment/video-retention-offer.ts` — campaign enum `bulin` | `bridges`
- `public/audio/bulin-reference-audio.m4a`, `bulin-reference-from-4s-15s-v1.m4a`, `bulin-reference-from-7s-15s-v1.m4a`, `bulin-reference-full-46s-v1.m4a`
- `public/audio/burning-bridges-party-2m37s-15s.m4a`
- `public/videos/reference/burning-bridges-party-2m37s-15s.mp4`
- Homepage hero/gallery clips: `src/lib/home-demos.ts` (`HOME_HERO_DEMOS`, `HOME_GALLERY_DEMOS`). Playback files are `/videos/showcase/home/…`. Burning Bridges showcase clips are `/videos/showcase/burning-bridges/bridges-*.mp4`. Change them in code and deploy. The `home_demo_video` table is unused.
- Chat examples: `public/videos/showcase/generated/`, `public/videos/showcase/woman.mp4`, `src/components/agent/prompt-examples.ts`

Copy and chrome that is not the admin name:

- `messages/{en,zh,es,ar}.json` — `home.*`, `trend.*`, `effect.*`, `recast.*`, `create.bulin_*`, `create.bridges_*`, and most of `landing.*`. Add any new key to all four files.
- `src/components/site-footer.tsx` — uptownfunkai.video directory badges
- `src/lib/trend-page-meta.ts` — `TREND_PAGE_UPDATED_AT` is `2026-10-11`

`systemPrompt` in `src/modules/agent/service.ts` takes the persona name from admin `app_name` (else `VITE_APP_NAME`, else `Uptown`). Change that function only when the assistant's behavior should change.

Tests that pin the old media: `src/lib/create-video.test.ts`, `src/modules/agent/create-video.test.ts`, `src/routes/api/agent/-create.test.ts`.

## 3. Cloudflare Full access, then Worker, D1, and R2

The human reconnects Cloudflare with **Full access** before this step. A 401/403 that names a missing permission means stop and ask for that reconnect. Do not ask them to create an R2 API token in the dashboard.

```bash
npx wrangler whoami   # account id; skip login when this account is already authorized
npx wrangler d1 create <db-name>
```

Create the bucket with the Cloudflare API (`Workers R2 Storage Write`):

```http
POST /accounts/<account_id>/r2/buckets
{ "name": "<bucket-name>" }
```

`<account_id>` comes from `wrangler whoami`. It stays out of git.

Then create an account API token scoped to that bucket (`Account API Tokens Write`). List groups first and use the live id whose name is `Workers R2 Storage Bucket Item Write`:

```http
GET /accounts/<account_id>/tokens/permission_groups
POST /accounts/<account_id>/tokens
```

```json
{
  "name": "<product>-r2",
  "policies": [
    {
      "effect": "allow",
      "permission_groups": [{ "id": "<group id from the list>" }],
      "resources": {
        "com.cloudflare.edge.r2.bucket.<account_id>_default_<bucket-name>": "*"
      }
    }
  ]
}
```

From the create-token response, the S3 access key id is the token `id`. The S3 secret access key is the hex SHA-256 of the token `value`. Compute the hash locally, write both into admin `r2_access_key` and `r2_secret_key` later, and discard the token value. Do not print either secret.

Turn on the managed public hostname and read it back for `r2_domain`:

```http
PUT /accounts/<account_id>/r2/buckets/<bucket-name>/domains/managed
{ "enabled": true }
GET /accounts/<account_id>/r2/buckets/<bucket-name>/domains/managed
```

`r2_endpoint` is `https://<account_id>.r2.cloudflarestorage.com`. `r2_domain` is `https://<r2.dev host>` with no trailing slash. These are admin fields, not a Wrangler binding.

## 4. `wrangler.jsonc` and `.env.production`

```bash
test -f wrangler.jsonc || cp wrangler.example.jsonc wrangler.jsonc
```

Set `name`, `vars.DATABASE_PROVIDER` = `"d1"`, `vars.VITE_APP_URL` = `https://<domain>`, `vars.VITE_APP_NAME`, and:

```jsonc
"d1_databases": [{
  "binding": "DB",
  "database_name": "<db-name>",
  "database_id": "<uuid from d1 create>",
  "migrations_dir": "drizzle"
}]
```

**Commit** that real `database_id` in `wrangler.jsonc` on the live product fork (private repo). Template/main may keep placeholder `00000000-0000-4000-8000-000000000000` until create. Never put secrets in `vars`.

DNS / routing — primary path is zone + Worker routes with **`zone_name`** (zone must already be Active). Do not use `custom_domain: true` as the primary path:

```jsonc
"routes": [
  { "pattern": "<domain>/*", "zone_name": "<domain>" },
  { "pattern": "www.<domain>/*", "zone_name": "<domain>" }
]
```

`.env.production` (gitignored forever), same URL. Never commit this file or secret values from it:

```bash
VITE_APP_URL=https://<domain>
VITE_APP_NAME=<product name>
DATABASE_PROVIDER=d1
```

Worker secrets, generated locally and piped. Names only in the transcript:

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
openssl rand -base64 32 | npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

Keep `CONFIG_ENCRYPTION_KEY` stable. Rotating it orphans admin secrets already encrypted in `config`.

`auth_secret`, `database_url`, `database_provider`, and `video_credit_pricing_version` are protected: the admin UI cannot overwrite them.

## 5. Zone and Dynadot nameservers

Create the zone with the Cloudflare API (`Zone Zone Edit` / `Zone DNS Edit`):

```http
POST /zones
{ "name": "<domain>", "account": { "id": "<account_id>" }, "type": "full" }
```

Read the two assigned nameservers from the zone.

The human has already bought the domain. Ask for the Dynadot API key on the secret card. Set nameservers with Dynadot API3 `command=set_ns` (`ns0`, `ns1` = the Cloudflare pair). Dynadot documents that those hosts must already exist on the Dynadot account; if `set_ns` rejects them, register the hosts via the Dynadot nameserver API and retry. Do not put the API key in the query string of a logged command, in git, or in the transcript.

Wait until the Cloudflare zone status is Active. A deploy that says the host is not a zone in the account means this step is not done.

## 6. Migrations, RBAC, pricing, and the admin user

Apply the committed SQL in `drizzle/`. The journal currently ends at `0016_retention_name_price`. Generate a new file only after a change to `src/config/db/schema.ts`.

`pnpm db:init-pricing` uses `db()`, and `DATABASE_PROVIDER=d1` only works inside a Worker. On a laptop, apply migrations remotely, then seed a **fresh** local D1 file and copy rows up. `scripts/init-pricing.ts` inserts missing product ids and never updates existing rows. Dry-run omits `--apply`. It refuses a database that has legacy financial rows and no current version gate (`video_credit_pricing_version` = `seedance-12s-v2`); that case is `pnpm pricing:update`, not this skill.

Seed `admin@example.com` as `super_admin` in the same local run. Take the password from the secret card into `ADMIN_PASSWORD`. Do not write that password down.

```bash
npx wrangler d1 migrations apply <db-name> --remote
npx wrangler d1 migrations apply <db-name> --local
LOCAL_D1=$(find .wrangler/state -path '*d1*' -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" \
  pnpm rbac:init --admin-email=admin@example.com --admin-password="$ADMIN_PASSWORD"
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" pnpm db:init-pricing
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" pnpm db:init-pricing -- --apply

sqlite3 "$LOCAL_D1" ".dump role permission role_permission" \
  | grep '^INSERT INTO' | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > /tmp/rbac.sql
npx wrangler d1 execute <db-name> --remote --file=/tmp/rbac.sql

sqlite3 "$LOCAL_D1" ".dump credit_top_up_product subscription_plan" \
  | grep '^INSERT INTO' | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > /tmp/pricing.sql
npx wrangler d1 execute <db-name> --remote --file=/tmp/pricing.sql
npx wrangler d1 execute <db-name> --remote --command \
  "INSERT OR IGNORE INTO config (name, value) VALUES ('video_credit_pricing_version', 'seedance-12s-v2')"
```

Copy the new user up (user row, then account row, then `user_role` joined to the remote `super_admin` role id). Unset `ADMIN_PASSWORD` when the seed finishes. Copy pricing off a fresh local D1 only. A dirty local `config` table must not be dumped onto production.

```bash
{
  sqlite3 "$LOCAL_D1" ".dump user" | grep -E '^INSERT INTO user '
  sqlite3 "$LOCAL_D1" ".dump account" | grep -E '^INSERT INTO account '
} | sed 's/^INSERT INTO/INSERT OR IGNORE INTO/' > /tmp/admin-seed.sql
npx wrangler d1 execute <db-name> --remote --file=/tmp/admin-seed.sql
npx wrangler d1 execute <db-name> --remote --command="
INSERT OR IGNORE INTO user_role (id, user_id, role_id)
SELECT lower(hex(randomblob(16))), u.id, r.id
FROM user u, role r
WHERE u.email = 'admin@example.com' AND r.name = 'super_admin'"
```

## 7. `pnpm cf:deploy`

Confirm once only for the first-ever production deploy of this brand-new Worker. If the owner already asked to ship after the setup steps above, run without a second yes:

```bash
pnpm cf:deploy
```

That build also registers the `*/5` email-recall cron. After deploy, smoke `https://<domain>/` and `https://<domain>/api/config/public` (both 200). Then:

```bash
pnpm launch:check -- https://<domain>
```

## 8. Admin settings

Sign in as `admin@example.com`. Open `/admin/settings`. Keys below are the `name` fields in `src/modules/config/settings.ts`. Saving through `/admin/settings` or `POST /api/admin/config` (import: `GET /api/admin/config/import` for the empty template, guarded by `admin.settings.write`) writes the `config` table. Secrets are encrypted when `CONFIG_ENCRYPTION_KEY` is set. A saved row overrides env for that key. `saveConfigs` clears the one-hour cache in the isolate that saved; other isolates can keep the previous value for up to an hour.

Set `app_url` to `https://<domain>` (no path). Auth `baseURL` is admin `app_url`, then `VITE_APP_URL`.

| Group | Keys |
| --- | --- |
| App | `app_name`, `app_description`, `app_url` |
| Stripe | `stripe_enabled` = `true`, `stripe_publishable_key`, `stripe_secret_key`, `stripe_signing_secret`. Set `default_payment_provider` to `stripe`. Values come from the secret card after the human finishes KYC. |
| R2 | `r2_access_key`, `r2_secret_key`, `r2_bucket_name`, `r2_endpoint`, `r2_domain`, optional `r2_upload_path`. Fill these from the API step above. |
| Video | `kie_api_key` and/or `apimart_api_key`. Set `default_video_provider` to `kie` or `apimart`. `auto` does not select APIMart. Create refs: `create_reference_video_url`, `create_reference_video_url_12s`, `create_reference_video_url_15s` on the fork's own media host; probe `Range: bytes=0-1` → 206 before trusting. |
| Google | `google_auth_enabled`, `google_client_id`, `google_client_secret`, optional `google_one_tap_enabled` |
| Analytics | `google_analytics_id`. `clarity_project_id` — empty or non-alphanumeric skips the snippet (`/^[a-z0-9]+$/i` in `src/routes/__root.tsx`) |
| Resend | `resend_api_key`, `resend_sender_email`. `email_provider` defaults to `resend`. Recall caps on the same card, not `resend_*` names: `email_recall_daily_limit` (80), `email_recall_monthly_limit` (2500), `email_recall_enabled` (leave false until you mean to send) |

Homepage clips: `src/lib/home-demos.ts`. Articles: `/admin/posts`.

## 9. Resend

Prefer the API key. The human supplies `resend_api_key` on the secret card. Do not walk them through the Resend dashboard for DNS.

```http
POST https://api.resend.com/domains
Authorization: Bearer <resend_api_key>
{ "name": "<domain>" }
```

The response lists the DNS records (name, type, value, ttl, and MX priority). Publish those records with an API, then `POST /domains/<domain_id>/verify` and poll `GET /domains/<domain_id>` until the domain is verified.

- Zone already Active on Cloudflare: `POST /zones/<zone_id>/dns_records` for each record. Leave Resend TXT, MX, and CNAME records unproxied (`proxied: false`).
- DNS still served at Dynadot: Dynadot API3 `command=set_dns2` with `add_dns_to_current_setting=1` so the call appends records. A `set_dns2` without that flag replaces the domain's DNS.

`resend_sender_email` must be on that verified domain. Store the API key only as admin `resend_api_key`.

## 10. Stripe webhook

The human completes Stripe KYC and supplies the API keys on the secret card. Create the endpoint with the Stripe API. URL:

`https://<domain>/api/payment/notify/stripe`

Route: `src/routes/api/payment/notify/$provider.ts`. The handler accepts `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Other types throw. Store the returned signing secret as `stripe_signing_secret`. Do not write the key into git.

## 11. Google OAuth, GA4, and Clarity

The human logs in or supplies the ids on the secret card. Authorized redirect URI to register:

`https://<domain>/api/auth/callback/google`

JavaScript origin: `https://<domain>`. better-auth is mounted at `src/routes/api/auth/$.ts` and uses `baseURL` from `app_url`.

Write `google_client_id`, `google_client_secret`, `google_analytics_id`, and `clarity_project_id`. No rebuild. Database values win over env.

Run `pnpm cf:deploy` again only when `VITE_APP_URL` or other baked `VITE_*` values change. Admin rows do not require a rebuild.
