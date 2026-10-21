# Open Career Commercial Beta — security and go/no-go gates

**Release classification:** Source changes only. This repository is not presently certified, audited, deployed or commercially ready. Do not invite outside users or process paid subscriptions on the basis of a passing test suite.

## Immediate P0 addressed in this change

Previously, the original /api/* and /mcp endpoints could access the owner's saved CV (including PDF base64), contacts, research evidence and outreach configuration. The new /join UI was still looking up ATS jobs through that legacy API. Reusing that deployment publicly without hard boundaries would risk exposing a single user's private records.

This change defaults to a locked access mode and adds an explicit host operating mode:

| `OPENCAREER_ACCESS_MODE` | Homepage | Legacy `/api/*`, `/mcp` | v2 API / MCP / onboarding |
| --- | --- | --- | --- |
| Missing or invalid | Offline notice | **404** | **503** |
| `owner_private` | Existing private tracker | Allowed only behind separately verified owner-private hosting | **503** |
| `multiuser_beta` | Redirect to `/join` | **404** | Signed identities, invitation allowlist, tenant quotas |
| `multiuser_public` | Redirect to `/join` | **404** | Signed identities, verified email, tenant quotas |

**Never** configure `owner_private` on a publicly shared domain: it relies on the separate Sites/platform gateway to enforce ownership. As a defense in depth, never share owner-private D1/R2 bindings with any public tenant staging environment. A missing mode now disables the old tracker; explicitly set `owner_private` before deploying the private owner service to avoid an unintended interruption.

## Beta enrollment and controls

- `OPENCAREER_BETA_EMAIL_ALLOWLIST` is a server-side comma-separated list of up to 200 verified email addresses. In beta mode, new users must present a signed identity whose `email_verified` claim is true and whose normalized email appears in this list.
- Existing active accounts can log in if invitations are closed; suspended or deleting accounts cannot re-enroll. All entrypoints that provision accounts (OIDC callback, REST, v2 MCP) enforce the same policy.
- `multiuser_public` is a **future mode**, not permission to launch today. It requires separate completion of all gates below.
- New OIDC login transactions are limited to 12 per ten minutes per trusted Cloudflare edge address, using an HMAC-only database key; do not trust client X-Forwarded-For.
- Authenticated ATS discovery is limited to 30 requests / 10 minutes / user. Workspace write operations are limited to 80 / hour / user; onboard attempts to 6 / hour / user. Limits use atomic SQLite/D1 UPSERTs and reject requests with HTTP 429 rather than retrying submissions.
- Public job discovery has moved to `GET /api/v2/ats/jobs`; the old `/api/ats/jobs` remains available only in owner-private mode. No ATS submission capability has been enabled.
- No API/database credentials, candidate CVs, auth secrets, or ATS accounts are included in this repository.

## Prelaunch staging checklist (must be proved, not checked off from code alone)

1. **Host isolation:** Provision two separate Cloudflare Sites projects and separate D1/R2 bindings: owner-private legacy, public staging with `multiuser_beta`. Confirm old `/api/cv-payload`, `/api/contacts`, `/mcp` and `/api/export` return **404** from staging even with a valid v2 user cookie and bearer token. Confirm the public homepage never renders the legacy dashboard.
2. **Identity:** Configure production-grade OIDC client (Auth Code + PKCE, signed ID tokens, JWKS), domain, email verification, MFA, callback issuer checks, key rotation, session revocation and legitimate logout. Try invited and uninvited users, forged JWTs, stale state and CSRF, stolen/mismatched cookies.
3. **Real storage:** Apply migration `0006_release_limits.sql` after earlier Drizzle migrations; test concurrent quota races and account deletion under actual D1 and R2 failure modes. Back up keys securely and verify restoration/recovery.
4. **Abuse controls:** Add WAF/CAPTCHA on account-level abuse (not ATS-site CAPTCHA bypass), provider-IP throttling at Cloudflare edge, outbound cost ceilings, encrypted log redaction, alerting, incident runbooks and data-retention sweeps.
5. **Provider policy:** Evaluate Greenhouse, Lever, Ashby and other ATS terms, permitted browser interaction, and regional privacy laws before enabling portal account creation or automated submissions. No credential harvesting, fraudulent applications or bypassing website controls.
6. **Deliverability:** Connect each user's own authorized email provider; use actual message IDs, bounced message suppression, rate limits, opt-out handling and ambiguous-send quarantines. Never label a draft or attempted API call as delivered. The owner's historical Gmail sends must be reconciled separately.
7. **Product readiness:** Passwordless/recovery and settings UX, accessible mobile onboarding, localization/RTL tests, account/data deletion UX, support ticketing, privacy policy/terms, billing/subscriptions and cancellation, uptime/latency benchmarks, incident communication and ongoing security audit.
8. **External checks:** Independent penetration test, accessibility audit (WCAG 2.2 AA target), legal/privacy review (relevant jurisdictions), user acceptance testing with unrelated test identities and separate browser profiles. Run deployment rollback drill before taking money.
9. **Commercial differentiation benchmark:** Compare realistic end-to-end job-search tasks against incumbent products. Record supported websites and successful user-reviewed submissions, false eligibility claims, duplicate rate, median task time, cost per successful outcome, and real user satisfaction. No market-leading claims until data supports them.

## How to validate in repository

```bash
node --test tests/release-security.test.mjs tests/browser-auth.test.mjs tests/tenants.test.mjs
node --test tests/ats.test.mjs tests/cloud.test.mjs
node node_modules/drizzle-kit/bin.cjs check
node node_modules/typescript/bin/tsc --noEmit
```

### Competitor baseline (functionality, not performance conclusions)

- Simplify: established browser-extension autofill, CV tailoring, answers and application tracking. https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications
- Huntr: browser-extension job saving, one-click autofill, application tracker. https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension
- Teal: resume generation and application tracking. https://www.tealhq.com/how-it-works
- Jobright: job matching, autofill, resume tailoring and referral-related services. https://jobright.ai

Open Career's **intended** differentiation is a portable and auditable MCP-based career workflow, verified source provenance, candidate-specific eligibility and explicit confirmation receipts, privacy-owned workspaces, and consent-bounded cross-ATS support. These are product goals and require actual implementation and comparative testing, not invented market rankings.
