# Launch a themed fork on a new domain

First deploy of a **new product** forked from this Uptown template (Worker `uptown`, live site [uptownfunkai.video](https://uptownfunkai.video)). A later redeploy of the same Worker is `pnpm cf:deploy` / the `deploy-cloudflare` skill — not this checklist. Agent steps: `.claude/skills/theme-site-launch/SKILL.md` (also `.cursor/skills`, same files).

Checked against `src/modules/config/settings.ts`, `wrangler.jsonc` / `wrangler.example.jsonc`, `scripts/init-pricing.ts`, `scripts/cf-deploy.sh`, and `vite.config.ts`. Deploy needs Node.js 22+ (`scripts/cf-deploy.sh` refuses older Node).

**Config that goes in git vs not:** `wrangler.jsonc` **is tracked**. Template/main may keep placeholder D1 id `00000000-0000-4000-8000-000000000000`. After `wrangler d1 create` on a live product fork, **commit** the real `database_id` and `routes` (private product repo). `.env.production` stays gitignored forever. Never put secrets in `vars` (that block is public). Use `wrangler secret put` / admin settings for secrets.

**DNS / routing:** primary path is Cloudflare zone + Worker `routes` with `zone_name` (apex and optional `www`). Do **not** treat `custom_domain: true` as the primary path.

This product uses Worker `uptown` and D1 `uptown-db`. A further fork needs a new Worker name and a new D1 name. A `config` row overrides the same key from env (`getAllConfigs` spreads database over `envConfigs`). Uploads read admin `r2_*` through the S3-compatible R2 client. The commented `r2_buckets` binding is unused.

Create reference MP4s live in Admin D1 keys `create_reference_video_url` / `_12s` / `_15s`. Before trusting a URL, probe `Range: bytes=0-1` and expect **HTTP 206**. Point new forks at their own media host — not parent `media.uptownfunkai.video` unless intentional.

The Cloudflare zone has to be Active before a routes deploy. The default `super_admin` to seed is `admin@example.com` (password on the secret card, not in this file). First-ever production deploy of a brand-new Worker may confirm once; later ships the owner already asked for run `pnpm cf:deploy` without a second yes.

## Human-only

1. **New repo.** Create the Git remote for the fork.
2. **Buy the domain** at Dynadot.
3. **Stripe.** Finish KYC and supply the API keys on the secret card.
4. **Cloudflare.** Reconnect with Full access so the agent can create the R2 bucket and the R2 API token.
5. **Google and Clarity.** Log in, or supply the OAuth client, the GA4 measurement id, and the Clarity project id.
6. **Copyright.** Confirm the rights to the new theme's video, audio, and likenesses. Strip parent Uptown / Bulin / Burning Bridges media — the fork does not ship those clips or hosts unless you mean to.

## API or script

Do these after the matching human step. Do not ask anyone to mint R2 S3 keys by hand, to click Resend DNS in a browser, or to register on the site and then promote that account.

1. **Brand code** in the new repo — strip template leftovers (this template product is Uptown / uptownfunkai.video). Replace campaign routes, reference media, demos, and copy; do not leave bulin/bridges URLs or media hosts from the parent:
   - Routes and chrome: `src/routes/index.tsx`, `src/routes/bulin-47-ai.tsx` (`/bulin-47-ai`), `src/routes/burning-bridges-ai.tsx`, `src/routes/sitemap[.]xml.ts` (`/burning-bridges-ai`), `src/blocks/header.tsx`, `src/blocks/footer.tsx`, `src/blocks/home-landing.tsx`, `src/blocks/create-video.tsx`
   - Media modules: `src/lib/bulin-reference.ts`, `src/lib/bulin-trio-reference.ts`, `src/lib/burning-bridges-reference.ts`, `src/lib/create-video.ts`, `src/modules/agent/tools.ts`, `src/routes/api/agent/create.ts`, `src/routes/api/agent/create-tasks.ts`, `src/routes/api/payment/video-retention-offer.ts`
   - Files: `public/audio/bulin-reference-*.m4a`, `public/audio/burning-bridges-party-2m37s-15s.m4a`, `public/videos/reference/burning-bridges-party-2m37s-15s.mp4`, `public/videos/showcase/home/*` (paths used by `src/lib/home-demos.ts`), `public/videos/showcase/burning-bridges/`, `public/videos/showcase/generated/`, `public/videos/showcase/woman.mp4`, `src/components/agent/prompt-examples.ts`
   - Copy: `messages/{en,zh,es,ar}.json` (`home.*`, `trend.*`, `effect.*`, `recast.*`, `create.bulin_*`, `create.bridges_*`, most of `landing.*`), `src/components/site-footer.tsx` badges, `src/lib/trend-page-meta.ts` (`TREND_PAGE_UPDATED_AT`)
   - Chat persona name is admin `app_name` (`src/modules/agent/service.ts`). Edit `systemPrompt` only to change behavior.
2. **D1 and R2, after Full access.** `npx wrangler d1 create <db-name>`. Binding name stays `DB`. Create the bucket with `POST /accounts/<account_id>/r2/buckets`. Create the S3 credentials with `POST /accounts/<account_id>/tokens`, permission group `Workers R2 Storage Bucket Item Write`, resource `com.cloudflare.edge.r2.bucket.<account_id>_default_<bucket-name>`. Access key id is the token `id`. Secret access key is the hex SHA-256 of the token `value`. Enable the public hostname with `PUT .../r2/buckets/<bucket-name>/domains/managed` `{"enabled": true}`. A 403 means reconnect Full access, not a dashboard token.
3. **Tracked wrangler + gitignored env.** Ensure `wrangler.jsonc` exists (from template or `cp wrangler.example.jsonc wrangler.jsonc` on a fresh fork). Set `name`, `database_name`, real `database_id` from `d1 create`, `vars.DATABASE_PROVIDER` = `d1`, `vars.VITE_APP_URL`, `vars.VITE_APP_NAME`, `migrations_dir` = `drizzle`, and routes with **zone_name**, e.g. `{ "pattern": "<domain>/*", "zone_name": "<domain>" }` and optionally `www.<domain>/*`. **Commit** that `wrangler.jsonc` on the product fork. `.env.production` (gitignored) holds `VITE_APP_URL=https://<domain>`, `VITE_APP_NAME`, and `DATABASE_PROVIDER=d1`. `pnpm cf:deploy` refuses to build when the two URLs differ or the URL is localhost or a placeholder. Pipe `openssl rand -base64 32` into `wrangler secret put` for `AUTH_SECRET` and `CONFIG_ENCRYPTION_KEY`.
4. **Nameservers.** `POST /zones` for `<domain>`. Point Dynadot at the two assigned nameservers with API3 `command=set_ns` (Dynadot API key on the secret card). Wait until the zone is Active.
5. **Schema, prices, admin.** `npx wrangler d1 migrations apply <db-name> --remote` (journal through `0016_retention_name_price`). On a fresh local D1 file, run `pnpm rbac:init --admin-email=admin@example.com` with the password from the secret card, then `pnpm db:init-pricing -- --apply`. Copy `role` / `permission` / `role_permission`, `credit_top_up_product`, `subscription_plan`, `config.video_credit_pricing_version` = `seedance-12s-v2`, and the user plus credential account up to remote D1. Dry-run pricing without `--apply`. Re-running init does not overwrite catalog edits.
6. **Deploy.** `pnpm cf:deploy` (Node 22+). Confirm only if this is the first-ever production deploy of a brand-new Worker; later ships the owner already asked for run silently. This registers Nitro's `*/5 * * * *` `email-recall` cron (`vite.config.ts`, `src/tasks/email-recall.ts`). Recall mail stays off until `email_recall_enabled` is true. Caps default to 80/day and 2500/month (`email_recall_daily_limit`, `email_recall_monthly_limit`). Then `pnpm launch:check -- https://<domain>`.
7. **Admin settings** at `/admin/settings` or `POST /api/admin/config` (template: `GET /api/admin/config/import`). Database wins over env. Keys:
   - `app_name`, `app_description`, `app_url` = `https://<domain>`
   - `stripe_enabled`, `stripe_publishable_key`, `stripe_secret_key`, `stripe_signing_secret`, `default_payment_provider` = `stripe`
   - `r2_access_key`, `r2_secret_key`, `r2_bucket_name`, `r2_endpoint`, `r2_domain`, optional `r2_upload_path`
   - `kie_api_key` and/or `apimart_api_key`, and `default_video_provider` (`kie` or `apimart`; `auto` does not select APIMart)
   - `create_reference_video_url`, `create_reference_video_url_12s`, `create_reference_video_url_15s` — own media host; probe Range 206 before save
   - `google_auth_enabled`, `google_client_id`, `google_client_secret`, optional `google_one_tap_enabled`
   - `google_analytics_id`, `clarity_project_id`
   - `resend_api_key`, `resend_sender_email` (`email_provider` defaults to `resend`)
8. **Resend DNS.** `POST https://api.resend.com/domains` with the API key from the secret card. Write the returned records through the Cloudflare DNS API (`proxied: false`) once the zone is Active, or through Dynadot `command=set_dns2` with `add_dns_to_current_setting=1` while DNS is still at Dynadot. Then `POST /domains/<domain_id>/verify`.
9. **Stripe webhook** via the Stripe API: `https://<domain>/api/payment/notify/stripe`. Store the signing secret in `stripe_signing_secret`.
10. **Google, GA4, Clarity.** Write the ids from the human step into the keys above. OAuth redirect URI: `https://<domain>/api/auth/callback/google`. No rebuild unless `VITE_APP_URL` changes.

Homepage clips are `src/lib/home-demos.ts`. Posts go in `/admin/posts`.
