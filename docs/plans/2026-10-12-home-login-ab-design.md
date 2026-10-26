# Home login timing experiment

Requested behavior: compare login before photo selection (A) with login on final submit after photo and settings selection (B).

## Scope and acceptance

- Only the embedded Bulin homepage generator recruits anonymous visitors. Burning Bridges and already-signed-in new visitors keep the existing flow.
- The `home-login-gate` scene uses the existing experiment lifecycle, 50% B allocation, a seven-day observation window, and a stable HttpOnly browser cookie.
- B previews its photo locally. The file and settings are saved in IndexedDB before leaving for authentication, restored on return, and uploaded through the existing authenticated upload endpoint. No render or credit deduction is triggered by login alone.
- IndexedDB drafts are validated and expire logically after one hour; expired drafts are deleted on the next read. Failure to persist leaves the visitor on the form with an actionable error.
- The admin A/B page includes a preset and counts browser exposures, selected photos, login prompts, submit clicks, authenticated browsers and server-confirmed generation starts. Login completion is the primary conversion metric. Existing payment metrics respect the configured product scope and verified actual payments.
- A user who signs in from multiple browser identities is attributed to at most one payment participant; anonymous abandonments remain in denominators. Units are browsers rather than unique people.

## Deployment and rollback

`drizzle/0005_awesome_zemo.sql` adds `ab_visitor` and two unique indexes. It does not alter, drop, rebuild or delete any existing table or row. Existing authentication and payment participants/order foreign keys remain unchanged.

Production migration was reviewed and explicitly approved by the user on 2026-10-12 (America/Los_Angeles). Migration 0005 was applied, Worker version `cb859e03-a0eb-4cc2-b8c1-cd0d418080b4` was deployed, and `home-login-gate-v1` was started at 50/50 with a seven-day observation window. Production checks verified both group assignments, cookie stickiness, Secure/HttpOnly cookie flags, cross-origin rejection, and unchanged authentication requirements for uploading and generation. Assignment-only smoke-test visits were not exposed, so they do not enter conversion denominators.

Rollback: stop recruitment from the admin page, then restore the preceding Worker version if needed. Leave the additive visitor table in place so collected evidence is preserved and old code remains compatible. No destructive rollback SQL is needed.

## Validation

Focused tests cover anonymous stickiness, identity ownership, login binding, event idempotency, anonymous abandonments, stopped recruitment, expiry, auth boundaries, draft limits, existing A/B lifecycle and regional checkout pricing. Browser QA covers B photo preview, changing settings, final-submit login, full-reload draft recovery and actual login return. Local QA has no public object storage, so authenticated upload success uses the existing provider configuration in production; no paid generation was run.
