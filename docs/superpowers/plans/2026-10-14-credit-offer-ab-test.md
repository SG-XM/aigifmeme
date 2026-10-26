# Credit Offer Priority A/B Test Implementation Plan

> **For agentic workers:** Execute the steps in this plan inline, task by task. Keep changes limited to the insufficient-credit offer surface and the existing AB test integration.

**Goal:** Compare whether highlighting the $19.99 or $5.99 credit pack first produces better paid conversion in the insufficient-credit dialog.

**Architecture:** Reuse the existing authenticated AB assignment/exposure flow, admin experiment service, and checkout participant attribution. The compact Pricing surface will receive a variant-specific offer ordering and featured product while the regular pricing page keeps its current rendering.

**Tech Stack:** TanStack Start, React, TypeScript, TanStack Query, existing AB experiment service, Cloudflare Workers/D1.

---

## File Map

- Modify `src/components/ab-test.tsx` only if existing fallback or exposure behavior prevents this dialog from using the existing assignment flow.
- Modify the credit purchase dialog entry point (locate the component using `<Pricing compact />`) to wrap only that surface in `<ABTest>` with a stable scene key and two Pricing variants.
- Modify `src/blocks/pricing.tsx` to accept variant-specific compact offer ordering/highlight selection, keep checkout participant attribution, and avoid changing non-compact pricing.
- Modify `messages/{en,zh,es,ar}.json` only if a new user-visible experiment string is needed; prefer existing product names and avoid adding experiment copy.
- Do not change schema or migrations; existing AB experiment and participant tables are sufficient.
- Use existing `src/blocks/admin-ab-tests.tsx` dashboard to create/start the experiment after the UI is deployed.

## Task 1: Locate the insufficient-credit compact pricing entry point

- [ ] Search for the compact Pricing usage and determine whether its parent can render the existing `ABTest` component.
- [ ] Confirm the current `/admin/ab-tests` create flow accepts a top-up experiment and a seven-day window.
- [ ] Identify the product IDs for the $19.99 and $5.99 packs from the current plan data; keep these IDs as the variant selectors.

## Task 2: Wire the two experiment variants

- [ ] Import and use `ABTest` at the insufficient-credit dialog boundary only.
- [ ] Use a dedicated scene key for this purchase dialog and pass variant A/B children:
  - A: `duo_v2` ($19.99) first, `single_v2` ($5.99) second, monthly plan afterward.
  - B: `single_v2` ($5.99) first, `duo_v2` ($19.99) second, monthly plan afterward.
- [ ] Set each variant's featured product to its first credit pack so the orange emphasis follows the first card's button.
- [ ] Preserve current checkout IDs, prices, labels, and checkout participant ID propagation.
- [ ] Preserve the normal pricing page and any non-compact Pricing consumer.

## Task 3: Verify data attribution and production setup

- [ ] Review `ABTest` exposure recording and the checkout API participant validation to ensure both use the same scene and top-up product scope.
- [ ] Run `pnpm build` as required by the repository instructions.
- [ ] Deploy through `pnpm run cf:deploy` after preflight and the already authorized production release workflow.
- [ ] In `/admin/ab-tests`, create and start one experiment with a unique key, dedicated scene, `productScope=topup`, `bPercent=50`, and `windowDays=7`.
- [ ] Confirm the experiment is active in the database/admin UI and inspect the live dialog to verify each arm's order and button highlight.

## Completion Criteria

- A/B assignment changes only the insufficient-credit dialog's first highlighted credit pack.
- The A and B offers match the selected product IDs and order.
- Existing exposure and paid checkout attribution feed the admin report.
- No database migration is introduced.
- Production build and deployment complete, and the experiment is active with the approved settings.
