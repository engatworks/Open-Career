# Open Career — cloud edition 0.5.1

Your private career workspace, driven by ChatGPT cloud research and your connected Gmail. The core workflow does not require an always-on laptop, Ollama, a separate inference API key, or exporting your Gmail authorization.

The deployed Site provides D1 records, private R2 CV storage, source verification, immutable attachment fingerprints, dedupe, single-run tracking and a 25-send Riyadh calendar-day reservation cap. ChatGPT researches original public sources and writes messages. The native Gmail tool receives the exact multipart message returned by the tracker.

## Important operational distinction

A saved task, successful deployment or interactive Gmail test does not prove unattended delivery. Community reports describe scheduled sends being blocked while interactive calls work. A verified background send/attachment test establishes this account's current scheduled path; provider permissions and platform behavior may change.

The site is owner-private and relies on platform authentication. Its native MCP plugin exposes the same protected operations. Sites service access is separate from visitor Gmail consent; the tracker never proxies Gmail writes or stores Google tokens.

## Cloud workflow

1. Retrieve `/api/agent-context` and outreach history, or use the private MCP tools.
2. Claim a research run; use the discovery pool to deeply research up to 25 Saudi employers of all sizes, prioritizing relevant named people.
3. Record actual company/person/project sources, published named-person work email or explicit official careers-inbox invitation, contact role and candidate evidence. Preserve supervised scope. Reject ineligible vacancies, then separately consider an honest speculative paid-junior referral inquiry. No advertised vacancy or job-board account is required. Careers inboxes require a documented named-person search first.
4. Submit packets through `queue_verified_outreach`; the tracker independently re-fetches cited quotations and freezes CV/profile state.
5. `prepare_delivery` atomically reserves one contact and a quota slot, returning an exact Gmail MIME tree with CV.pdf.
6. Forward that object unchanged through the connected Gmail tool. Record actual returned Gmail message/thread IDs, then reconcile replies and declines.
7. If the provider call is uncertain or safety-blocked, hold the reservation, report the stated reason and never retry or move the rejected action to another route.
8. Finish each run with counts computed from stored records. Insufficient evidence yields a partial run, never invented recipients.

## Development

This Sites/Vinext/Cloudflare Workers project uses D1 and R2 bindings provisioned by hosting. No personal profile, CV, token or recipient history is committed. Upload setup through authenticated API operations after publication.

```sh
node "$SITES_PNPM_BIN" install
node --test tests/cloud.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/prepare-career-ui.mjs
node /path/to/sites/scripts/build-site.mjs
```

Use the supported Sites workflow for source synchronization, migration application, packaging and private publication. Keep `.openai/hosting.json` identity and bindings; migrations are immutable once applied. The `ui/` source and preparation script preserve the previously tested responsive design.

## Proven limitations

Quotations prove publication, not complete semantic truth; the research agent must also review facts and prose. Some websites block fetches or omit a trustworthy recruitment route. Recipient yield can fall below 10. Confirmation of a Gmail send and D1 receipt is not a distributed transaction; ambiguous outcomes remain quarantined. No automated follow-ups or reply-body actions occur outside the authorized job outreach scope.

The old Python edition remains an optional local developer toolkit, not the required deployment model. The public GitHub repository is a sanitized source mirror. Private Sites hosting has its own deployment history; updating GitHub does not automatically deploy the private workspace.

See `docs/RESEARCH.md` and `docs/CLOUD_RUNBOOK.md` for decisions and acceptance checks.

## People-first contact discovery

Use `POST /api/research-plan` with a company domain for English/Arabic search queries. Use `POST /api/source-inspection` with a public HTTPS page to retrieve exact published emails, local contact contexts and further source links. This uses the MIT-licensed htmlparser2 already in the app. It does not infer people, generate addresses, probe mailboxes or provide an Apollo-sized contact database. Named ownership and current role still need source review.

The Research screen offers the same page explorer. Run reports and the dashboard distinguish named-person deliveries from recruitment-inbox deliveries. See `docs/CONTACT_DISCOVERY.md` for the free-tool comparison and remaining limits.

### Contact database

The private Contact database page searches persistent people/address candidates and a separate company inventory. Bounded original-page collection retains provenance; permitted CSV imports never confer delivery eligibility. See [Database workflow](docs/DATABASE_WORKFLOW.md).

## Experimental ATS job discovery (merged 21 October 2026)

The source now includes read-only official job-board discovery for **Greenhouse, Lever and Ashby**. The private deployment must be updated separately; committing source does not publish a new Site version.

- Private API: `GET /api/ats/jobs?provider=greenhouse&board=BOARD_NAME` (also `lever` or `ashby`; Lever supports `region=eu`).
- Native MCP: `discover_public_ats_jobs` with `{provider,board,query?,region?,limit?}`.
- Application tracking foundation: tenant-scoped `ApplicationLedger`, additive SQL migration, reviewed CV/form/answer fingerprints, consent-based approval, one submission attempt and uncertain-state quarantine. **No write endpoints are exposed.**

This is not yet a public multi-user agent or an automated portal applicant. Existing candidate profiles, CVs, contact records and outreach remain owner-private and must be redesigned with authenticated tenant isolation before user registration can safely be opened. ATS account signup, browser form filling, MFA handoff and application submission are not yet implemented. See [implementation details](docs/ATS_IMPLEMENTATION.md) and [roadmap](docs/MULTIUSER_ATS_ROADMAP.md).

## Authenticated multi-user workspace (alpha source, 21 October 2026)

The codebase now includes a separate, **fail-closed OIDC-authenticated** workspace at `/api/v2/*` and `/mcp/v2`. It derives each tenant ID from a cryptographically verified identity token, stores candidate profiles and contacts with tenant-scoped SQL, encrypts each user's CV with AES-256-GCM before R2 storage, and isolates ATS application tracking. It supports private export and explicit account deletion. The security tests exercise two simulated users with real RSA signatures, SQLite and mock R2; existing outreach tests remain intact.

**Not a public multi-user release.** A production identity provider, OAuth login UX, key provisioning, staging deployment and full access-control audit are still needed. The current owner-global `Career` API/MCP and private legacy CV/history must remain owner-private, never exposed on a public multi-user host. GitHub merges do not automatically update the private deployment. See [multi-user setup and security gates](docs/MULTITENANT_AUTH_IMPLEMENTATION.md).


## Browser sign-in and onboarding (alpha)

A dedicated, responsive `/join` screen now provides a real sign-in/onboarding front end for the private, tenant-scoped v2 workspace. It includes a candidate profile editor, encrypted CV upload/download, Greenhouse/Lever/Ashby public job discovery, saved opportunities, contact records, workspace export, logout and account deletion.

The sign-in backend uses OpenID Connect Authorization Code + S256 PKCE with one-use state/nonce and server-side ID-token verification; opaque revocable HttpOnly cookies protect browser sessions, with CSRF checks on mutations. No provider tokens are stored in browser JavaScript. [Authentication setup and release checks](docs/BROWSER_LOGIN_IMPLEMENTATION.md).

**Not yet deployed or open to registrations:** OIDC provider credentials, stable HTTPS domain, secrets, real staging tests and separate protection for the legacy owner-only API are prerequisites. Without these settings, `/join` safely displays a registration-unavailable state. Saving a job does not submit an application.

## Commercial-beta isolation (21 October 2026)

**The default deployment is now closed.** Set `OPENCAREER_ACCESS_MODE=owner_private` explicitly to retain the existing privately hosted owner's tracker (and verify the Sites gateway is owner-only); or `OPENCAREER_ACCESS_MODE=multiuser_beta` for a **separate** invitation-only tenant site. `multiuser_public` is reserved for a later, independently approved launch. Missing/invalid access mode denies legacy API, MCP and account signup.

Public v2 job discovery uses `GET /api/v2/ats/jobs` with signed tenant identity and atomic rate limits. `OPENCAREER_BETA_EMAIL_ALLOWLIST` restricts first-time registrations to verified invitees; both OAuth callback and direct REST/MCP onboarding enforce it. **Do not deploy this change to the current owner-private Site without updating the explicit access-mode setting first.**

Full details, comparisons, rollout and commercial go/no-go gates: [Commercial Beta Gates](docs/COMMERCIAL_BETA_GATES.md) and [Security Policy](SECURITY.md). This is source hardening, not a public launch or claim of compliance.

## Tenant employer watchlists (pre-release)

Multi-user workspaces can now save verified-by-user Greenhouse, Lever and Ashby employer boards, retain observation history, and distinguish new listings on later rechecks. The first successful scan establishes a baseline rather than claiming all existing jobs are new. Each owner can opt in or out of background checks per board; no applicant documents, email outreach, portal accounts or application submissions are sent from the watch engine.

The repository now includes a tightly bounded, secret-protected `POST /api/internal/watch-scan` entrypoint for a **future trusted cloud schedule**. It checks at most three explicitly opted-in boards per invocation. It is **not yet scheduled in a deployed production environment** and does not send email alerts. See [employer monitoring documentation](docs/EMPLOYER_WATCHLISTS.md).

This source capability must not be deployed publicly until the [commercial release gates](docs/COMMERCIAL_BETA_GATES.md) are independently validated, including owner/private data isolation, real OIDC accounts, staging database and storage, abuse controls and privacy compliance.

## Release-blocking engineering audit — 21 October 2026

See the [senior engineering audit, concrete remediations and unresolved launch gates](docs/SENIOR_ENGINEERING_AUDIT_2026-10-21.md).

The latest changes introduce concurrent-CV compare-and-swap semantics, resumable R2/D1 account deletion, optimistic profile revisions (including the browser editor and MCP), stronger scheduled-monitoring consent enforcement, explicit ATS feed truncation reporting, safe error classification, complete-regression test execution and a verified production-build CI step.

The source now uses patched Next.js, React Server Components and related runtime/build dependencies. The pnpm lockfile is regenerated and the production high/critical advisory check is a mandatory CI gate. One **unpatched dev-only transitive advisory in `braces`** remains tracked as [issue #12](https://github.com/engatworks/Open-Career/issues/12), without independent risk acceptance. Do not state that the product is vulnerability-free.

**No public/commercial launch:** a real, segregated staging deployment, OIDC provider setup, independent security review, complete export/data lifecycle, contractual/privacy review, billing and supported portal submission evidence are not yet delivered. Keep the legacy owner workspace private, and do not interpret GitHub CI success as actual customer-data security certification.

## Candidate data lifecycle safeguards (pre-release)

The multi-user source now supports [versioned OCV2 CV encryption and rotation](docs/DATA_LIFECYCLE_AND_KEY_ROTATION.md) while preserving existing OCV1 ciphertext; tenant-owned paginated data exports; browser-session inventory, selective revocation and sign-out-everywhere; and optional, strictly age-gated R2 orphan cleanup with expired session/transaction housekeeping.

These capabilities require a **real versioned keyring stored in hosting secrets**, the additive D1 migration `0008_lifecycle_maintenance`, and a trusted separately deployed scheduler for garbage collection. No real user CVs have been bulk re-encrypted, deleted, exported or moved by these source changes. The old `/api/v2/export` endpoint is retained only as a **partial** legacy export, and a live-data export is explicitly **not** an atomic multi-table snapshot.

Before commercial registrations or customer billing: validate OIDC, actual Cloudflare D1/R2 behavior, backups/key custody, complete privacy-retention workflows, independent security assessment and support operations. Review the [senior engineering audit](docs/SENIOR_ENGINEERING_AUDIT_2026-10-21.md) and [commercial beta gates](docs/COMMERCIAL_BETA_GATES.md).

## Safe tenant identity continuity (migration required)

A new immutable signed-OIDC **issuer + subject → tenant ID** registry prevents already-linked accounts from changing identity when the tenant-HMAC derivation secret is rotated. Deployment requires additive `0009_stable_identities`, successful linking of *all existing active users while retaining the old derivation secret*, and a read-only mapping-coverage check before rotation. Unmapped legacy accounts require identity-verified operator reconciliation; email equality **never** automatically transfers one account to another.

See [stable identity rotation procedures](docs/STABLE_IDENTITY_ROTATION.md). No live derivation-key rotation or existing-account migration has been executed.
