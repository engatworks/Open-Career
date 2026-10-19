# Open Career — MCP and skills MVP (owner-first)

19 October 2026. Development branch only, NOT deployed. The current main branch is the owner-private 0.5.0 outreach app.

## Implemented

- Portable Open Career skill defining source-backed research, recruiter outreach, applications, and receipt checking.
- D1 migration 0003 for owner-scoped terms acceptance, grants, applications, and portal account references.
- User-controlled permissions and revocation UI at /consent with authenticated API at /api/mvp/consent.
- Application listing and applicant-attested confirmation API at /api/mvp/applications; the separate application history page is not installed.
- MCP tools: mvp_consent_status, mvp_check_permission, mvp_list_applications, mvp_prepare_application, mvp_record_application_result, mvp_portal_accounts, mvp_register_portal_account.
- Existing legacy MCP and REST mutations require records:write grants. Reserving an outbound Gmail message requires email:send.
- Tests for grants, tenants, revocation, applications, duplicate prevention, state transitions, and rejection of plaintext passwords.
- GitHub Actions regression tests and a full TypeScript check.

## Operational limits

The new MCP backend can PREPARE and RECORD applications; it does not browse sites, register real portal accounts, create passwords, enter job forms, pass OTP challenges, click Submit, or verify external application receipts. A provider may require separate human approval. No real job application was submitted by this branch.

Authentication currently relies on the owner-private managed ChatGPT sign-in integration. The Claude identity adapter is NOT implemented or tested; portability of the SKILL.md does not imply the Claude MCP is ready. The existing private site is a hosting security boundary, not a tested multi-tenant security model.

D1 authorization checks control Open Career's database actions, not the independent Gmail or browser privileges granted by an AI host. A version/text change invalidates old consent. An agent report can only record attempted or submitted_unverified; only the applicant can attest a confirmation reference via the private REST API. This is not independent verification by the employer.

Portal account references contain website hostname and login email only. No password or OTP is accepted or stored. Future credential storage requires an encrypted vault with security review.

The current draft Terms and Privacy Notice are not final public release terms; identity of the operator, jurisdiction, data retention, export/delete processes, and independent legal review are still required.

## Roadmap and release gates

1. Validate and apply D1 migration through the actual host. Inspect OAuth headers, tenant isolation, Drizzle migration metadata, and identity scope. Do not merge/deploy without these checks.
2. Build an applicant history screen, verified answer store, and browser/ATS application handoff with evidence.
3. Complete one real eligible portal application through a supported host, capture the employer confirmation, and re-run to prove no duplication.
4. Test scheduled Work runs and realistic consumption quotas, including human pause and resume.
5. Test Claude authorization and separate auth adapter before calling this a cross-host plugin.
6. Add account data export/deletion, audited encrypted credential vault, legal review and privacy controls before wider user enrollment.

Green unit tests and type checking are software evidence, not proof of successful browser operations or employer responses.
