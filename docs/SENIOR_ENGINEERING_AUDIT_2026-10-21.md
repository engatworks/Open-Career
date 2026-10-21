# Open Career — Release-Blocking Senior Engineering Audit
**Audit date:** 21 October 2026  
**Scope:** Source review and GitHub Actions verification of `engatworks/Open-Career`, including owner-private legacy routes, OIDC login, multi-user API and MCP, D1/R2 data paths, ATS discovery, watchlists, and scheduled polling.  
**Audit class:** Internal engineering assessment, **NOT an independent security assessment, pentest, legal opinion, SOC 2 audit or certification**.

## Executive decision

**NO-GO for commercial general availability and paid subscriptions.** The source has demonstrated promising tenant isolation with automated tests and now includes significant data-integrity fixes, but critical configuration and live integration evidence are absent. There is no production-tested shared host, real OIDC tenant registration, hosted secret rotation procedure, independent penetration test, external application submission implementation, or proved privacy/compliance workflow.

**Qualified GO for code review and isolated internal development; invite-only staging only after the P0 operator gates below.**

## Evidence and methodology

- Inspected: `lib/tenant-identity.mjs`, `lib/browser-auth.mjs`, `lib/release-security.mjs`, `lib/tenant-workspace.mjs`, `lib/application-ledger.mjs`, `lib/ats-discovery.mjs`, `lib/board-watch.mjs`, `lib/watch-scheduler.mjs`, API/MCP v1/v2, auth routes, `/join`, D1 schema/migrations, CI and relevant tests.
- Tested via GitHub Actions: in-memory SQLite with foreign keys, mock R2, signed RSA/OIDC fixtures, mocked Greenhouse/Lever/Ashby provider responses, session/CSRF, cross-tenant access, per-user quota, lease and scheduler behavior. Source tests are **not** evidence of actual production bindings or app marketplace review.
- Extended the verification harness with concurrent uploads, unavailable object storage, partially completed deletion recovery, stale profile revisions, scan consent withdrawal, unsafe API error handling and truncated provider feeds.
- Production build CI now runs in addition to TypeScript checks and all test files. Added production-dependency advisory checks and weekly update proposals. Security advisories still require operator triage, not automatic or blind package upgrades.
- External standards referenced: OWASP API Top 10 2023 and Cloudflare D1/R2 API guidance. Their existence does not constitute an Open Career audit or certification.

## Verified issues and repairs in this PR

| ID | Severity | Evidence / failure mode | Change and test |
| --- | --- | --- | --- |
| DI-01 | P0 integrity | Two CV uploads/replacements could race, silently replace a newer file or remove a still-referenced encrypted object | D1 compare-and-swap, lose-and-cleanup, concurrent first upload/replacement fault tests |
| DI-02 | P0 privacy & availability | Account deletion flips account to `deleting`, preventing future login; an R2 error previously stranded the user without a recovery path | Fail-closed state + idempotent private janitor and R2 prefix sweep; stuck R2 and orphan tests |
| DI-03 | P1 consistency | Large object namespace cleanup could exceed per-invocation limits, leaving deletion unable to advance | Bounded R2 deletion batches; later invocations continue until safe completion |
| UX-01 | P1 | Profile editor could submit server-generated `revision` and `updated_at` properties, causing self-rejected updates | Frontend submits only candidate-controlled fields; tests for stale edit and unsupported field |
| DI-04 | P1 | Parallel browser tabs or connected agents could overwrite a profile without knowing the other changed it | Atomic expected-revision CAS; old version rejected with HTTP 409 |
| CP-01 | P1 | A scheduler might scan a board selected earlier after user revokes `auto_scan` | Revalidate explicit consent in both SQL lease and just before provider fetch |
| SEC-01 | P1 | Public error responses could disclose unexpected D1, R2, implementation or stack exception messages | Allowlisted client errors with safe HTTP codes; unknown errors use generic service error |
| DATA-01 | P2 | Provider results limited to 50/100 jobs could be presented as a complete job-board view | Report `matched_total`, `partial_results` and visible UI caution |

An account in `deleting` is inaccessible even if its deletion cannot yet be finalized. The trusted scheduler adapter attempts to reconcile up to three such accounts per invocation, but **this cannot work until the scheduler is actually deployed and configured**. Operator support and incident alerting must be established first.

## OPEN P0 — launch blockers (not solved by merging source)

1. **Infrastructure isolation and authentication.** The owner-private v1 API and MCP can access the owner's CV and outreach history. `owner_private` still delegates authentication to the verified upstream private Sites gateway. Never expose this mode publicly. A separate public beta project must have its own D1/R2/credentials, OIDC client and origin. Test that every legacy route is 404 on that host (including CV payload), from both anonymous and logged-in tenant sessions.
2. **Real identity-provider + key management.** Provision a real confidential OIDC issuer and access-token audience, checked RS256/JWKS, verified email, MFA/account recovery, OIDC client key rotation, all secrets outside GitHub, and a backup/rotation protocol for tenant ID HMAC and CV encryption. Losing the derivation secret changes account identities; losing the encryption key makes CVs unreadable. Current fixed encryption envelope lacks key versioning and is not rotation-ready.
3. **Hosted D1/R2 failure-injection tests.** In-memory SQLite and mock R2 do not prove actual D1 concurrency, D1 read replication consistency, real Cloudflare R2 listing semantics, access control, backup restores or key availability. Test parallel CV replacement, object cleanup, account deletion, quota races and database migration/rollback on staging.
4. **Independent security review.** Validate OWASP authorization, resource consumption, JWT verification, OAuth redirects, CSRF, SSRF, upload/malware defenses, abuse prevention, browser XSS/CSP, cryptographic key handling, privileged cron secret rotation and impersonation scenarios. Threat-model MCP tool prompts and scope separation independently.
5. **Consumer data governance.** Real privacy policy, terms, retention schedule, legal basis, deletion/export evidence, encrypted logs, breach response, responsible data processing/hosting region, consent, and operational ownership. Cloud backup retention and any third-party ATS access must be disclosed and legally reviewed.
6. **Operational quality gates.** Health/readiness checks, observability, alerts for login/storage/scheduler failures, support channel, error budget/SLOs, WAF, incident runbooks, maintenance windows, key-recovery drills, load tests and rollback tests are missing or unverified.
7. **Commercial mechanics.** No real subscription/billing/cancellation/refunds/invoices/consumer disclosures/tax review, usage-based cost guardrails or anti-abuse policy. Do not take payment until entitlement and cancellation workflows are implemented and tested.

## OPEN P1 — product and reliability limitations

- **No portal account creation or completed applications.** ATS public listings, saved jobs, packet-fingerprint approval and a state ledger do not represent successful submission. First supported application flow needs browser permissions, user MFA/verification handoff, explicit final-form consent and independent portal receipt evidence.
- **Global discovery is not implemented.** Three ATS vendors are supported and users still supply the employer's board slug. No guarantee of comprehensive job listings, correct employer affiliation or visa/work-permit eligibility. Company ID verification, pagination and freshness checks are pending.
- **Scheduled monitoring is only an adapter.** No actual Cloudflare Cron/Queue integration or verified notification service has been deployed. Providers can return partial feeds, rate limit, change schemas or forbid certain automation.
- **Exports are bounded.** Current JSON export contains up to 500 contacts, 100 application records, 300 observed postings and 2000 events. It is not a guaranteed complete portability/privacy export for larger tenants. Implement paginated exports and a full export manifest before promising a complete account export.
- **Orphan CV objects on active accounts.** CAS failure attempts cleanup; if R2 deletion also fails while the account remains active, unreferenced encrypted objects can persist until account-level namespace cleanup. Add age-bounded orphan garbage collection with owner-safe references and retention policy.
- **Session and auth lifecycle.** Opaque 12-hour sessions work in tests but have no user-visible session list/revoke-all, automatic logout on privilege change, enterprise SSO/organization features, refresh/reauth UX or account linking across identity providers.
- **Observability and admin workflow.** No safe per-tenant operator diagnostics for stuck deletions or repeated failed providers, and no tested support mechanism for replay/repair without seeing customer secrets. Design role separation and privacy-safe audit logs.
- **ATS feed completeness and collisions.** Detection tracks observed IDs, not necessarily publication date. Results can truncate at 100. Reconciliation across multiple provider regions and deleted/reposted job IDs needs acceptance tests.
- **Accessibility and localization.** Independently verify keyboard control, screen readers, 200% zoom, focus management, WCAG 2.2 AA, full mobile coverage, Arabic/RTL and error feedback. Current CSS and TypeScript checks do not prove visual usability.
- **Security configuration**: internal trusted endpoint uses a bearer cron secret; verify secret redaction in logs, edge restrictions, rotation and replay protection. Cloudflare WAF/IP restrictions recommended in addition to source checks.

## OPEN P2 — optimization, scale and differentiation

- Add per-user filtering/ranking backed by verified evidence, job titles/country/work authorization and stable sources; measure harmful hallucinations and false sponsorship claims.
- Add job-board registry, public-source citations, provider policy validation, schema-change monitoring, source freshness/expiry and a clear explanation of matching decisions.
- Design a conservative retry/deduplication protocol for verified outbound email and ATS submissions. Never retry a potentially delivered message without reconciliation.
- Establish background worker backpressure, database indexes under load, tenant quota and storage budgets, D1 request-cost and R2 egress monitoring, cache policy, and rate-limit bypass tests.
- Only compare against commercial incumbents using objective real-world success metrics: accurate eligible matches, time saved, supported sites, verified application receipts, safety incidents, cost and user satisfaction.
- Implement commercial support, billing, permissions and plugin-marketplace installation/consent documentation as independent release tracks.

## Acceptance protocol to remove the NO-GO

**Gate A — staging availability:** isolated public beta host, actual OIDC, first migration through `0007_job_watchlists`, real separate test accounts, clear opt-in mode, no legacy routes. Capture real network traces and user-accessibility footage.

**Gate B — integrity:** real D1/R2 concurrent CV upload and delete/restore tests, forced R2 outage, forced D1 outage, complete deletion with orphan sweep, functioning backup and recovery, secret rotation rehearsal.

**Gate C — security:** independent penetration test with zero unresolved P0s, all P1s triaged with owner/ETA/mitigation, legally reviewed privacy/terms, tested rate limits and MFA, no leaked credentials.

**Gate D — workflow:** at least one supported full job application end-to-end with a real user approval, portal confirmation and correct failure reconciliation. Demonstrate neither false receipt nor duplicate submission.

**Gate E — paid beta:** instrumented SLOs and alerting, customer support, pricing/entitlement/cancellation/invoice tests, observed unit economics, consumer disclosures, rollback and incident drills, explicit launch sign-off by operator.

## Reproducible source verification

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
node --test tests/*.test.mjs
node node_modules/drizzle-kit/bin.cjs check
node node_modules/typescript/bin/tsc --noEmit
corepack pnpm audit --prod --audit-level high
corepack pnpm build
```

The audit closes **only** when these run successfully on the final exact GitHub commit and the external gates above have actual evidence. Passing CI alone cannot authorize public signup or payments.
