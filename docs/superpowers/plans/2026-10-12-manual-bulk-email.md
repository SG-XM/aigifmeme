# Manual Bulk Email Implementation Plan

> **For agentic workers:** Execute this plan inline in the current Codex session. Do not delegate subtasks.

**Goal:** Let an admin manually compose and send one email to selected users and pasted addresses, with test send, progress, and failed-recipient retry.

**Architecture:** Add an email-provider factory shared by authentication and a new admin-only campaign API. Extend the existing users page with selection and a compose dialog; the browser resolves recipients, then sends them in 25-recipient requests through the configured provider.

**Tech Stack:** TanStack Start file routes, React, TanStack Query, `@/lib/api-client`, Drizzle, existing `EmailProvider`, Paraglide messages.

---

## File map

- Create `src/core/email/configured-provider.ts` to select the already configured Resend or Cloudflare provider.
- Modify `src/core/auth/index.ts` to use that shared provider factory for verification and password-reset messages.
- Create `src/routes/api/admin/email-campaign.ts` for admin authorization, recipient resolution, test delivery, and per-recipient send results.
- Create `src/components/admin/manual-email-dialog.tsx` for composition, preview, test send, batch progress, result display, and failed-recipient retry.
- Modify `src/routes/admin/users.tsx` to select individual users or all users matching the active search and open the dialog.
- Add matching translation keys to `messages/en.json`, `messages/zh.json`, and `messages/es.json`.
- Let the TanStack Start plugin regenerate `src/routeTree.gen.ts` if the new API route requires a route-tree change.

## Task 1: Share configured email-provider creation

- [x] Create `configured-provider.ts` with `createEmailProviderFromConfig(configs)` that returns `{ provider, from }` for a fully configured Resend or Cloudflare provider, otherwise `null`.
- [x] Replace the private provider-selection function in `core/auth/index.ts` with the shared helper; keep auth behavior and its existing missing-provider handling unchanged.
- [x] Confirm the helper is server-only by importing it only from auth and API route files.

## Task 2: Add admin campaign API

- [x] Create one POST route at `/api/admin/email-campaign`; check the session and `admin.*` permission before parsing or processing each action.
- [x] Define actions `resolve`, `test`, and `send`. `resolve` accepts either selected user IDs or an all-matching search query, plus pasted addresses; it loads user emails from the DB, validates addresses, normalizes case/whitespace, deduplicates, and returns the recipient list with a 5,000-recipient ceiling.
- [x] `test` validates one test address, subject, and plain-text body, then sends exactly one message through the configured provider.
- [x] `send` accepts at most 25 resolved addresses, subject, and body; use bounded concurrency of five provider calls and return per-address success/error results without failing the whole request for one provider rejection.
- [x] Reject empty subject/body, overlong content, malformed email addresses, missing provider configuration, unknown actions, and oversized payloads with `respErr`; avoid returning provider secrets or raw stack traces.

## Task 3: Add the compose dialog

- [x] Create `manual-email-dialog.tsx` using controlled subject/body/test-address fields and a recipient preview list.
- [x] Add a preview mode that renders the plain-text subject/body without interpreting user content as HTML.
- [x] Implement test-send mutation against the `test` action and show success/failure inline.
- [x] Implement sequential 25-address chunks against the `send` action, show sent/total progress, collect successes and failures, and disable duplicate submission while work is active.
- [x] Add a retry action that resends only failed addresses with the unchanged subject/body; retain the composed content until the dialog is closed.

## Task 4: Add recipient selection to user management

- [x] Add a checkbox column to `admin/users.tsx` and retain explicitly selected user IDs while paging.
- [x] Add toolbar actions to select the current page, select all current search results, clear selection, and open the email dialog; the all-results mode takes precedence over individual selection.
- [x] Resolve final recipients through the API before opening the composer so deduplication and the displayed recipient count match server behavior.
- [x] Clear user selection after a successful campaign or when the admin explicitly clears it; preserve selected rows on partial failure.

## Task 5: Translations and build verification

- [x] Add every new user-facing string to English, Chinese, and Spanish message JSON files.
- [x] Run `pnpm build`; fix any TypeScript, Paraglide, route-generation, or bundling errors.
- [x] Review `git diff --check` and the full diff, then run the repository security scanner before each commit.
- [x] Commit the implementation, push the requested branch, and prepare the Cloudflare deployment summary for final confirmation.

## Self-review

- The design's recipient selection, pasted addresses, provider reuse, test send, confirmation/progress, partial failure, and retry are covered by Tasks 1–4.
- The design explicitly excludes scheduling, saved drafts, rich-text editing, and persistent campaign history; no task adds those systems.
- User-entered content is sent as plain text, and the route always derives selected-user email addresses from the database.
