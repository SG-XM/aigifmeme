# Configurable Subscription Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription plans editable in the authenticated admin panel and use the active database catalog for pricing display and checkout.

**Architecture:** Add a dedicated `subscription_plan` table beside the existing `credit_top_up_product` table. A standalone module validates and reads subscription plans; public and admin API routes expose allowlisted data and enforce admin RBAC. The pricing block reads locale-aware enabled plans, and the checkout route resolves the submitted product ID against the database before creating an order.

**Tech Stack:** TanStack Start file routes, Drizzle ORM (SQLite/D1 plus existing Postgres/MySQL schema templates), TanStack Query, Paraglide messages, Cloudflare D1 migrations.

---

## File map

- `src/config/db/schema.{sqlite,postgres,mysql}.ts`: define the persisted subscription plan fields and indexes.
- `src/modules/subscription-plans/service.ts`: parse, validate, list and resolve plan rows.
- `src/routes/api/subscription-plans.ts`: public enabled-plan response localized by the request locale.
- `src/routes/api/admin/subscription-plans.ts`: authenticated CRUD-like list/create/update handlers; no delete handler.
- `src/routes/admin/subscription-plans.tsx`: admin editor for billing and marketing fields.
- `src/routes/admin/route.tsx`: add the subscription-plan navigation entry beside top-up packages.
- `src/routes/api/payment/checkout.ts`: use the persisted subscription catalog as the authoritative source and preserve top-up fallback.
- `src/blocks/pricing.tsx`: query the public catalog and render the existing monthly/yearly pricing groups from it.
- `src/config/pricing.ts`: remove the obsolete in-code authoritative plan catalog after its values are migrated.
- `messages/{en,zh}.json`: add matching editor and validation labels.
- `drizzle/0002_*.sql`, `drizzle/meta/*`, `.gitignore`: add the additive production migration and seed the six existing plans.
- `docs/plans/2026-10-08-configurable-subscription-plans-design.md`: approved feature design.

## Task 1: Add subscription plan schema and migration

**Files:** Modify all three schema templates; create one additive SQLite migration; update Drizzle journal/snapshot.

- [ ] Add a `subscriptionPlan` table with primary key `productId`; names and descriptions in English and Chinese; newline-separated English and Chinese features; optional bilingual badge; `priceInCents`; optional `compareAtPriceInCents`; `currency` fixed to USD; `interval` (`month` or `year`); positive `intervalCount`; positive `credits`; `creditsValidDays`; `featured`; `enabled`; `sort`; timestamps; and an index on enabled/sort.
- [ ] Add six default rows matching the current catalog: Lite/Pro/Ultra monthly at 990/1990/3990 cents with 2,000/4,800/10,000 credits valid 30 days, and yearly at 10,680/20,280/39,480 cents with 24,000/57,600/120,000 credits valid 365 days.
- [ ] Generate the SQLite migration and review it to ensure it only creates the new table/index and inserts those six rows; do not apply it to production in this task.
- [ ] Keep the migration journal and snapshot synchronized with the existing `0000_top_up_products` entry.

## Task 2: Implement the subscription plan module and APIs

**Files:** Create `src/modules/subscription-plans/service.ts`, `src/routes/api/subscription-plans.ts`, and `src/routes/api/admin/subscription-plans.ts`.

- [ ] Validate product IDs using the top-up module's stable lowercase ID rule, bounded text lengths, positive integer prices/credits/counts, supported month/year intervals, valid-days range, booleans, sort values, and feature line counts/lengths.
- [ ] Expose admin list plus create/update operations; keep product ID immutable on update; never delete purchased plan identities.
- [ ] Require a valid session and `admin.*` permission for all admin handlers. Require same-origin `Origin` on writes and return generic database failure messages.
- [ ] Return only enabled rows from the public endpoint, choosing `en` or `zh` copy based on the Paraglide locale; include the stable product ID, price, currency, interval, interval count, credits, validity, features, badge, featured and sort.
- [ ] Add `Cache-Control: no-store` to both public and admin responses.

## Task 3: Build admin editing page and navigation

**Files:** Create `src/routes/admin/subscription-plans.tsx`; modify `src/routes/admin/route.tsx`; modify both message files.

- [ ] Follow the top-up editor's page, mutation, toast, and query invalidation patterns.
- [ ] Provide form inputs for immutable ID, bilingual plan name/description, bilingual line-separated features and badge, USD price and optional compare-at price, billing interval/count, per-cycle credits, credit expiry, featured/enabled toggles, and sort order.
- [ ] Render existing plans grouped/sorted with edit controls; creating a plan uses POST and saving an existing plan uses PATCH.
- [ ] Add a localized “Subscription Plans” entry in the billing navigation next to “Top-up Packages”.
- [ ] Add every translation key to `messages/{en,zh,es,ar}.json`.

## Task 4: Switch checkout and pricing display to database catalog

**Files:** Modify `src/routes/api/payment/checkout.ts` and `src/blocks/pricing.tsx`.

- [ ] Resolve an enabled subscription plan from the database using `product_id`; if none matches, keep resolving enabled top-up products as today; reject IDs absent from both catalogs.
- [ ] Construct server-side subscription checkout fields from the persisted record, including `PaymentType.SUBSCRIPTION`, actual price, currency, interval/count, credits and credit validity. Ignore client-supplied values for those fields.
- [ ] Keep the internal product ID on the order; rely on existing `creem_product_ids_mapping` in `createCheckout` to map it to the provider product ID for Creem.
- [ ] Fetch enabled plans via TanStack Query and group plans by interval; display locale-specific names, descriptions and features, actual billable price, plan cadence and featured badge.
- [ ] Preserve current plan-switch behavior, authentication prompt and provider selection. Ensure the annual plan's button submits the annual total rather than the monthly display equivalent.

## Task 5: Verify, scan, commit, review migration, deploy

**Files:** No additional source files unless verification finds a defect.

- [ ] Run `pnpm build`; expect success and an i18n parity check for both locales.
- [ ] Run `git diff --check` and the repository `security-scan` worktree and staged scans; resolve every high finding before commit.
- [ ] Commit the implementation with a Conventional Commit message after build and scans pass.
- [ ] Present `drizzle/0002_*.sql` for the user's production migration review before applying it. Do not deploy past this gate until the user approves the production migration.
- [ ] After explicit migration approval, apply the D1 migration, run `pnpm run cf:deploy`, and smoke-check the public plans endpoint, admin API authorization, homepage, and absence of active migration errors.
