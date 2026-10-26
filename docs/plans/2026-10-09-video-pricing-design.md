# Video pricing cutover

Approved user requirements: use the Rap Duo 12-second credit table and five
one-time packs, plus the monthly and annual plans supplied in the screenshots.
Show only whole render credits, never a per-second credit price. Annual plans
grant their entire allowance up front, with annual expiration.

| Tier     | Model             | 480p | 720p | 1080p |
| -------- | ----------------- | ---: | ---: | ----: |
| Standard | Seedance 2.0 Mini |    5 |   10 |     — |
| Fast     | Seedance 2.0 Fast |    8 |   17 |     — |
| Pro      | Seedance 2.0      |   10 |   20 |    50 |
| Ultra    | Seedance 2.5      |   17 |   37 |    93 |

Charge `ceil(table credits × normalized output seconds / 12)` once per render.
The same catalog drives the composer estimate, paywall, server deduction and
public price table. Unsupported models are rejected; unsupported client settings
are normalized and the server recalculates credits. Failed renders refund the
original deduction idempotently. Expiring grants are consumed before permanent
pack grants. All aspect ratios have the same credit cost.

| Pack        |  USD | Credits | Expiration |
| ----------- | ---: | ------: | ---------- |
| Single      | 9.99 |      10 | Never      |
| Duo         |   29 |      50 | Never      |
| Crew        |   99 |     350 | Never      |
| Studio Pack |  199 |     900 | Never      |
| Label       |  499 |    3000 | Never      |

| Plan   | Monthly USD / credits | Annual USD / credits |
| ------ | --------------------- | -------------------- |
| Basic  | 29.90 / 100           | 100 / 400            |
| Pro    | 49.90 / 300           | 500 / 4000           |
| Studio | 99.90 / 800           | 600 / 6000           |

Subscriptions renew the same allowance on their billing cycle. Provider billing
period end owns credit expiration, including leap years and varying month lengths.
Annual display prices are $8.33/$41.67/$50 per month; charged prices remain
$100/$500/$600 annually. Savings compare per-credit prices against monthly Basic,
matching screenshot percentages 16/58/67 for annual and 44/58 for monthly upgrades.
Pack discounts compare against Single. Video estimates always mean Standard,
720p, 12 seconds; a pack does not promise the same number of Ultra renders.

## Compatibility and rollout

The old units cannot be mixed with the new units. New products use distinct
`*_v2` IDs, so payment-provider product mappings cannot silently reuse old prices.
The `video_credit_pricing_version=seedance-12s-v2` database marker gates checkout
and generation. It is read directly and protected from admin config writes.

`pnpm pricing:update` previews the changes. Stop all old/new application writers
and let pending generation tasks finish before applying. Existing financial data
requires an explicitly chosen `--legacy-ratio=numerator/denominator`; there is no
assumed exchange rate across different models. For example, `37/2400` preserves
the old 12-second Ultra 720p allowance, with remaining balances rounded up in the
user's favor. Other legacy models/settings have different relative buying power.
Review that policy before migrating a populated production database.

```bash
pnpm pricing:update -- --apply --legacy-ratio=37/2400
```

The transaction backs up original rows under gitignored `data/pricing-backups/`
with owner-only permissions, scales ledger balances and history, consumption
details, historical task costs, order credit snapshots, existing subscription
allowances and configured signup bonus, converts and disables old products (catalog-only legacy defaults use 37/2400 when no financial data exists), inserts the new
catalog and records the version marker. Existing subscription dollar prices and
provider identities remain as originally sold; only their credit unit changes.
Outstanding checkout orders retain their dollar amount and converted allowance.
No old subscription is silently repriced into a new plan. Reruns preserve admin
catalog edits. Restart writers after the transaction completes.

Fresh local databases need schema initialization (`pnpm db:push`) followed by
the same cutover command without a legacy ratio. No production database is
changed by editing/building the application.

## Rollback

Backups include the expected post-migration state. While writers are stopped,
`pnpm pricing:rollback -- data/pricing-backups/<backup>.json` verifies no new
payments, balances, tasks, config or catalog writes occurred. Add `--apply` to
restore affected values and previous enabled catalogs. Restore the old application
code before restarting traffic. If new writes occurred, automatic rollback
refuses to erase them; reconcile those writes before a manual rollback.

## Providers and constraints

Kie model IDs are `bytedance/seedance-2-mini`, `bytedance/seedance-2-fast`,
`bytedance/seedance-2`, `bytedance/seedance-2-5`, all via jobs/createTask.
Image animation uses first_frame_url/last_frame_url; explicit image/audio
references use the mutually exclusive multimodal mode. Native audio is on.
Video references are rejected before upstream spend because reference-video
duration is not priced by the agreed output-only table.

Stripe and PayPal construct prices from the authoritative server catalog.
Creem requires new provider products and `creem_product_ids_mapping` entries for
the v2 IDs. Updating the local catalog alone does not change external Creem
products. Do not take live payments until mappings have been synchronized.

At Kie's checked rates, annual Studio yields $3.70 for Ultra 720p/12s versus
$3.78 in upstream cost, and $9.30 for Ultra 1080p versus $9.48 upstream. These
approved prices are implemented exactly; fee/LLM/storage costs increase that gap.

References: https://docs.kie.ai/market/bytedance/seedance-2-mini,
https://docs.kie.ai/market/bytedance/seedance-2-fast,
https://docs.kie.ai/market/bytedance/seedance-2,
https://kie.ai/seedance-2-5.

## Production rollout — 2026-10-09

Deployed to https://uptownfunkai.video with the existing D1
binding. Before migration, production had no credit, order, subscription or AI
task rows, and no provider config rows. No customer balance conversion was needed.
The full pre-migration SQL export is stored at
`data/pricing-backups/production-before-pricing.sql` (gitignored, owner-only).

Applied `0002_lean_black_widow.sql` to create the missing subscription catalog,
then `0003_video_pricing_v2.sql` to disable old products and install five packs,
six subscription plans and the pricing version. The latter migration refuses
an unversioned database with financial rows; populated databases must use an
explicitly reviewed conversion instead. Foreign-key checks passed. No tables
or columns were dropped. Live public APIs matched all approved prices and credits.

D1 deduction, task creation and refunds use native atomic batches with optimistic
balance guards. A JSON-bound expected balance snapshot avoids D1's 100-parameter
limit when a render spends multiple grants. Renewal orders record the billing
period in their checkout metadata, so duplicate callbacks grant only once even
when a subscription update arrives before the payment event.

Admin subscription plans now have monthly/yearly filters, whole-cycle price
previews and explicit up-front allowance/expiration guidance. Top-up management
explains permanent validity and the shared credit unit. Admin API auth guards
were checked anonymously; no production admin credentials were available for
a logged-in browser check.

| Check              | Evidence                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Responsive         | Pricing page at 390, 768 and 1440 pixels; no horizontal overflow                             |
| Theme              | Light/dark pricing views and annual toggle checked in browser                                |
| SEO                | Pricing H1, page-specific canonical/hreflang; sitemap/robots respond                         |
| Performance        | Production bundle/startup reviewed; browser console has no errors; no Lighthouse measurement |
| Security           | Worktree security scan clean; admin APIs reject anonymous access                             |
| Financial behavior | 92 tests pass, including D1 rollback, concurrent spend, repeated refunds and annual renewal  |
| Build              | TypeScript and Cloudflare production build pass                                              |

Production has AUTH_SECRET and CONFIG_ENCRYPTION_KEY, but KIE and payment
credentials were not configured at rollout. Configure those under `/admin/settings`
before taking payments or rendering video. Live paid checkout/generation was not
executed. Creem also needs v2 product mappings if selected.
