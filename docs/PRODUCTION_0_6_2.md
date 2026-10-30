# Open Career 0.6.2: D1 reservation and recovery repair

A successful reservation updated both outreach and its pipeline row through the `pipeline_outreach_state` trigger. D1 reports `meta.changes` using `total_changes()`, including trigger writes. The `changes === 1` check therefore threw after reservation and before the Gmail payload or `sending` event was returned. The Node SQLite test adapter reported only direct statement changes and concealed this production failure.

Reservation, cancellation and reply transitions now use guarded `UPDATE ... RETURNING id` and test the returned row. Worker recovery counts returned outreach rows instead of trigger writes. Quota and duplicate predicates remain inside the atomic update. The adapter now models D1's total change count, and regressions exercise the trigger, concurrent country caps and quarantine boundaries.

The owner recovery operation `/api/reservation/release-unissued` requires a fresh Gmail Sent search covering the recipient, canonical employer and email-domain aliases, an explicit stored preparation-failure record saying Gmail was never attempted, no payload-issuance event, and no provider receipt/history. It cancels the unusable reservation, retains its audit history and resets research to VERIFY. It cannot replay Gmail and requires a freshly reviewed packet. Issued payloads and ambiguous provider requests remain quarantined even if Sent search is empty.

Schedule status distinguishes enabled from paused metadata. The existing daily cloud task must be synchronized with the live research contract: one sufficient official page can establish an explicit CV invitation; named-person messages still require identity research and two distinct original pages. A sufficient recruitment invitation does not require an unsuccessful named-person search.

The Site remains owner-private, preserves the same database/CV storage and has no independent Gmail authorization or hosting cron. Its existing ChatGPT daily task supplies execution. A schedule registration is not evidence of future delivery or a guarantee of 50 qualified employers daily.
