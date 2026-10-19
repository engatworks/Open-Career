# Open Career 0.6 — private staging and first application runbook

Status: NOT DEPLOYED. This is an execution checklist, not a claim that a deployment or application occurred.

## Protect the existing owner workspace

1. Confirm the current owner-private ChatGPT Sites project and its Site identity. Keep the current sharing/audience settings unchanged; never expose the private URL or account data in GitHub.
2. Inspect exact currently deployed version, D1 database, R2 CV object and existing migrations. The public GitHub mirror does NOT automatically deploy to Sites.
3. Export a private encrypted backup/snapshot of the current D1 tables and verify the existing R2 CV hash; store backups outside this public repository. Record a recovery point and current outreach count.
4. Create an isolated private staging Site with a separate D1 database and R2 bucket, or use the host's supported safe preview environment. Do NOT apply the new migration directly to the current production D1 for the first attempt.
5. Inspect GitHub PR #2 and its CI. Build from feature branch feat/mvp-plugin-authorization-foundation, not main. Use .openai/hosting.json unchanged; DB/R2 binding names are DB and BUCKET.

## Migrations and verification

1. Apply existing 0000, 0001 and 0002 migrations to an empty staging D1, then 0003_mvp_foundation.sql; verify migration history and all created tables.
2. If cloning existing data into staging, scrub identifiable information or keep it within an access-controlled private staging environment. Do not commit CVs, emails, tokens, credentials or D1 snapshots.
3. Verify legacy records, the outgoing-email quota and suppressed contacts remain intact. Verify every new MVP table is empty before first-run consent.
4. Verify unauthenticated GET /api/mvp/consent returns 401; GET /api/mvp/applications and all mutating routes also reject anonymous requests. Review legacy protected endpoints and the host's trusted authenticated-user headers. Do NOT make staging public to bypass authentication.
5. Check /consent renders the terms and all scopes; acceptance is only by the human, and records version, hash, account, timestamp and selected scopes. Check scopes can be revoked and changed; ungranted writes fail.
6. Verify MCP tools/list advertises new MVP tools, but unauthenticated calls to private tools fail. Confirm permissions are checked against the authenticated owner, not arbitrary tool parameters.
7. Confirm records cannot be read or mutated by a different test account, and that an unknown or ambiguous application result is not auto-resubmitted. No real employer messages during staging tests.

## First real portal application (explicitly authorized browser host only)

1. The user selects ChatGPT Work or another compatible browser host. The user signs in normally and grants available browser and Open Career scopes. This standard text chat does not have a cloud-browser control tool.
2. Read user-approved candidate profile and exact current CV, reconcile any differing name spelling, work authorization, language, dates and mandatory answers before filling any application.
3. Recheck one genuine junior/graduate vacancy on an official employer page, including dates, nationality, degree, experience and location requirements. Prefer one eligible role over a mass application.
4. Call mvp_prepare_application with the exact employer domain, ATS ID, listing URL and position. On duplicate, check history and do not submit again.
5. Complete one permitted application through a supported host browser, allowing manual user takeover for security/identity challenges. Do not bypass restrictions or claim a form click equals success.
6. Record attempted or submitted_unverified with the available evidence. The applicant confirms a real employer reference via the authenticated REST interface only after checking the external confirmation. Verify that repeating the run returns a duplicate instead of a second submission.
7. Save final state and next action, audit CV version and account email, and confirm the external employer acknowledgement if supplied.

## Release criteria

Required before deployment over the existing owner-private service: staging database is backed up/tested, migrations verified, sign-in and grant boundaries tested, old outreach works under user-accepted grants, no data corruption, no new public access, and rollback proven. Real application completion is a separate acceptance gate; green CI is not sufficient.

Not available in this regular chat: Sites deploy/migration control, authenticated Work cloud browser or employer-portal account takeover. Stop here and hand off those exact steps to the owner-access Work session; do not substitute an unrelated hosting provider.
