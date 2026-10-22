# Open Career owner-private daily delivery recovery and release gate

## Operational state (22 October 2026)

The publicly visible `engatworks/Open-Career` source now contains separate **atomic** 25-per-country Asia/Riyadh calendar-day reservation limits for `ireland-engineering` and `ksa-engineering` (maximum 50 combined). The legacy records without a campaign tag count toward Saudi Arabia; packets with unsupported campaign tags fail validation. The source reports `version: 0.5.2` with `quota_by_campaign`.

**Do not infer this release is deployed.** The private OpenAI Sites/Vinext/D1/R2 service has a different deployment history and ownership controls. At the October 22 morning audit, the private deployment reportedly exposed v0.5.0, a rolling 15-send cap and `daily_target=10`. That observation must be rechecked directly after publishing; it is not proof of the current production state. GitHub CI builds/tests and a ChatGPT scheduled task do not publish the owner-private service or authorize Gmail.

## Required owner-only production release sequence

1. Access the existing **owner-private** Site through its authenticated native deployment controls. Never publish the private site, bypass authentication, print provider tokens, or copy the private D1/R2 data into the public repository. Keep `OPENCAREER_ACCESS_MODE=owner_private`; do not enable multiuser modes on this data.
2. Sync the reviewed current source into the **same existing Site project** using the supported Sites workflow, not a new public deployment. Preserve existing D1/R2 bindings and private settings. Apply only outstanding forward SQL migrations with a verified backup; do not rerun completed migrations or destroy CV/ledger state.
3. Build and publish. Record actual provider deployment identifier, timestamp and source commit. Access authenticated live `GET /api/status`: require **version 0.5.2**, `daily_cap=50`, `daily_cap_per_campaign=25`, and `quota_by_campaign['ireland-engineering'].target=25`, `quota_by_campaign['ksa-engineering'].target=25`. Reject the deployment if still on rolling cap 15, shared cap 25, or `daily_target=10` (update settings only if owner-authorized). No published URL or source SHA alone proves this.
4. Retrieve owner `/api/agent-context` and CV payload via authenticated interfaces only; validate stored PDF bytes against its exact SHA-256 and Gmail background-send/attachment verification. The owner must explicitly enable `live_send_enabled` only after verification. Never send without current immutable profile/CV consistency.
5. Reconcile every employer already contacted in Gmail (not just Open Career's internal ledger), historical tracker, bounces/declines, opt-outs, alias domains and all `sending`/`needs_reconciliation` reservations. Suppress previously contacted employers and uncertain outcomes; never blindly retry them.
6. Select up to 25 genuinely new suitable Ireland employers and 25 new Saudi employers. Each research packet includes one appropriate campaign tag, verifiable original sources, an exact published professional email or employer careers invitation, checked role/eligibility and a uniquely researched brief paid-employment inquiry. For the owner campaign, use the requested literal subject `I have nothing to offer, but I want in` for all initial messages. Irish messages must disclose permit needs. No trainee/unpaid roles.
7. Queue and reserve via **Open Career**, only when both independent quotas and prerequisites are proved live. Pass the exact returned CV.pdf multipart message to connected Gmail, then read actual Sent message metadata (time, recipient, subject, MIME/PDF) and persist the real message ID through `/api/delivery-receipt` (or corresponding authenticated current route/tool). If the Gmail outcome is ambiguous or provider/safety blocked, quarantine the reservation and **stop**, no alternate sender, route, or retry.
8. Audit by **local Riyadh day** using Gmail Sent as the authoritative send record, not task narrative, drafts or ledger intent. Report Ireland actual/25, Saudi actual/25, combined actual/50, cumulative unique Irish employers, attachments, bounces, held/rejected dossiers and any unverified root cause. Keep the daily schedule enabled after a shortfall and surface an alert.

## Safety / release acceptance

- The daily sending schedule and the independent audit schedule are not proof of send success. Do not silently mark researched prospects as delivered.
- A test that verifies 25+25 concurrent quota reservations on an in-memory D1 emulator is useful regression evidence, **not** live D1/Gmail authorization evidence.
- Never upload a CV, tokens, outreach ledgers or private contacts into this public repository.
- If Site tool access is absent, stop with a conspicuous **DEPLOYMENT ACCESS BLOCKED** status and record the remaining steps; do not attempt generic Gmail sending that skips immutable Open Career reservations.
