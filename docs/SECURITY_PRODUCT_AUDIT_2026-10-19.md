# Open Career — code, security, product and operational audit
Date: 2026-10-19. Scope: development PR #2 based on existing private cloud 0.5.0. This is a static/source + automated-test review, NOT penetration testing, real browser QA or a deployed staging inspection.

## Release decision: NOT SAFE TO DEPLOY YET

The current PR contains useful new code and regression tests, but it is intentionally gated on unresolved issues. In particular, all old outreach/contact/CV records are still shared single-owner tables. Merely checking that a caller is any signed-in ChatGPT account is NOT a valid tenancy boundary. Do not turn the private Site public and do not merge or apply migrations over live D1/R2 yet.

## Severity and audit findings

### BLOCKER / P0 — Single-owner data boundary incomplete
- Files: app/api/[...path]/route.ts, app/mcp/route.ts, app/api/mvp/consent/route.ts, app/api/mvp/applications/route.ts, lib/private-owner.mjs.
- Fixed: the legacy REST and MCP private GET/tool reads now require authentication and research:read grants. This closes the previously implicit reliance on a protected host for CV and contact reads.
- NOT FIXED: all four private routes still need an explicit configured OWNER ID check. The private-owner helper exists, but attempted integration was blocked by the code-write tool and is NOT active.
- Consequence if hosting audience is broadened: another signed-in identity could accept its own grants and access the legacy shared CV, configuration, research and employer history.
- Remediation: provision owner_chatgpt_user_id securely in D1 configuration, never by first-user auto-enrollment; invoke await assertPrivateOwner(env.DB, authenticatedUserId) on every private REST and MCP tool call, including consent. Test with owner, second authenticated account, no owner configured, and missing/forged identity. Keep Site owner-private. tests/private-owner-security.test.mjs deliberately fails until this is wired.
- Independent source: https://github.com/microsoft/mcp-for-beginners/blob/main/02-Security/mcp-security-best-practices.md

### BLOCKER / P0 — Outbound Gmail acceptance is not independent receipt verification
- Files: lib/career.mjs receipt(), app/api/[...path]/route.ts POST /receipt, app/mcp/route.ts record_delivery.
- The server accepts a reservation token plus caller-supplied Gmail-looking message/thread IDs and marks the row sent. It cannot itself verify that connected Gmail actually sent that recipient-specific CV-bearing message.
- The /api/verification endpoint accepts caller-supplied background_send and attachment_sha256 metadata with broad records:write grant. This can cause a false positive readiness check.
- Remediation: do not expose verification metadata as generic user/agent writable settings. Verify exact Gmail account, message, recipient, CV attachment hash, provider/thread receipt and provenance through a controlled integration, or conservatively label an external provider report as unverified. Require bound evidence for receipt transitions. Keep sending disabled until proven.
- A Gmail Sent label is not proof of inbox delivery; subsequent bounces/restricted aliases must be reconciled. Previous Dammam campaign had bounce/invalid-recipient examples.

### BLOCKER / P1 — Deployment and host compatibility unproven
- Cloudflare/Sites deployment state and current owner header propagation have NOT been tested; the GitHub mirror is not auto-deployed. Claude remote MCP auth has no verified adapter. app/mcp/route.ts advertises one protocol version in discovery and another in initialize; review against currently supported MCP host transport/auth requirements.
- No staging R2/D1 backup, migration dry run, browser interaction, user approval takeover, Work scheduling run, or actual ATS submission receipt has been verified.
- Migration 0003 was added manually; the Drizzle journal was updated but there is no 0003 snapshot in drizzle/meta. drizzle-kit check passing does NOT prove next generate will be safe. Generate/verify a canonical snapshot before creating migration 0004.

### P1 — Asynchronous agent submission correctness
- FIXED: lib/mvp-workflow.mjs application state changes now compare-and-swap on old state. Duplicate prepare operations return the existing row. Ambiguous/unverified states do not automatically resubmit.
- FIXED: agent evidence cannot override its trusted source marker with evidence.source.
- REMAINING: the MCP backend does not actually navigate sites or receive independent ATS receipts. User attestation with a reference is explicitly labelled user_attested, not employer-verified.
- Need profile field templates, mandatory answer review, per-portal account-session handoff, suitable work authorization handling, job posting freshness and eligibility, and a real receipt capture pilot.

### P1 — Incomplete secret handling and permission surface
- FIXED: account registry rejects unknown fields including password/credentials; no password stored.
- FIXED: accounts:credentials_store has been removed from the active supported scope list since the vault is not implemented.
- REMAINING: browser accounts and OTP need an external password manager or audited encrypted, isolated vault; the user permits credential storage, but permission alone is not storage security. Never reuse a single password across all portals.
- Public Terms and privacy text remain DRAFT. Human clickwrap, actual operator and jurisdiction, user export/deletion, data retention and processors need independent legal/security review.

### P1 — Untrusted source-to-action boundary
- The source scanner checks robots, HTTPS, redirects, types, size and exact snippets. But publication of an email or vacancy does not prove the recruiter is current, inbox works, vacancy accepts the applicant, or that scraped page instructions are trustworthy.
- Add explicit untrusted-text to structured-facts extraction, no tool instructions from HTML or inbound emails, independent current-role checks, and tested source refresh limits.
- Our actual field work showed that map pins do not prove accessible entrances; similarly links do not prove accessible or useful job portals.

### P2 — Source-network and resource limits
- app/mcp/route.ts checks Content-Length but reads JSON without an independent streamed byte ceiling: requests without Content-Length may exceed the intended limit. Bound actual bytes. Validate JSON-RPC methods, tool args and content type centrally.
- Source URL filters reject some internal network targets and cross-domain redirects, but URL syntax checks cannot rule out DNS rebinding or all private-network aliases; run outbound fetch through an enforced public-domain egress policy where available.

### P2 — Quality, usability and observability
- Applicant-history read/confirmation API exists but the planned applicant-history page was blocked during code authoring, so the full UI is missing.
- The standalone consent UI exists but no real browser/mobile accessibility test was completed. Do not market as premium or polished until screenshots, navigation, error states, keyboard use and small-screen QA are performed.
- No SLA/usage model measurements, no full cross-host compatibility matrix, no daily/twice-daily Work consumption benchmark; a paid host subscription does not imply unlimited autonomous use.
- Default settings and discovery workflow are Saudi-focused. Global locale, nationality, schooling/credential equivalency and legal work authorization need configurable profiles before broader rollout.

## What the review changed in PR #2
- Protected legacy CV/profile/contact GET and MCP reads with signed-in + research:read grants.
- Atomic application state transitions + trusted evidence provenance and additional tests.
- Reject arbitrary portal-account secret fields, and hide unsupported credential-storage scope.
- Added explicit owner-check module; this is NOT integrated due a blocked write, and intentionally red release-gate tests prevent overlooking that.
- Expanded test coverage for concurrent claims, secret aliases and spoofed outcome metadata.

## Cross-project lessons included
1. Dammam employer-map audit: check published coordinates AND actual entrance/visitor access, plus closed/unreachable/appointment-only classification. Software equivalent: distinguish found URL, working portal, submitted confirmation and actual response.
2. Dammam outreach: check actual Gmail Sent and bounce/invalid-recipient evidence; never treat a generic inbox as an HR-specific verified channel or a sent email as delivered.
3. CV/ATS revisions: a PDF can look correct yet be parsed incorrectly; store canonical structured legal name, education and employment dates, and compare every official form answer to source facts.
4. Maraqi website: inspect the ACTUAL deployed site, mobile layouts, transition quality and navigation, not merely passing builds or static screenshots.
5. Open-source/contact-discovery studies: decompose and benchmark narrow reusable functions, respect licenses, verify whether a free tool secretly uses paid data, preserve original evidence and measure real yield rather than raw record counts.
6. Local electrical-engineering training: standards and work practices differ by jurisdiction. Global job eligibility is not reducible to a free-text AI guess.
7. Cost preference: scheduled deterministic source refresh and dedupe first; lighter reasoning for routine tasks, higher reasoning only for conflicts, manual resume for CAPTCHA/sign-in. Reuse exact successful workflow adapters instead of re-learning each portal.

## Sources and evidence quality
- Official MCP security: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization and https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx
- Microsoft MCP security guidance: https://github.com/microsoft/mcp-for-beginners/blob/main/02-Security/mcp-security-best-practices.md
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Community (anecdotal, not benchmarks): https://www.reddit.com/r/AI_Agents/comments/1vfl3ve/has_anyone_found_a_reliable_autonomous_tool_that/ and https://www.reddit.com/r/buildinpublic/comments/1rmnxhm/built_a_chrome_extension_to_fight_workday_after/

## Independent exit criteria
1. Owner identity check active on all four private routes; zero accidental legacy leakage when a second signed-in identity connects.
2. Background Gmail verification cannot be set by an unverified actor; Sent receipts derive from provider proof, not arbitrary IDs.
3. Drizzle migration snapshot consistency, verified backup/restore, private staging smoke and real signed-in MCP interactions.
4. Candidate verified data and one real external portal application completed with actual receipt OR explicitly blocked with reason.
5. Duplicate application/no blind retry, source-injection negative cases, real privacy/export/deletion policies, verified legal acceptance, and actual UI/browser QA.
