# Cloud acceptance runbook

1. Confirm owner-private hosting, D1 schema, R2 storage and authenticated read/write access through the intended task path.
2. Upload the actual private candidate profile and CV. Retrieve the exact attachment bytes and compare SHA-256.
3. Verify the currently connected Gmail account using its profile read. No Google OAuth secrets are exported.
4. Test one controlled setup message to the authenticated account (`to: me`), with the exact CV. Read it back and verify recipient, MIME, attachment and returned provider identifiers. Keep setup tests separate from employer outreach statistics.
5. Run the same bounded setup check in an actual background cloud task. Record completion and attachment fingerprint in verification metadata. Interactive success alone is insufficient.
6. Register the daily research task only after current Gmail and tracker reads/writer authorization succeed. Use a durable prompt that retrieves context every time; do not refer to scratch files or embed access tokens.
7. Review the first real research run for sources, candidate fact preservation, contact identity, quality, recipient yield, deliverability and quota behavior. Report actual counts and holds.
8. If a native safety check rejects a send, do not retry with another sender or endpoint. Preserve the reservation and report the action and stated rejection. A saved schedule is not a delivery guarantee.

Current connected task tools need to remain installed/authorized. Store task IDs and schedule in private configuration; retrieve service credentials dynamically through native Sites access, never from a saved prompt or public code. Follow the Site's current audience and do not change sharing to make updates work.
