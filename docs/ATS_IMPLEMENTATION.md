# ATS foundation: implemented, tested, not deployed

This branch adds actual code, not a claim of a fully autonomous job application agent.

## What's working in source

- GET `/api/ats/jobs?provider=greenhouse&board=COMPANY` — read-only job discovery.
- GET `/api/ats/jobs?provider=lever&board=COMPANY&region=eu` — regional Lever source.
- GET `/api/ats/jobs?provider=ashby&board=COMPANY`.
- `discover_public_ats_jobs` MCP tool with `provider`, `board`, optional `region`, `query`, `limit`.
- All job data is explicitly **not** an applicant eligibility decision, live-vacancy guarantee or permission to auto-submit. Board identity must be verified externally.
- Strict vendor API allowlist, URL slug validation, HTTPS, no cross-origin redirects, response size/time limits and controlled normalization. The provider APIs are read-only; application submission API keys are neither needed nor stored.
- Internal `ApplicationLedger` with tenant-ID predicates on every query, per-tenant job deduplication, CV/answers/form SHA-256 fingerprints, explicit approval, single-use submission attempts, receipts, cancellation and permanent quarantine of uncertain actions.
- SQLite migration `0003_ats_applications.sql` plus Drizzle schema and journal.

## Crucial limitations

**There is no public multi-user product yet.** The legacy `Career` service still uses owner-global configuration, CV storage, outreach, contacts, runs and event tables. A new tenant-scoped ATS ledger does not isolate those other resources. DO NOT disable the upstream owner-private site protection.

**Do not expose `ApplicationLedger` as an HTTP/MCP write endpoint.** Its constructor's `tenantId` MUST originate from independently verified server-side authenticated identity, never a `tenant_id` passed by a browser, query string, JSON body or model-supplied tool argument. Add verified identity/session handling and cross-tenant integration tests *before* wiring this service to public requests.

The ledger itself does not submit an application, navigate a browser, create portal accounts, verify employer confirmation or retain resumes/credentials. Never equate a local status transition with an actual ATS result. `confirm` must be called only by a trusted workflow after checking independent portal acknowledgement.

A browser worker, account-creation flow, encrypted session vault, interactive MFA/email-verification handoff, form extraction, human review UI, provider terms review and robust site-specific acceptance testing are still pending. No stealth or CAPTCHA bypass is planned.

## Test

```bash
node --test tests/ats.test.mjs
```

Tests cover: provider host injection rejection, Greenhouse/Lever/Ashby job normalization, tenant A/B isolation, dedupe, changed form/answer fingerprints, explicit consent, one-time submission, idempotent genuine receipt recording and quarantine of uncertain submissions. Network requests are mocked; no employer forms are touched.

Run the original cloud tests and full build before deployment. Existing work should remain unchanged by the additive `ats_applications` migration. Applying the SQL to production is an explicit deployment operation, **not** accomplished by merging to GitHub.

## Next implementation steps

1. Verified user identity per request, secure user sessions, per-tenant profile/CV/contact/outreach/R2 key namespace and consent policies.
2. Read-only discovery board registry and source review, matching and freshness tracking; tenant-scoped job saved lists.
3. Browser worker for selected, policy-permitted ATS sites with an approval checkpoint, user-assisted account sign-up and MFA.
4. Portal confirmation evidence to the ledger, task scheduling, connector telemetry and reconciliation.
5. Public MCP onboarding, permission review, observability, export/deletion and a multi-user security audit.

Sources: https://docs.greenhouse.io/job-board ; https://github.com/lever/postings-api ; https://developers.ashbyhq.com/docs/public-job-posting-api
