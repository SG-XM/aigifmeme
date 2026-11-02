# FileMeta Wipe crawlability and product evidence

Approved scope: restore crawlable homepage content, align claims with the
browser processor, add useful capability/verification content and public
About/Contact pages, and connect truthful schema entities. Commit and push to main.

## Evidence and implementation

- The live bare homepage returned a 200 shell without H1/body. A request with
  an unrelated query parameter returned the complete page. Local development
  renders the homepage correctly. Treat cached incomplete HTML as the first
  failure to address; do not disable SSR or rebuild the framework.
- Advance the marketing HTML cache epoch and validate completed homepage content
  before accepting a cached response or storing a newly rendered one. Invalid
  documents must not be publicly cached. Keep authenticated requests private.
- Keep the existing homepage appearance and local file processing. State the
  real document/image support, 10 MB input limit, and limitations. Add a
  capability table, explicit sample before/after values, verification steps,
  and primary-source references. Do not claim anonymization or redaction.
- Add About/Contact using the existing localized MDX page factory and support
  tickets. No unverified mailbox, legal entity, credentials, author or social
  identity will be invented. Use linked Organization/WebSite/WebPage IDs.
- Keep the existing FAQ/HowTo markup aligned with visible content; no new
  rich-result promises. Blog posts already use their stored authors.

## Validation

Focused cache regression tests must reject 200 empty shells and accept complete
documents, retaining existing cookie/session protections. Run metadata tests,
production build, localized HTTP checks without JS, and staged security scan.
Push only reviewed source changes; production deployment is outside this request.

## Integration with the latest main

Before pushing, origin/main advanced to bc544e7. Preserve its lazy metadata
engine import (the Workers PDF-library evaluation fix), image handling and
format tabs, additional content, query error boundary, and eleven FAQ entries.
Update our capability table and all locale copy to include JPEG/PNG/WebP/GIF.
Extend its existing document completeness check, reject incomplete cache hits,
and bump the cache epoch again. Re-run affected tests and both build targets
after integration. The repository-wide type checker reports errors in untouched
files; the changed source files have no reported type errors.
