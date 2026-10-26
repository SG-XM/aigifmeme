# Payment UI A/B tests

Approved scope: compare two developer-supplied UI components using stable logged-in user assignment, a single first-exposure record, and authoritative payment orders. No clickstream or automatic winner selection.

Two tables: `ab_experiment` (immutable configuration after start, unique active scene, product scope, B percentage, observation window) and `ab_participant` (unique experiment/user assignment, nullable first exposure). Orders reference one participant and store test status and authoritative payment confirmation time. Historical orders remain unassigned.

Implementation sequence:

1. Add schema templates and an additive SQLite/D1 migration; verify against a disposable database.
2. Add experiment management, assignment, exposure and aggregation services/APIs with authentication, admin RBAC and same-origin mutation checks.
3. Provide an `ABTest` render wrapper/context that selects developer-supplied A/B components and carries attribution into existing checkout components. Do not create or activate a real experiment or redesign the product UI.
4. Save validated attribution when creating an order. Fix initial payment fulfillment concurrency with atomic conditional writes, including D1's batch API; preserve zero payment amounts and authoritative confirmation.
5. Add a bilingual admin page for draft creation, start/stop and A/B metrics. Revenue is grouped by currency; mature-window results and provisional results are separate.
6. Test ownership, sticky assignment, concurrent starts, observation windows, test exclusion, duplicate callbacks and atomic rollback. Build, scan security and commit.
7. Present the exact additive migration for production review, then apply it and deploy the existing Cloudflare Worker once authorized.

Money and fulfillment remain server-authoritative. Client attribution never overrides prices, credits, user identity or variant. Checkout without experiment context behaves as before. Exposure collection fails open for checkout, leaving the order unattributed if exposure was not recorded. Renewals are not included in first-purchase experiment attribution.
