# Launch a themed site on a new domain

First deploy of a **new product** from this Uptown template (Worker `uptown`, [uptownfunkai.video](https://uptownfunkai.video)). Later redeploys of the same Worker use `pnpm cf:deploy` / `.claude/skills/deploy-cloudflare` — not this checklist.

Agent steps: `.claude/skills/theme-site-launch/SKILL.md` (`.cursor/skills` → same files). Deploy needs **Node.js 22+**.

## Owner-agreed spine

1. **Domain → Cloudflare first** (create zone → set Spaceship nameservers → wait **Active**). Start this before everything that needs public DNS.
2. **New private GitHub repo** via box `GITHUB_TOKEN`: create private repo + push (not the Fork button).
3. **Parallel while DNS propagates:** brand + 9 icon options (owner picks one) in **one PR** ∥ D1 + R2 + commit real `wrangler.jsonc` + secrets.
4. Migrations + pricing + admin **`zh6856660@gmail.com`** (password in vault; agent browser-tests login — no plaintext in chat).
5. `pnpm cf:deploy`.
6. **Parallel post-deploy:** Google OAuth, GA4, Admin fills, CF Email Routing `support@<domain>` → admin inbox, Resend if needed. **Stripe keys + webhook = human.**

## Config in git vs not

- `wrangler.jsonc` **is tracked**. After `wrangler d1 create`, commit real `database_id` and `routes` with `zone_name`.
- `.env.production` stays gitignored. Never put secrets in `vars`.
- Routing primary path: zone + Worker `routes` + `zone_name` (apex + optional www). Not `custom_domain: true` as primary.

## Human-only

1. Buy the domain (usually Spaceship).
2. Stripe KYC; configure API keys and webhook `https://<domain>/api/payment/notify/stripe` in Stripe Dashboard (paste values to agent only if you want Admin filled for you).
3. Cloudflare Full access when R2 API token create returns 403.
4. Copyright for new theme media.
5. Pick one of the nine icon candidates the agent generates.

## Agent / API (high level)

1. Cloudflare zone + Spaceship NS → Active.
2. `gh repo create` private + push with `GITHUB_TOKEN`.
3. Brand strip + icons PR; D1/R2/wrangler/secrets in parallel.
4. Remote migrations; seed admin `zh6856660@gmail.com` + pricing; vault password; agent login test.
5. `pnpm cf:deploy` + `pnpm launch:check -- https://<domain>`.
6. Browser parallel: OAuth redirect `https://<domain>/api/auth/callback/google`, GA4 id, R2 Admin keys, Email Routing `support@`, Resend DNS, video provider + Range-206 reference URLs.

Default support forward target: `zh6856660@gmail.com` unless you name another inbox.
