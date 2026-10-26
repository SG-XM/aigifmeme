# Compare two purchase UIs

This feature compares developer-supplied A/B components. It does not create UI designs. It records logged-in users' first exposure and associates checkout orders with their fixed group; it does not collect clicks or browsing paths.

## Connect the UI

```tsx
import { ABTest } from '@/components/ab-test';

// Mount only where the purchase UI is actually shown, not around a hidden dialog.
<ABTest
  scene="pricing"
  a={<PricingLayoutA />}
  b={<PricingLayoutB />}
  fallback={<PricingLayoutA />}
  loading={<PricingSkeleton />}
/>;
```

Create a draft at `/admin/ab-tests` with the exact same scene key. Choose plan purchases or credit top-ups, the percentage assigned to B, and the observation window. Start after both layouts are connected. Only one experiment can run per scene; configuration cannot change after starting. A stopped experiment cannot restart: create a new key for another run.

`Pricing`, `PricingTable` and `CreditTopUpDialog` already pass the wrapper's participant into checkout. For a custom checkout component inside the wrapper:

```tsx
import { useABCheckoutParticipant } from '@/components/ab-test';

const getParticipantId = useABCheckoutParticipant();
// Inside a TanStack Query mutation:
apiPost('/api/payment/checkout', {
  product_id: productId,
  ab_participant_id: await getParticipantId(),
});
```

The resolver waits briefly for the first exposure to be recorded. If analytics is unavailable, normal checkout continues without attribution. Outside an `ABTest`, it returns null. The checkout server validates ownership, exposure, purchase scope and observation window; a supplied version or another user's participant cannot override the server's decision.

## Statistics

- Participants are unique users with a recorded UI exposure; repeat visits keep the same group.
- Conversion is unique confirmed payers divided by participants. Multiple orders increase revenue, not payer count.
- Only orders created and paid inside the user's observation window are included. Confirmed provider payment time is used when available, so delayed webhook delivery does not move the payment date.
- Current conversion and revenue are provisional. Mature conversion uses only participants whose full observation window has elapsed.
- Revenue uses actual payment amount and currency, including zero amounts. Missing amounts are flagged; list prices are never substituted. Currencies are reported separately.
- Checkout users count persisted checkout orders. Provider session creation failures before an order is saved are not measured.
- Test amount overrides, detected Stripe test keys and Creem sandbox orders are excluded. Renewals have no initial UI attribution. Refunds are not subtracted in this version.
- Stopping ends new assignments; previously exposed participants can still purchase within their original window using existing context.
- Anonymous visitors see the fallback UI and are not included. Historical orders are not backfilled into experiments.

No real experiment is created or activated by the migration or deployment. The initial page is empty until an administrator creates a draft.

## Database rollout

`drizzle/0001_complex_vindicator.sql` only creates two tables and indexes, and adds nullable attribution/confirmation fields plus a default-false test flag to orders. Review before applying to production. Apply the migration before deploying the new Worker. Keep these additive columns/tables when rolling back application code; dropping them would destroy experiment history.
