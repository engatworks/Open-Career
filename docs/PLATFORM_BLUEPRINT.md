# Open Career — Global Platform Blueprint
Working design, 18 October 2026. This describes milestones, not a completed public SaaS.

## What already exists
The main branch is a single-owner authenticated cloud tracker. Its D1 schema has no tenant identifiers, and the HTTP API depends on owner-private hosting for access control. Never turn the hosting public: that would endanger existing CV and outreach data.

The Opportunity Fit Lab on the global-opportunity-lab feature branch is a client-side-only experimental product surface. It does not connect to the private tracker, save pasted descriptions, fetch live vacancy information, verify sponsorship, contact employers or submit applications.

## Product thesis
Find relevant opportunities anywhere, distinguish actual job requirements from guesses, determine what is unknown, find legitimate contacts and manage human-approved applications or outreach in one auditable workspace.

This is not the first job-search AI platform. Simplify, Huntr, Teal, OSApplyTrack, JobSync and OrbitApply overlap. Our proposed differentiation must be earned through evidence quality, cross-border constraints, transparent uncertainty, and respectful networking—not mass applying.

## Differentiating systems to validate
1. An evidence-based fit review with text excerpts, unknown-state handling, and explicit hard constraints; no magical percentage score.
2. Sponsorship evidence ledger: keep a government sponsor registry listing, company-level policy, and role-level eligibility as SEPARATE facts with dates and source URLs. Registry presence never proves willingness to sponsor a given role.
3. Employer, hiring manager and referral research using verified public sources. Never guess email patterns or fabricate contacts.
4. Candidate claims stored with approval and provenance; generated applications never upgrade supervised experience into independent ownership.
5. An auditable workflow: discovered, source verified, fit checked, reviewed, approved, applied or sent, provider receipt, actual reply, interview, offer. Distinguish a send receipt from inbox placement.
6. Standard export and deletion, multilingual and accessible UX, international opportunities beyond software engineering.

## Release gates

### Gate 0: Usable safe preview (feature branch)
- Responsive standalone page at /lab, no login and no private API dependency.
- Pasted description analysis in browser, no persistence, no external AI service, no automated sends.
- Conservative text-only logic with exact excerpts and no legal/visa promises.
- Test suite for negation, missing facts, contradictions, bounds and job-specific constraints.
- Manual UI/accessibility/security review and 10 international job-seeker discovery interviews before opening a public preview.

### Gate 1: Tenant-safe platform (NOT IMPLEMENTED)
- Create a NEW public deployment and database, isolated from the existing owner-private D1/R2 environment.
- Authentication on every private request, HttpOnly Secure SameSite sessions, CSRF protection, tenant membership authorization, scoped object storage and controlled file downloads.
- User, workspace, membership, profile, document, source, opportunity, contact, application, outreach, audit, suppression and quota tables with verified workspace ownership filters on EVERY query.
- Authorization and data-isolation tests across list, create, update, search, export and file downloads; deny by default.
- Encryption and backup/restore procedures, rate limiting, abuse controls, privacy policy, consent, per-user data export and complete account deletion.

### Gate 2: Credible job discovery (NOT IMPLEMENTED)
- Use allowed official employer/ATS feeds and permitted accessible pages; record URL, source, fetch time, canonical role and whether the vacancy is still open. Honor robots rules and service terms.
- Do not claim sources have been checked when only a search summary was seen; refresh and expire stale results; de-duplicate sources.
- Official sponsorship-register integration by jurisdiction only when lawful and maintainable; clearly separate registry membership, employer willingness and candidate eligibility.
- Keep manual entry/import as a first-class path.

### Gate 3: Career operating system (NOT IMPLEMENTED)
- Verified candidate facts, job tracking, truthful resume tailoring and human-reviewed messages.
- Optional OAuth mail/calendar per user, isolated credentials, explicit approval for actions; anti-spam rate limits, opt-outs, suppression and no automatic retries of ambiguous sends.
- Interview prep, follow-up planning, contact history and candidate-centric export.

### Gate 4: Public beta (NOT IMPLEMENTED)
- Run 20–50 opt-in pilots across markets and roles. Measure relevant opportunities, false eligibility blockers, response and interview rates—not volume of automated emails.
- Independent security review, mobile accessibility/browser QA and demonstrated data deletion before enabling broad signups.

## Explicit non-goals
No fabricated vacancies, guessed work emails, impersonation, credential inflation, anti-bot bypass, guaranteed visas, or autonomous bulk outreach for unreviewed contacts.

## First prototype verification
Run: node --test tests/opportunity-fit.test.mjs
The dedicated pull-request CI workflow checks the heuristic engine. Passing unit tests is NOT proof of production security or browser compatibility.
