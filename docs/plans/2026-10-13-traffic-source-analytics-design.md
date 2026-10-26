# Traffic Source Analytics

## Goal

Give administrators a first-touch view of which UTM campaigns and external referrers lead to registrations, without adding page-view tracking or a third-party analytics dependency.

## Data flow

The request handler captures `utm_source` (or `refer` as a fallback), `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, and the external referrer hostname in 30-day cookies when each value is first seen. The user creation hook copies those values into attribution columns on the user record. The admin API aggregates registration counts over 7, 30, 90, or all days and requires `admin.*`. The admin page displays totals and breakdowns by source, medium, campaign, term, content, and referrer domain.

## Data handling

Values are length-limited and sanitized before storage. Referrer URLs are reduced to their hostname; paths and query strings are not retained. Existing accounts keep their current source field and are not backfilled with unavailable attribution values.

## Deployment

Apply the additive D1 migration, build with the production Cloudflare configuration, deploy the Worker, and smoke-test the public site and admin route/API.
