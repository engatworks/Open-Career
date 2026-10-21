# Employer watchlists: source-backed new-job detection

A logged-in Open Career user can now save **up to 25 specific, user-verified employer ATS boards** (Greenhouse, Lever and Ashby), scan an individual board, and review newly detected public postings in their own workspace.

The user's first successful scan creates an initial baseline and does not claim that every existing listing is new. Later scans mark only previously unseen posting IDs as `new`. Existing jobs retain their `seen` or `known` state; user acknowledgements are separate from applications and are tenant-scoped. The list preserves official source URLs, observation timestamps, recent errors and the last successful scan timestamp.

## Components

- `lib/board-watch.mjs`: `BoardWatch` class; ATS API allowlist, board registration cap, tenant predicates, atomic 10-minute scan lease, repeat-safe sightings and failure records.
- `drizzle/0007_job_watchlists.sql`: `tenant_boards` and `tenant_job_sightings` with per-tenant uniqueness and cascading delete; registered in Drizzle journal and snapshot.
- `/api/v2/boards` (GET/POST/DELETE), `/api/v2/boards/scan` (POST), `/api/v2/boards/seen` (POST), `/api/v2/listings` (GET).
- MCP v2: `my_employer_boards`, `my_observed_jobs`, `save_employer_board`, `scan_employer_board`, `acknowledge_job`.
- `/join` Jobs panel: add the current provider+board as a watch, scan saved boards, see new vacancies, mark them seen.
- Exports include saved board registrations and up to 300 observed job listings (no private secrets).

## Safety and reliability

All calls operate on the identity verified by the v2 OIDC/session boundary and require an active workspace. Scans are bound to permitted public ATS hosts; they do not scrape arbitrary employer websites or touch applications.

The `ats_jobs` tenant quota limits official API calls; the per-board 10-minute lease stops double scans and ambiguous concurrent updates. A provider failure records the error without overwriting previous sightings or last success. SQL inserts are idempotent. No job automatically becomes a confirmed suitable opportunity, and a newly detected job is not a guarantee it remains available.

**Not yet running in the background:** Scans currently require a user/MCP invocation. Future provider-approved scheduling should use trusted Cloudflare Cron/Queues, bounded batches, automatic retries only for idempotent reads, and per-user notification consent. Do not claim the monitoring engine sends email alerts today.

## Commercial readiness

This is an improvement over one-off searches of a board slug, but **not global job aggregation**. Companies may not use these three ATS providers; even on supported platforms the user must verify which board belongs to the employer. Add authoritative board discovery, a licensed jobs data strategy, eligible-country filters, compensation normalization and independent posting freshness checks before marketing worldwide comprehensive job coverage.

Staging deployment must first complete the separate `docs/COMMERCIAL_BETA_GATES.md` owner-data isolation and signup procedures. Keep user environments separate, apply the 0007 migration in a backup-tested manner, and validate D1 conflict behavior against real Cloudflare before commercial launch.
