# Admin funnel analytics design

## Goal

Show the product conversion funnel inside Admin, both across all visitors and split by A/B experiment variant.

## User-facing behavior

- Add a global funnel view in Admin with these stages: photo selected, login succeeded, paywall shown, checkout created, and payment confirmed.
- Show unique visitor counts, conversion from the previous stage, and drop-off at each stage.
- Add the same stage visualization to A/B experiment results, grouped by variant.
- Use Recharts, already available in the project, and follow the current Admin layout and translations.

## Data and event flow

Use a canonical funnel-event record. Record events when a visitor selects a photo, when an authenticated session is identified, when pricing is visible, when checkout creation succeeds, and when payment is verified. The upload API requires a signed-in user, so photo selection is the first observable step in the pre-login flow. Use the anonymous visitor cookie to connect pre-login events and attach the user ID after login where possible. Do not store uploaded media URLs, image data, or payment credentials in analytics events.

An Admin API aggregates distinct visitors per stage for the selected date window. The global view includes all visitors. Experiment reports filter the same records by experiment and variant. Existing A/B summary metrics and revenue reporting remain available.

## Storage and compatibility

Add the event table to all supported dialect schemas (SQLite, PostgreSQL, MySQL) and generate a migration using the repository's migration workflow. Historical rows cannot reconstruct every funnel step, so the complete funnel begins collecting when the new instrumentation is deployed. Keep order/payment accounting authoritative in the payment/order system.

## Failure handling and access

Analytics writes must not block uploads, login, paywall rendering, checkout, or payment processing. Validate event names and attribution server-side, rate-limit client-originated events, and require Admin authorization for aggregate endpoints. If event persistence is unavailable, the product flow still succeeds.

## Verification

Check event attribution across anonymous-to-authenticated transitions, unique visitor counting, A/B variant filtering, date-window filtering, and verified payment recording. Verify the global and experiment charts render empty/loading/error states. Run the repository build after implementation.

## Checkout diagnostics (added later)

The five stages above are unchanged. Additional events on the same `funnel_event` table, stored in `metadata` (`0015_funnel_event_metadata.sql`): `checkout_click`, `checkout_signin_redirect`, `checkout_create_failed`, `checkout_redirected`, `checkout_cancel_return`. Admin counts them outside the conversion chain. Sign-in keeps `checkout` and `checkout_from` on the return URL and resumes that product. A cancel return does not resume.
