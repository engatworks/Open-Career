# Open Career: Candidate Data Lifecycle and Key Rotation

**Status:** Source implementation, not a hosted deployment or completed compliance assessment. Apply on isolated staging before touching any customer objects.

## Encrypted CV key rotation

- The previous **OCV1** format remains readable with `OPENCAREER_CV_ENCRYPTION_KEY`. Existing ciphertext is not rewritten or deleted just because a new key is configured.
- The new **OCV2** format uses an AES-256-GCM random 96-bit nonce, a versioned key identifier, and authenticated additional data containing the envelope header plus the server-verified tenant ID. Copying ciphertext to a different tenant ID cannot decrypt successfully.
- Configure `OPENCAREER_CV_KEYRING` as a **secret** stored only in your hosting secrets manager. Its JSON shape is `{"active":"2026q4","keys":{"2026q4":"<independent-32-byte-base64url-secret>"}}`. Generate independent key bytes with a CSPRNG, not passwords or reused session/OIDC secrets. Never put actual values in GitHub or issue comments.
- Preserve the **old** `OPENCAREER_CV_ENCRYPTION_KEY` secret during migration: OCV1 objects need it until verified to be migrated, and old backups may still need it.
- To rotate the OCV2 active key, add an independent new key to `keys`, change `active` to the new key ID, and retain all old keys for decryption. User-initiated `POST /api/v2/cv/rekey` re-encrypts the tenant's stored CV using compare-and-swap against its previous document key. A second invocation is idempotent when the CV is already on the active key.
- `GET /api/v2/cv/key-status` confirms whether a versioned keyring is configured and identifies the active version (never returns secret material). The browser privacy tab offers re-encryption only when configured.
- **Do not remove old keys** until: the active database and all required backups have been inventoried, migration is complete, failure-injection has succeeded on real R2 and D1, and the approved retention window for old backups has passed. **No bulk production rekey has been run.** Data loss from key deletion may be irreversible.
- An explicitly present but malformed or blank keyring causes CV operations to fail closed. Production launch policy must demand a configured OCV2 keyring; the OCV1-write fallback exists only for compatibility with private environments not yet migrated.

## Candidate data export

- `GET /api/v2/export/manifest`: returns tenant-only account/profile, CV metadata, and exact *current* counts for contact, application, employer board, job observation, and audit event records.
- `GET /api/v2/export/page?collection=events&cursor=123&limit=100`: keyset-pagination through one explicitly allowlisted table; never permits arbitrary SQL or a caller-supplied tenant ID. Other permitted collections: `contacts`, `applications`, `employer_boards`, `observed_jobs`. Each page is capped at 200 rows.
- The browser downloads pages for each collection and verifies the count before producing a JSON file. It refuses to present an incomplete download as complete. Browser memory safeguards apply above 10,000 records **per collection**; API-based retrieval can handle larger workspaces.
- **Snapshot caveat:** D1 pages are successive committed reads, not one cross-table transaction. Concurrent updates can change the export even when row counts match. Use a quiescent user workspace or dedicated snapshot/backup strategy if a legally certified point-in-time export is required.
- CV PDF contents must be downloaded separately from the authenticated `/api/v2/cv` endpoint. Login sessions, encryption keys, and provider secrets are excluded by design.
- Old one-shot `/api/v2/export` is retained for compatibility, but explicitly labeled **partial** and may truncate data. Do not represent that endpoint as a full account export.

## Browser session controls

- `GET /auth/sessions` lists non-sensitive creation and expiration timestamps, indicates the current session, and returns no session token or hash.
- CSRF-protected `POST /auth/sessions/revoke-others` revokes other browser sessions while keeping the current login.
- CSRF-protected `POST /auth/logout-all` revokes all browser sessions and clears the browser's cookie.
- Provider-side SSO login sessions, account-linked access tokens and externally issued bearer JWTs remain subject to the identity provider's separate lifecycle. Revoking a browser session here does **not** revoke an external IdP session or bearer token. Require provider-side revocation and enterprise account management before marketing universal sign-out.

## Orphaned CV objects and retention

- `drizzle/0008_lifecycle_maintenance.sql` records fair per-user orphan sweep progress and an R2 listing cursor.
- The garbage collector inspects an active tenant's R2 `tenants/{tenant_id}/cv/` prefix in bounded pages. It will delete an object **only when** R2 supplies a trustworthy upload timestamp older than 72 hours and the current tenant document record does not reference that key. Unknown timestamps fail safely (skip).
- `OPENCAREER_ORPHAN_GC_ENABLED=true` enables this optional cleanup through the **trusted internal scheduler**. The scheduler still needs to be deployed and given its own protected secret; the repository has **not** activated cron jobs on a real Cloudflare service.
- Expired login transactions, expired browser sessions, and old rate-limit counters are deleted by the same trusted scheduler. No CV or account data is ever emailed as part of cleanup.
- Account deletion remains a separate fail-closed state machine with private retryable tenant namespace purge. A user who enters `deleting` cannot reauthenticate. Operators must monitor failures and enable the trusted scheduler for completion; code alone does not ensure timely deletion.
- Full privacy governance also requires organization-approved retention schedules, storage-region review, backups policy, appeal/restore constraints, export completeness evidence, processing agreements and a tested support/incident procedure. These are not established by migration or unit tests.

## Deployment acceptance tests

1. Create two unrelated staging users with different tenant IDs, independent CVs and separate storage prefixes. Confirm no cross-tenant object read, overwrite, export or session list.
2. Confirm OCV1 reads before keyring deployment, after new key deployment, and after user-controlled OCV2 conversion; then rotate OCV2 to a second active key without deleting old keys.
3. Simulate R2 failures on put, get, delete and listing; verify CAS never loses the only current CV and a failed purge remains retryable.
4. Insert records beyond prior one-shot export limits; traverse every page and verify all counts and contents belong to the correct user. Repeat while concurrent updates occur and verify the explicit non-snapshot warning.
5. Revoke browser sessions with current and forged CSRF; verify unrelated users remain signed in.
6. Validate live R2 list cursor and `uploaded` metadata behavior, age-gated cleanup and partial cursors; prove recent uploads and currently referenced CVs are retained.
7. Validate D1 concurrency on the real Cloudflare environment, backups/restore, key custody, end-user support and privacy policies. Obtain independent security review before opening registrations.

Reference: [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
