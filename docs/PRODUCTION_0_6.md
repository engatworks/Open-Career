# Open Career 0.6.0 production boundaries

The existing owner-private Site is the production application. Its Cloudflare Worker, D1 records and R2 CV storage remain the same resources. The public GitHub repository is a sanitized source mirror; pushing it alone does not publish the private Site. The Open Career MCP plugin calls this same backend. Native Gmail provides delivery in the authorized ChatGPT task context. The existing 09:30 Asia/Riyadh task supplies the scheduled invocation.

This release does not create independent Gmail authorization or a hosting cron. Sites service access is not visitor connected-app consent. `/api/pipeline` reports `backend_independent_gmail:false` and an explicit execution alert. A saved schedule and old background connection verification do not prove future execution. No token is exported or stored, and no browser is used to evade a rejected provider operation.

## Durable work

The private `employer_pipeline` records DISCOVER, RESEARCH, VERIFY, QUEUE, SEND, RECONCILE, COMPLETE and HELD stages, next action, source evidence, verification time, attempts and employer leases. RESERVE is the atomic outreach transition into sending with an immutable reservation token; the token is returned immediately before one native Gmail call. Existing outreach is authoritative for all earlier records, including those queued before this migration.

`/api/pipeline/checkpoint`, `/claim`, `/failure` and `/recover` allow bounded independent research workers to resume. At most five employers can be leased per request; the configured concurrency cap (default three) also limits total active research leases across concurrent claim calls, with a 15 minute default lease. Transient reads and rate limits back off exponentially and stop after three attempts by default; evidence, eligibility and authorization failures remain held. A research crash consumes a bounded attempt. Source inspection settles independent results, runs at most three reads concurrently and permits only one read per origin at a time. Robots, redirect, size and timeout protections remain in place.

Stale sending reservations are quarantined after 15 minutes by recovery/start-run. They are never requeued. A provider timeout must be reconciled against Gmail before recording an existing receipt. Provider message IDs and outreach-to-receipt assignments are unique. SQLite guards cover legacy outreach receipts as well as new receipt rows. Alias registration, outreach creation and the verified inventory checkpoint commit in one transaction; conflicting alias queues roll back without leaving sendable orphan rows. A repeated identical receipt is idempotent. A receipt records the supplied actual provider time, or the existing reservation time for the original API contract, preventing late reconciliation from shifting a send into a later campaign day.

## Employer history and evidence

`/api/history/reconcile` imports up to 100 independently read actual Gmail receipts missing from the ledger. This history suppresses the employer before queueing and again during reservation, including documented corporate aliases. It does not create invented old outreach packets or add to new delivery counts.

An explicitly published official recruitment invitation is an eligible contact tier without a named-person search. One original official source may suffice if it establishes the engineering work and the hiring channel. Named-person inquiries retain identity/current-role checks and two original sources. A secondary fact is optional. The writer may use a reviewed truthful paraphrase while the exact supporting quotation is independently refetched. Exact addresses, contact-source binding and candidate claims remain required.

A corporate alias is accepted only when the exact address is published on the canonical official employer website; public free-mail aliases are not accepted through this exception. The alias is retained as original-source evidence and used in deduplication. Public Cloudflare email obfuscation is decoded from the original HTML using the same public XOR data the browser displays, preserving the downloaded source hash and publication type. JavaScript shells, blocked pages and unsupported browser-only evidence remain explicit holds; arbitrary supplied text cannot bypass source verification.

## Reporting

`successful_delivery_by_campaign` excludes known bounce feedback and requires a stored provider message ID. Send-quota usage separately preserves accepted and uncertain sends, including later bounces, to avoid creating extra send allowance from failures. Inventory reports qualified queued, unsent records within the current evidence/CV validity window. Default replenishment threshold is 50 per country and is configurable through `/api/pipeline/settings`. Empty/low queues and uncertain sends produce structured alerts; these are API/activity diagnostics, not a separately configured push-alert service.

The application remains owner-private. Sites enforces the owner/service boundary; no external-user ownership model is advertised. MCP requests reject cross-origin writes and non-JSON bodies and enforce the input limit while streaming, even without Content-Length. No public account or shared Gmail authorization is introduced. Multi-user registration requires an explicit ownership/authentication migration before exposure.

## Verification

Run `node --test tests/cloud.test.mjs`, TypeScript and the Sites build before publication. The production-path controlled test handles 50 candidate records across the two country quotas, injects five worker interruptions between mock provider acceptance and receipt recording, quarantines those reservations, reconciles existing provider IDs, and checks 50 unique receipts without a second send. Mock acceptance is test evidence, never proof of real employer delivery.
