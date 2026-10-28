---
name: theme-site-launch
description: "First launch of a NEW product cloned from this Uptown template onto a new domain/Worker/D1/brand. Domain→Cloudflare FIRST (Spaceship NS), then parallel brand+icons PR + D1/R2 while DNS propagates. New private GitHub repo via box GITHUB_TOKEN (create + push). Admin zh6856660@gmail.com with vault password (agent browser-tests login). Stripe keys/webhook are human. Post-deploy parallel: Google OAuth, GA4, Admin fill, CF Email Routing support@. Not for daily redeploy (use deploy-cloudflare)."
argument-hint: "[--domain=example.com --worker=name --db=name --repo=owner/name]"
user-invocable: true
---

# Theme site launch — $ARGUMENTS

**This skill only:** first production launch of a **new product** from this Uptown template onto a **new domain / new Worker / new D1 / new brand**. Live parent: Worker `uptown`, [uptownfunkai.video](https://uptownfunkai.video). Human checklist: `docs/theme-site-launch.md`.

**Not this skill:** daily redeploy of an already-live Worker → `/deploy-cloudflare` / `pnpm cf:deploy` (Node 22+).

Parse `$ARGUMENTS` for `--domain=`, `--worker=`, `--db=`, `--repo=`. Otherwise ask once for domain, worker name, D1 name, and new private repo name (`owner/name`), then proceed.

## Owner-agreed order (do not reorder the serial spine)

1. **Domain → Cloudflare first** (zone + Spaceship NS + wait Active). DNS needs wall-clock time; start before code/infra that depends on resolution.
2. **New private GitHub repo** isolated from the template: clone template locally → `gh repo create` private with box `GITHUB_TOKEN` → push. Not the GitHub “Fork” button.
3. **Parallel while DNS propagates:** (A) full brand migration + 9 icon options → owner picks one → **one PR**; (B) D1 + R2 + tracked `wrangler.jsonc` + secrets + `.env.production`.
4. **Gate:** zone Active, brand PR merged (or on the deploy branch).
5. Migrations + pricing + **admin** `zh6856660@gmail.com` (password in vault).
6. `pnpm cf:deploy` (Node 22+).
7. Agent browser: vault-fill admin login test (owner does not type the password).
8. **Parallel post-deploy (browser/API):** Google OAuth client + Admin fill; GA4 property + Admin fill; R2 keys into Admin if not already; CF Email Routing `support@<domain>` → admin inbox; Resend domain DNS if sending mail. **Stripe keys + webhook = human** — skip creating them; only note Admin keys when the owner pastes values.

## Parallelism

| Parallel | Serial dependency |
| --- | --- |
| Brand strip + icons (one PR) ∥ D1 create ∥ R2 create+token ∥ NS propagation wait | After zone exists / repo exists |
| Google OAuth ∥ GA4 ∥ Admin config fill ∥ Email Routing ∥ Resend DNS | After Deploy + admin login works |
| Stripe | Human-only; no agent Stripe dashboard work |

## Rules

- New Worker name and new D1 name (not `uptown` / `uptown-db`). Binding stays `DB`.
- **`GITHUB_TOKEN`:** box env already set. Use it for **both** `gh repo create` (private) and `git push`. Do not ask the owner for another PAT. Never echo the token.
- **`wrangler.jsonc` is tracked.** After `wrangler d1 create`, **commit** real `database_id` + `routes` with `zone_name`. `.env.production` stays gitignored. Never put secrets in `vars`.
- **DNS / routing primary path:** Cloudflare zone + Worker routes with `zone_name`. Do **not** treat `custom_domain: true` as primary. Zone must be **Active** before routes deploy.
- **Registrar:** prefer **Spaceship** in the browser (owner usually has the domain there). Dynadot API3 `set_ns` only if the domain is on Dynadot. Spaceship login is often password-only (no Google SSO) — use vault / Secure Form / box handoff.
- **Admin:** email **`zh6856660@gmail.com`**. Generate password with Vault `save` kind `login` for `https://<domain>/sign-in` (or sign-up URL used by the app); never invent a password; never put it in chat or the PR body. Browser login test: computerUse with vault fill references. Report only success/failure.
- **Stripe:** human configures API keys and webhook (`https://<domain>/api/payment/notify/stripe`). Agent does not create the Stripe webhook. If the owner pastes publishable/secret/signing values, write Admin keys only — still never echo secrets.
- Create reference MP4s: Admin `create_reference_video_url` / `_12s` / `_15s`. Probe `Range: bytes=0-1` → **206**. Own media host — not parent `media.uptownfunkai.video` unless intentional.
- `pnpm cf:deploy` requires Node 22+, matching https `VITE_APP_URL` in `.env.production` and `wrangler.jsonc` vars.
- Confirm once only for the **first-ever** production deploy of a brand-new Worker; if the owner already asked to ship this launch, run without a second yes.
- Ask for secret values on the secret card / vault. Do not echo them into the repo, transcript, or chat.

---

## Phase 0 — Preconditions (human)

- Domain purchased (usually Spaceship).
- Cloudflare account available (Full access for R2 API token create).
- Box `GITHUB_TOKEN` present (`test -n "$GITHUB_TOKEN"`).
- Copyright OK for new theme media.
- Stripe KYC can finish in parallel; keys/webhook stay human.

---

## Phase 1 — Domain into Cloudflare FIRST (serial)

Start immediately; do not wait for brand PR.

```bash
npx wrangler whoami   # account id
```

```http
POST /zones
{ "name": "<domain>", "account": { "id": "<account_id>" }, "type": "full" }
```

Read the two assigned Cloudflare nameservers.

**Spaceship (preferred):** browser → domain DNS/nameservers → set both CF NS. Wait until Cloudflare zone status is **Active**.

**Dynadot fallback:** API3 `command=set_ns` with secret-card API key (never log the key).

A later deploy that says the host is not a zone means this phase is incomplete.

While waiting for Active, run Phase 2 and Phase 3 in parallel.

---

## Phase 2 — New private GitHub repo (`GITHUB_TOKEN`)

Isolate from the template history the owner wants separated:

```bash
# Example shape — adjust paths/names from $ARGUMENTS
test -n "$GITHUB_TOKEN"
gh auth status   # should use GITHUB_TOKEN / gh config on the box
gh repo create <owner>/<new-repo> --private --confirm
# Working tree: clone or copy from this template checkout into a clean directory,
# set remote to the new private repo, push main.
git remote set-url origin https://github.com/<owner>/<new-repo>.git
# Prefer: GIT_ASKPASS / gh credential helper so the token is not in the remote URL.
git push -u origin main
```

Do **not** use GitHub’s Fork button when the owner asked for a clean private push. Do **not** put `GITHUB_TOKEN` in the remote URL in transcripts or committed files.

All brand/wrangler commits for the new product happen in this new repo.

---

## Phase 3 — Parallel while DNS propagates

### 3A — Brand migration + icons (one PR)

Strip parent Uptown / Bulin / Burning Bridges leftovers. Replace campaign routes, reference media, demos, and copy. Admin `app_name` does not rewrite those paths.

**Icons:** generate **9** favicon/app-icon candidates (letter / mark / theme-color variants). Show the owner for review; commit only the chosen set into the same PR as brand.

Checklist of parent leftovers still on template `main` (strip or replace):

Routes and chrome:

- `src/routes/index.tsx`
- `src/routes/bulin-47-ai.tsx` — `/bulin-47-ai`
- `src/routes/burning-bridges-ai.tsx` — `/burning-bridges-ai`
- `src/routes/sitemap[.]xml.ts`
- `src/blocks/header.tsx`, `src/blocks/footer.tsx`, `src/blocks/home-landing.tsx`, `src/blocks/create-video.tsx`

Reference media / demos:

- `src/lib/bulin-reference.ts`, `src/lib/bulin-trio-reference.ts`, `src/lib/burning-bridges-reference.ts`
- `src/lib/create-video.ts`, `src/modules/agent/tools.ts`, `src/routes/api/agent/create.ts`, `src/routes/api/agent/create-tasks.ts`
- `src/routes/api/payment/video-retention-offer.ts`
- `public/audio/bulin-reference-*.m4a`, `public/audio/burning-bridges-party-2m37s-15s.m4a`
- `public/videos/reference/burning-bridges-party-2m37s-15s.mp4`
- `src/lib/home-demos.ts` + `public/videos/showcase/home/`, `burning-bridges/`, `generated/`, `woman.mp4`
- `src/components/agent/prompt-examples.ts`

Copy:

- `messages/{en,zh,es,ar}.json` — `home.*`, `trend.*`, `effect.*`, `recast.*`, `create.bulin_*`, `create.bridges_*`, most of `landing.*`
- `src/components/site-footer.tsx`
- `src/lib/trend-page-meta.ts`

`systemPrompt` in `src/modules/agent/service.ts` takes persona from admin `app_name`. Change behavior only when asked.

Open **one** PR for brand + chosen icons. Merge before (or as part of) first branded production deploy.

### 3B — D1, R2, wrangler, secrets

Needs Cloudflare Full access for R2 token create. Prefer API (not dashboard click-ops) for R2.

```bash
npx wrangler d1 create <db-name>
```

```http
POST /accounts/<account_id>/r2/buckets
{ "name": "<bucket-name>" }
```

Create account API token scoped to that bucket (`Workers R2 Storage Bucket Item Write`). Access key id = token `id`. Secret access key = hex SHA-256 of token `value`. Discard the raw token value after hashing. Enable managed public hostname; set `r2_endpoint` = `https://<account_id>.r2.cloudflarestorage.com`, `r2_domain` = `https://<r2.dev host>` (no trailing slash).

```bash
test -f wrangler.jsonc || cp wrangler.example.jsonc wrangler.jsonc
```

Set `name`, `database_name`, real `database_id`, `vars.DATABASE_PROVIDER` = `d1`, `vars.VITE_APP_URL`, `vars.VITE_APP_NAME`, `migrations_dir` = `drizzle`, and routes (only deploy these once zone is Active):

```jsonc
"routes": [
  { "pattern": "<domain>/*", "zone_name": "<domain>" },
  { "pattern": "www.<domain>/*", "zone_name": "<domain>" }
]
```

**Commit** `wrangler.jsonc` on the new private repo. `.env.production` (gitignored):

```bash
VITE_APP_URL=https://<domain>
VITE_APP_NAME=<product name>
DATABASE_PROVIDER=d1
```

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
openssl rand -base64 32 | npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

Keep `CONFIG_ENCRYPTION_KEY` stable after first set.

Hold Admin `r2_*` values for Phase 7/8 (no need to rebuild for Admin rows).

---

## Phase 4 — Gate

Before custom-domain deploy:

- [ ] Cloudflare zone **Active**
- [ ] Brand+icons PR merged (or deploy branch includes it)
- [ ] `wrangler.jsonc` committed with real D1 id + `zone_name` routes
- [ ] `.env.production` URL matches `wrangler.jsonc` vars

---

## Phase 5 — Migrations, pricing, admin user

Journal through current tip in `drizzle/meta/_journal.json` (apply all pending).

```bash
npx wrangler d1 migrations apply <db-name> --remote
npx wrangler d1 migrations apply <db-name> --local
LOCAL_D1=$(find .wrangler/state -path '*d1*' -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)
```

Vault-generate admin password for `zh6856660@gmail.com` (site `https://<domain>`). Pass into seed via env only; never echo:

```bash
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" \
  pnpm rbac:init --admin-email=zh6856660@gmail.com --admin-password="$ADMIN_PASSWORD"
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" pnpm db:init-pricing
DATABASE_PROVIDER=sqlite DATABASE_URL="file:$LOCAL_D1" pnpm db:init-pricing -- --apply
```

Copy `role` / `permission` / `role_permission`, pricing tables, `config.video_credit_pricing_version` = `seedance-12s-v2`, and user + account + `user_role` for `zh6856660@gmail.com` up to remote D1 (`INSERT OR IGNORE`). Unset `ADMIN_PASSWORD` when done. Tell the owner: admin password is in the vault; agent will browser-test login — no plaintext in chat.

---

## Phase 6 — Deploy

```bash
pnpm cf:deploy
pnpm launch:check -- https://<domain>
```

Smoke `https://<domain>/` and `https://<domain>/api/config/public`.

---

## Phase 7 — Admin login test (agent)

computerUse: open `https://<domain>/sign-in` (or the app’s admin sign-in path), fill vault login references for `zh6856660@gmail.com`, submit, confirm `/admin` loads. Report pass/fail only. Do not paste the password.

Then set baseline Admin app keys: `app_name`, `app_description`, `app_url` = `https://<domain>`.

---

## Phase 8 — Parallel post-deploy configuration

Run these tracks in parallel after Phase 7.

### 8A — Google OAuth (browser)

Google Cloud Console (often already signed in as `zh6856660@gmail.com`): OAuth web client. Authorized redirect:

`https://<domain>/api/auth/callback/google`

JS origin: `https://<domain>`. Write Admin `google_auth_enabled`, `google_client_id`, `google_client_secret` (optional `google_one_tap_enabled`). No rebuild.

### 8B — GA4 (browser)

Create/select GA4 property for the new domain. Write Admin `google_analytics_id`. Optional `clarity_project_id` (alphanumeric only or empty).

### 8C — R2 into Admin

If not filled: `r2_access_key`, `r2_secret_key`, `r2_bucket_name`, `r2_endpoint`, `r2_domain`, optional `r2_upload_path`.

### 8D — Cloudflare Email Routing (support@)

Browser on the domain’s Cloudflare Email Routing: enable routing, create `support@<domain>` → forward to the admin inbox (default `zh6856660@gmail.com` unless owner says otherwise). Destination must be verified. This is **inbox forward**, not Resend transactional sending.

### 8E — Resend (transactional, if used)

Prefer API: create domain, publish DNS (`proxied: false` on CF), verify. Admin `resend_api_key`, `resend_sender_email`. Leave `email_recall_enabled` false until intentional.

### 8F — Video provider + reference clips

Admin `kie_api_key` / `apimart_api_key`, `default_video_provider`. Reference URLs on own media host after Range 206 probe.

### 8G — Stripe (human)

Owner configures Stripe Dashboard keys + webhook to `https://<domain>/api/payment/notify/stripe`. When they provide values, set Admin `stripe_*` and `default_payment_provider` = `stripe`. Agent does not create the webhook.

---

## Admin settings key map

| Group | Keys |
| --- | --- |
| App | `app_name`, `app_description`, `app_url` |
| Stripe | `stripe_enabled`, `stripe_publishable_key`, `stripe_secret_key`, `stripe_signing_secret`, `default_payment_provider` = `stripe` (human-supplied) |
| R2 | `r2_access_key`, `r2_secret_key`, `r2_bucket_name`, `r2_endpoint`, `r2_domain`, optional `r2_upload_path` |
| Video | `kie_api_key`, `apimart_api_key`, `default_video_provider`, `create_reference_video_url`, `_12s`, `_15s` |
| Google | `google_auth_enabled`, `google_client_id`, `google_client_secret`, optional `google_one_tap_enabled` |
| Analytics | `google_analytics_id`, `clarity_project_id` |
| Resend | `resend_api_key`, `resend_sender_email`; recall caps `email_recall_*` |

Saving via `/admin/settings` or `POST /api/admin/config` writes `config` (DB wins over env). Rebuild only if baked `VITE_*` changed.

---

## What this skill never does

- Daily silent redeploy of an already-live Worker (use `deploy-cloudflare`)
- Echo passwords, `GITHUB_TOKEN`, Stripe/R2 secrets into chat or git
- GitHub Fork button when the owner asked for an isolated private push
- Create Stripe webhooks (human)
- Deploy custom-domain routes before the zone is Active
