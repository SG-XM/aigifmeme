# Unified navigation

Approved in chat: keep the same top navigation across Home, Create, Chat, Library and Pricing. Home keeps the Create form, pricing, guides and footer. Dedicated creation pages focus on their tools.

- Top navigation: Logo, Create, Chat, Library, Pricing; active tabs include Home as Create and chat sessions/history as Chat.
- Right actions: credits, language/theme and account; visitors get Sign In.
- Create is public, has no sidebar, and gates uploads/generation behind existing authentication. Library and Chat retain authentication.
- Chat alone has a history sidebar with New Chat and recent conversations, and a separate mobile history button. Remove duplicated product/account navigation from that sidebar.
- Keep the preview pane and page actions. Offset sidebar and previews below the 64px top bar; fit the workspace into the remaining viewport height.
- Use one shared Header block on both marketing and agent layouts. No changes to generation, credit accounting, payment or database services.

Implementation: extend existing header props for active aliases and balance; configure content/query in Header; update AgentLayout and ChatsSidebar; adjust preview dimensions; add bilingual labels; run production build, typecheck, tests and desktop/mobile browser checks; publish through the existing Cloudflare deploy script.
