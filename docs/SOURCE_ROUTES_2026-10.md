# Open Career 0.4.2 — evidence and referral routes

Reviewed 18 October 2026. The improvement targets source yield, not email volume.

## New routes

1. OEM → Saudi partner → current named engineer. Country representatives, certified integrators, panel builders and service firms can publish names missing from generic directories. Preserve the OEM relationship source and separately verify the actual employer and person. Do not confuse AS-Schneider with Schneider Electric.
2. Saudi project announcement → delivery contractor → engineering or maintenance manager. A project is a relevance signal, never evidence that a paid junior vacancy exists.
3. Public technical community → relevant professional → verified employer source. IET local networks and ISA events offer referral context. Membership is not acquaintance; event registration, public posting or bulk member messaging are outside automatic outreach.
4. Partner talent portals: search an OEM's ecosystem as well as its corporate careers page. Siemens DI Software's partner portal is an example. Verify geography and every eligibility criterion.

Original starting points are in `lib/source-catalog.mjs`; `/api/research-plan` returns routes and bilingual search prompts. Queries remain a plan until actually searched. For every reviewed employer record actual queries, source URLs, selection reason, conflicting employment evidence and limitations. No paid enrichment or email pattern guesses.

## PDF evidence

`unpdf` (MIT, https://github.com/unjs/unpdf) provides serverless PDF.js parsing. Public source retrieval accepts text HTML and application/pdf with robots checks. PDF limits are 2 MB, 30 pages and 120,000 extracted characters; inspection returns at most 40,000 text characters with per-page truncation flags. Parsing is sequential and text-only, with eval, image rendering and external font fetching disabled. Byte/page/text limits reduce resource exposure; they are not a hard CPU sandbox. Cloudflare runtime resource limits still apply.

Source hashes fingerprint the exact downloaded bytes. Queue and reservation both re-fetch evidence. Every PDF quotation must exist wholly within one page. Extraction does not infer name ownership: agents must inspect the original layout, especially columns, and corroborate current roles. No OCR, password handling, script execution, embedded attachment reading or address inference. A historic PDF does not become current because it was retrieved today.

Blocked, scanned, encrypted or oversized sources remain held. Redirects across origins remain held and now show the public destination path for a separate robots-checked inspection. Same-origin redirects re-check robots at every hop. Empty HTML receives an explicit JavaScript-shell diagnostic.

## Delivery

The exact saved CV and Gmail workflow are unchanged. Read actual replies and Sent before queueing. One recipient per employer, current role and exact published work email, two original sources, approved candidate evidence, live delivery enabled, successful atomic reservation, one native Gmail send, actual message/PDF readback, provider receipt. No automatic followups or resend of an uncertain delivery. Do not treat these new routes as a claim of complete Apollo-equivalent coverage.

## Validation

27 domain tests cover source evidence, changed PDFs, page-boundary ownership, resource limits, robots/redirects, CV byte identity, dedupe, suppression, receipts and concurrent rolling-cap reservations. Production build and deployed source inspection must also pass before release is claimed. No browser UI changes beyond the version label are intended.
