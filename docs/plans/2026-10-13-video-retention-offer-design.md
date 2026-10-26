# Video purchase retention offer

Authorized scope: implement, deploy and commit to main, including reasonable UX improvements.

- Only dismissing the catalog opened after attempting generation with a selected photo triggers issuance. Generic pricing/manual credit purchase entries do not.
- One offer per authenticated account, with a server deadline of thirty minutes. Refreshes, repeated dismissals and multiple devices cannot restart it. Offers already issued keep the deadline stored on the account.
- USD 7.99 buys 10 credits once, without a subscription. Only settings costing at most the product allowance qualify. The price and credits remain editable in the existing top-up admin page.
- Keep the product out of the public catalog. All checkout requests for its reserved ID must prove the account's active offer. Atomically reserve one checkout and reuse the payment URL on retries.
- Closing or minimizing the offer collapses the lower-left bar into a compact pill with the price and countdown. The pill stays visible and reopens the dialog until the offer expires; it cannot be hidden while the offer is valid. No repeated automatic popup; expired and paid offers disappear.
- The deadline limits initiating checkout; already started payments follow the provider's payment deadline. State this transparently. Stripe is the existing live provider and the supported provider for this offer.
- Reuse the existing config key/value table for private per-account state. Exclude the reserved prefix from all configuration reads and edits so settings screens cannot expose, overwrite or delete it. No schema migration required.
- Seed the product with an additive idempotent SQL statement after deployment. No changes to existing products, balances or orders.
- Verify account isolation, expiry, concurrency, checkout guards, catalog exclusion, locale compilation and production build. Inspect desktop and mobile offer UI.

Visual direction: reuse the current white purchase surface with black type, orange action, and a large tabular timer. Photo preview connects the offer to the user's current video; literal price and allowance explain the purchase.

## Validation

- 23 focused tests passed: SQLite persistence and seed idempotence, once per account, account isolation, exact expiry boundary, concurrent reservation, crashed checkout recovery, fixed price, provider idempotency and protected settings.
- Browser tests used intercepted API fixtures against the built application. Verified selected photo → generation paywall → dismissal → offer, minimization, refresh without deadline reset, mobile bounds, manual hiding and expiry. No browser errors. No live payment was charged.
- Production build and 1,705 messages across four locales passed. Whole-project TypeScript checking has pre-existing errors outside this change; new files have no added type errors.
