# Desktop Burning Bridges promo bar

## Goal

Guide desktop visitors from any page, including the authenticated workspace, to the Burning Bridges AI experience.

## Design

Render a compact link in normal page flow above route content. Use the current theme's primary color, rounded styling, and a shadow so it reads as a floating callout without covering page content. Use the existing localized Burning Bridges title and tagline. Hide it below the desktop breakpoint and on `/burning-bridges-ai`, where the destination content is already visible.

## Implementation outline

- Add a shared promo bar to the root layout so public pages and the workspace receive the same treatment.
- Use the locale-aware internal `Link` and existing message keys.
- Let the public sticky header remain at the viewport top after the promo bar scrolls away.
- Build, scan the pending changes, and deploy through the repository's Cloudflare workflow.
