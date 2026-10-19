# Open Career — MCP + skills owner-first MVP architecture

**19 Oct 2026. Design/implementation foundation, NOT yet deployed.** The current 0.5.0 app contains a private single-owner outreach tracker with research, contact evidence, Gmail reservations, source checks, quotas and receipts. This branch adds a portable agent skill, scoped consent decision helper and test coverage. It does not yet create portal accounts, submit job forms, or enforce consent in production.

## Operating model
The user supplies a compatible paid ChatGPT or Claude experience and authorized Gmail/browser capabilities. Open Career is the durable control plane for candidate facts, source evidence, permissions, queues, application state and verified outcomes. There is no mandatory model API. ChatGPT Work tasks can be scheduled within ChatGPT subject to access/usage; there is no documented generic API for a Cloudflare cron to launch those sessions. A remote MCP on Claude does not automatically supply a computer/browser.

## MVP tools to add
1. Consent: get_consent_status, accept_terms (via an authenticated human interaction, not an agent clicking for the user), revoke_scopes.
2. Candidate data: get_candidate_answers, update_candidate_answers (field-level verification).
3. Vacancies: discover_opportunities, qualify_opportunity (official source URL, dated ATS ID, eligibility).
4. Execution: reserve_application (per-account/company/job idempotency), record_portal_account (store vault reference NOT secret), record_application_result, mark_requires_user.
5. Reconciliation: list_action_queue, get_application_history, reconcile_email_and_application_receipts.

Write privileges are checked server-side on every action against the authenticated account, current versioned grant, exact scope, provider authorization, target and quota. An agent's instructions, a tool description or a catch-all user prompt cannot substitute for these checks. Provider restrictions or unknown permissions STOP an action. Never silently retry an ambiguous outbound submission.

## Persistent tables needed
- accepted_terms: account_id, terms_version, accepted_at, locale, immutable text hash, affirmative UI evidence.
- action_grants: account_id, scope, issued_at, revoked_at, source, bounded limits.
- candidate_profiles: verified education, work rights, employment, CV fingerprint, answer templates; scoped to owner.
- employers, contacts, vacancies, opportunities: canonical domain/IDs, sources, observed date, requirements and verification.
- portal_accounts: owner, site URL, login email, *encrypted per-user vault reference*, verification state; no plaintext credentials.
- applications: candidate+employer+ATS ID unique key; form attempt/receipt, status, timestamp, CV fingerprint, next action.
- audit_events, suppression, pending_tasks: actor, exact action, provider outcome, hold reason, deduplication and follow-up.

A per-user encrypted vault or password manager is required if storing passwords; these portals contain real CVs, identity details and private applicant data. Prefer unique passwords despite convenience. Implement revocation, export, deletion and tenant-isolation before public signups.

## State machine
Discovered -> eligible -> prepared -> reserved -> attempted -> submitted_unverified -> confirmed. Alternate terminal/paused paths: failed, requires_user, withdrawn, suppressed. Confirmed requires a portal confirmation/reference or corroborating message. A click is only attempted; Gmail acceptance is only a send receipt. An unknown result is quarantined and never blindly resent.

## Roadmap
0.6: clickwrap, consent/grant DB & runtime enforcement, portable MCP skill, normalized applicant and application schema, deterministic tests.
0.7: ONE supported real ATS/portal supervised application, precise eligibility and receipt verification, private history, existing outbound email integration.
0.8: bounded scheduled runs, reply triage, safe user account vault and opt-in follow-ups.
1.0: owner-first real use, documented host compatibility, security review, legal review, beta plugin installation. Only then consider public multi-user service.

## Pilot acceptance test
A real applicant, one suitable vacancy, verified profile answers, user-authorized browser action, recorded application confirmation or explicit blocked state, no duplicate on second run, and correct export in Open Career. End-to-end real-world test is required; unit tests alone don't prove submissions or background delivery.
