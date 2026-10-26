# Credit Offer Priority A/B Test Design

## Goal

Compare which first highlighted credit offer leads to better paid conversion in
the insufficient-credit purchase dialog: the $19.99 five-video pack or the
$5.99 one-video pack.

## Experiment variants

- Variant A: $19.99 pack first and highlighted; $5.99 pack second; monthly plan
  afterward.
- Variant B: $5.99 pack first and highlighted; $19.99 pack second; monthly plan
  afterward.
- Assign authenticated users 50/50 through the existing stable user-level
  experiment assignment.
- Run for seven days. Compare exposed users, paid conversion, and revenue in the
  existing `/admin/ab-tests` dashboard.

## Implementation

Reuse the existing AB experiment service, database tables, assignment and
exposure endpoints, admin dashboard, and checkout participant attribution. Add
the experiment boundary only around the compact pricing offers shown in the
insufficient-credit purchase dialog. Preserve the standard pricing page and
other pricing surfaces.

The experiment uses the top-up product scope so only credit-pack checkouts are
counted. Exposure is recorded by the existing AB test component after a variant
renders. Checkout requests already carry the assigned participant ID, allowing
paid orders and revenue to be attributed to the assigned variant.

Deploy the UI integration before starting the experiment. Create and activate
the experiment from the existing admin UI after deployment, so assignments do
not begin while the old UI is still live.

## Data and error handling

No schema changes are needed. If assignment cannot be loaded, render the current
default ordering and do not count that user in experiment exposure. Keep the
existing checkout error and fallback behavior.

## Acceptance

- The insufficient-credit dialog renders the assigned order and highlights the
  first credit pack's button in each variant.
- The normal pricing page remains unchanged.
- Exposures and top-up orders are attributed to the same participant/variant and
  appear in the existing admin experiment report.
- The production experiment is active with 50/50 allocation and a seven-day
  window after deployment.

## Out of scope

- New experiment tables or analytics dashboards.
- Changing prices, pack contents, subscription behavior, or checkout flows.
- Automatic statistical significance claims or experiment stopping rules.
