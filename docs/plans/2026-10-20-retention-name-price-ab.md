# Retention name-your-price A/B test

Scene `video-retention-offer-v2`, experiment key `retention-name-price-v1`.
50/50, top-up scope, 7-day window. Migration `drizzle/0016_retention_name_price.sql`
inserts the four hidden products and a **draft** experiment. It does not start
the test and does not change `single_retention_v2`.

## Variants

- **A (control):** today’s retention modal and the fixed catalog product
  `single_retention_v2` (live D1 price stays whatever it already is, currently
  $6.99; the seed default is $7.99).
- **B (treatment):** “Hidden deal / Name your price” modal with the werewolf
  dance clip. Chips are $4.99, $5.99, $7.99, $9.99. Default chip is $5.99.
  Typed amounts snap to the nearest chip inside that range. Checkout charges
  that chip for 10 credits.

Closing the paywall still issues one 30-minute offer per account. Closing the
offer minimizes it to the corner pill in both variants. With no running
experiment, everyone sees control.

## Payments

Stripe Checkout already builds a one-time `price_data` amount from the catalog
row (`unit_amount` in cents) and pins USD for `retention_*` idempotency keys.
No new Stripe Product or Price is required, and this does not switch the
secret key between test and live.

Catalog rows (hidden from `/api/top-up-products` and from email recall):

| Product id                  | Amount | Credits |
| --------------------------- | ------ | ------- |
| `single_retention_name_499` | 499    | 10      |
| `single_retention_name_599` | 599    | 10      |
| `single_retention_name_799` | 799    | 10      |
| `single_retention_name_999` | 999    | 10      |

Checkout accepts a name-your-price id only when the buyer is an exposed variant
B participant in this scene, the offer is still active, and the catalog row is
still exactly that chip price, USD, and 10 credits. The client cannot send an
arbitrary amount.

## Start

1. Apply migrations (`pnpm db:migrate`, or `wrangler d1 migrations apply` for remote D1) so `0016` is in.
2. In Admin → Top-ups, confirm the four rows above. Do not edit their prices or credits while the test runs. Leave `single_retention_v2` at its current price.
3. Admin → A/B tests. Open **Retention name your price** (`retention-name-price-v1`) and click Start. If the draft row is missing, create it with scene `video-retention-offer-v2`, scope credit top-ups, B = 50, window 7 days, then start it.
4. Exposures and top-up orders show on that experiment’s report. The paywall stage is the number of people who saw the offer.

## Verify

- Dismiss the insufficient-credit paywall while signed in with a photo and not enough credits. The offer opens and the corner pill remains after “No thanks” or the close button.
- Two accounts split between the current timed offer and the name-your-price modal. The treatment modal plays the werewolf dance video.
- On the treatment, select $7.99 and start checkout. The Stripe session amount is 799 cents and the order product id is `single_retention_name_799`. $4.99, $5.99, and $9.99 map the same way to `single_retention_name_499`, `_599`, and `_999`. A variant A account cannot buy those product ids.
- The public pricing catalog still lists `single_v2` / `duo_v2` and none of the retention ids.
- Duo upgrade still appears after a paid single or retention purchase, including a name-your-price purchase.
