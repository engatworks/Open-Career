# Open Career — multi-user and ATS application roadmap (21 October 2026)

Status: product design and implementation backlog, **not deployed functionality**. The current private cloud edition 0.5.1 remains owner-private. Do not describe it as a publicly installable multi-tenant service.

## Product contract
Open Career is a user-controlled, open-source career agent accessible via MCP and a web UI. Research opportunities; evaluate eligibility; identify legitimate hiring contacts; prepare customized truthful CVs/answers; deliver consented email outreach; navigate supported ATS portals; reconcile outcomes; track replies, interviews and follow-ups. One user's nationalities, countries, quotas, credentials and outreach tone must never become defaults for everyone.

## Architectural boundaries
- Core: tenant-aware API, immutable candidate facts, job and company intelligence, eligibility and work-authorization engine, source/provenance records, application state machine, consent/policy engine, scheduler, notifications, event/receipt ledger.
- Connectors: Gmail and other authorized email providers; public ATS feeds where permitted; browser worker for interactive application forms; optional ChatGPT/Claude/other MCP clients.
- Web: onboarding, CV/profile vault, account connection, review queue, job search, applications, analytics, audit log and connector health.
- Storage: isolate each tenant with server-side tenant ownership checks and database policies; encrypt CVs, resumes, browser session material and provider credentials at rest; secrets never in prompts, GitHub or client logs; per-user deletion/export, retention and revocation.
- Auth: user accounts, consent scopes, secure OAuth where supported, separate credential vault for ATS portal accounts, MFA/OTP/CAPTCHA handled by the user, never bypassed.

## Application workflow
1. Discover a live job from an official employer/ATS page; preserve URL, ID, timestamp and eligibility requirements.
2. Evaluate skills, location, sponsorship, language, nationality restrictions and explicit candidate preferences. Unknowns are questions, not invented answers.
3. Deduplicate across job ID, company, ATS, email outreach and prior applications.
4. Choose a connector: supported ATS public API for discovery; browser automation for user-authorized form completion; official application link as fallback.
5. Create or sign in to a portal account only after user authorization; handle verification emails, MFA and CAPTCHA via a secure user handoff.
6. Extract and classify form fields; map verified candidate facts; generate grounded narrative answers and optional CV variants without inventing qualifications.
7. Fill form; validate actual DOM state and file uploads; pause on ambiguity or unsupported fields.
8. Show a reviewable submission packet and require user approval by default; permit bounded automatic submission only under explicit per-user/per-site authorization and platform rules.
9. Confirm success from the portal's acknowledgement, reference number, receipt email or application dashboard. Never mark submitted merely because a click occurred.
10. Reconcile asynchronous confirmations, email replies, rejection, interview and withdrawal. Ambiguous actions remain held and are not blindly retried.

## ATS adapters, in suggested implementation order
- Greenhouse, Lever, Ashby: build fixtures and explicit adapter contracts first.
- Workday: persistent account sessions, variable tenant flows, uploads and custom questions; expect manual verification and frequent maintenance.
- SmartRecruiters, iCIMS, SuccessFactors, Oracle Recruiting, Taleo and custom company portals: adapters after tested evidence, not blanket coverage claims.
- Browser layer: compare Playwright MCP (tool interface), Stagehand (structured observe/act/extract) and Browser Use (agent-driven browser). Prefer deterministic adapters with an AI fallback and a visible approval checkpoint. Never use stealth/CAPTCHA bypass to evade a platform restriction.

## Automation catalogue
- Scheduled fresh-job discovery with eligibility and source recency.
- Duplicate-aware application preparation and review queue.
- Permissioned ATS application completion and submission.
- Recruiter/contact research and verified email outreach.
- Gmail/portal receipt reconciliation and bounced-email suppression.
- Job-status, deadline and interview alerts.
- Reply classification and human-reviewed response drafts.
- Tailored CV/cover-letter versioning with immutable source facts.
- Credential expiry, connector outage and platform change alerts.
- Weekly outcomes and quality reports with actual provider receipts.

## Reliability and multi-user acceptance gates
- Tenant A cannot read or modify tenant B data, files, tokens, jobs, queues, browser sessions or logs.
- Idempotency keys for every application, contact, provider action and callback; uncertain submission never retried automatically.
- Queue leasing, dead-letter states, rate limits per tenant/provider, backoff only for retry-safe reads, audit trail, metrics and incident reporting.
- Permission failures classified by source: OAuth, app action policy, provider quota, CAPTCHA/MFA, unsupported ATS, transport error, uncertain outcome.
- Contract tests and replayable synthetic ATS fixtures, browser visual tests, real user-consented sandbox acceptance tests, and scheduled-vs-interactive parity checks.
- The current documented 25/day reservation and older 15/day cap discrepancy must be reconciled against live deployment before enabling any new campaigns.
- Reconcile Gmail sends that occurred outside the tracker (including the 21 October 2026 interactive sends) before enabling duplicate-sensitive campaigns.
- Do not claim multi-user, autonomous ATS submission or public MCP installability until end-to-end acceptance tests pass.

## Existing public reference implementations to evaluate, not copy blindly
- https://github.com/muhammad-saadd/applyai — browser extension, user submits.
- https://github.com/neonwatty/job-apply-plugin — Claude/Codex workflows, many ATS flows unverified.
- https://github.com/dabloo26/job-application-agent — safety-gated Playwright ATS forms.
- https://github.com/browser-use/browser-use — browser agent.
- https://stagehand.dev/ — structured browser action/extraction.

## Phased implementation
P0: Verify deployed cloud version, database schema, Gmail status and real delivery ledger; stop misleading completion claims.
P1: Multi-tenant identity, data isolation, per-user policies, consent and secure storage.
P2: Universal candidate schema, opportunity discovery, source/eligibility engine, job dedupe.
P3: Greenhouse/Lever/Ashby browser form preparation with human review; validate fixtures and real permitted flows.
P4: Account/session handoff, Workday adapter, durable browser execution, receipts and application status.
P5: Public MCP packaging, onboarding, documentation, security review, integration tests and staged beta.
P6: Additional ATS adapters and opt-in bounded automation based on demonstrated success.

A plugin is an interface to these capabilities, not a substitute for the browser worker, secure identity service or persistence.
