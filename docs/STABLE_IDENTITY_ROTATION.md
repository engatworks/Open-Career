# Stable Tenant Identity Registry and Key Rotation

**Status:** Software mitigation, not a performed rotation or live migration. Deploy `0009_stable_identities.sql` into a private staging database first.

## Why the registry matters

Open Career originally deterministically computed each `usr_*` tenant ID using HMAC of the verified OIDC issuer and subject with `OPENCAREER_TENANT_SECRET`. This scheme does not provide safe rollover: swapping that secret changes the derived account ID, so the same person can appear to have an empty new workspace.

`tenant_identities` now contains a unique tuple of **(signed issuer, signed subject)** mapped to one stable tenant ID. Existing mappings are checked *after* verifying the JWT signature, issuer, audience and expiry; never use an email alone to claim a tenant. Onboarding atomically inserts the tenant account and immutable provider mapping. An existing mapping is never silently reassigned. The mapping belongs to the tenant and is deleted through database foreign-key cascade on account erasure.

## Required sequence for a safe legacy rollout

1. Back up your D1 database and securely retain the existing `OPENCAREER_TENANT_SECRET` outside GitHub. Verify a restore on staging.
2. Deploy code and D1 migration `0009_stable_identities` **without changing** `OPENCAREER_TENANT_SECRET`. Sign in using the provider identity currently associated with each active existing account; each successful verified login binds that subject to the existing tenant ID.
3. Verify every active account has at least one mapping. Suggested read-only operator query:
   ```sql
   SELECT a.id FROM tenant_accounts a
   LEFT JOIN tenant_identities i ON i.tenant_id=a.id
   WHERE a.status='active' AND i.id IS NULL;
   ```
   **This query must return no rows** before key rotation. Accounts that have never logged in after this migration require an operator-supervised, identity-proofed link. The original HMAC tenant ID cannot be reversed to recover its issuer/subject.
4. Check two unrelated staging users with identical names and disjoint subjects cannot read each other's data; verify the same signed issuer/subject maps to the exact same tenant after changing the HMAC secret **only in isolated staging**.
5. Rotate the derivation secret as a coordinated release, preserving a secure backup and keeping all live instances on the same version. Active mapped users continue to resolve to the stored ID. New users derive their first ID using the newly configured secret.
6. Monitor login collisions and reconcile anomalies privately. A previously unmapped user with a verified email matching an existing account is blocked with a reconciliation error; Open Career does **not** automatically link accounts based on email.

## Caveats

- An OIDC identity provider may change a subject after a client registration switch, tenant migration or change in pairwise subject settings. Such identity changes require a separate explicit, identity-proofed account-linking procedure. This implementation does not claim cross-provider account linking.
- Provider subject strings are personally identifying authentication metadata. They are kept in D1 under access controls, added to tenant-specific paginated exports and erased along with the account. Legal retention/privacy review is required.
- Existing OIDC sessions that were created before the registry migration are still bounded/revocable; new signed bearer identities use the registry. Expired tokens cannot self-provision accounts.
- Authentication fails closed if the required migration has not been applied to D1. Merely merging the code will not migrate a live service.
- **Never rotate** the secret when there are unmapped accounts unless the operator has provided a secure and tested recovery/identity-verification mechanism. An email-only relink is unsafe.
- Registry metadata is not a replacement for key custody, independent MFA, encrypted backups, provider audits or tested disaster recovery.

For additional risks see `docs/SENIOR_ENGINEERING_AUDIT_2026-10-21.md` and `docs/DATA_LIFECYCLE_AND_KEY_ROTATION.md`.
