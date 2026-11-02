# Inner pages follow the FileMeta Wipe homepage

The existing homepage is the approved visual reference. Reuse its paper
background (#f4f1ea), evergreen primary (#0e6b64), dark green text (#14221f),
and warm card surface (#fffdf8). Keep Plex Serif for public editorial headings
and Plex Sans for forms and data. Preserve layouts, content and business logic.

Promote those colors to global semantic tokens, including inputs, popovers,
charts and sidebars. Make light the default while retaining explicit theme
preferences; the dark variant uses the same green family. Public content pages
share the homepage surface, header and footer. Auth pages use the same paper
background and rounded cards; app shells keep their table-friendly layout.
Replace legacy gold/orange colors in the auth and purchase dialogs with semantic
brand tokens. Do not edit components/ui primitives or enable the hidden pricing
page. Preserve previous pending content, size-limit and visibility changes.

Validate production build, existing purchase/auth/cache checks and visual
inspection of public pages, auth forms and representative app shells. Check
contrast and narrow layouts; do not bypass authentication to reach private pages.
