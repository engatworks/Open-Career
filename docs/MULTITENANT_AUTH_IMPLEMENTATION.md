# Multi-user foundation: signed identities and private workspaces

Status: **implementation branch / controlled alpha**, not a publicly available sign-up or deployed service. Do **not** change the existing owner-private Site sharing configuration or install this as a public MCP without a real identity provider and security acceptance tests.

## Threat model and trust boundaries

Every request to `/api/v2/*` and `/mcp/v2` must contain an OIDC RS256 bearer JWT signed by the *configured* identity provider. The server checks the exact issuer, audience, expiration, not-before, issue time and signature using pinned provider JWKS. It does not trust `x-user-id`, `x-tenant-id`, email fields, model-supplied claims or unsigned token payloads.

Each identity's tenant ID is a non-reversible HMAC of `issuer + NUL + subject` under a private, 32-byte environment secret. **Never** allow client-selected tenant IDs or model-picked tenant IDs to reach database constructors. Tenants are automatically separated by server-derived ID.

The new v2 workspace owns its own `tenant_accounts`, `tenant_profiles`, `tenant_documents`, `tenant_contacts`, `tenant_events`, and previously added `ats_applications`. All direct reads/writes use a tenant predicate; contact email uniqueness is **within** a tenant rather than global. User CV files are AES-256-GCM encrypted before R2 storage with random IVs and stored under `tenants/{verifiedTenantId}/cv/{randomUUID}.ocv`. CV reads verify SHA-256 against tenant document metadata.

**Legacy warning:** The existing `/api/*`, `/mcp`, old `Career` and `ContactDatabase` are owner-global. They have not been opened to new users or made multi-tenant. This work creates a parallel v2 boundary; it does NOT magically isolate old data. Keep legacy access owner-private. Never route tenant traffic to the legacy API.

## Configuration — only through secure hosted environment secrets

- `OPENCAREER_OIDC_ISSUER`: exact HTTPS issuer claim, no trailing slash
- `OPENCAREER_OIDC_AUDIENCE`: exact audience ID of the connected OAuth/OIDC client
- `OPENCAREER_OIDC_JWKS_URL`: HTTPS JSON Web Key Set URL provided by that issuer
- `OPENCAREER_TENANT_SECRET`: base64url encoding of **32 random bytes**, reserved for stable tenant-ID HMAC; must be backed up privately (changing it remaps accounts).
- `OPENCAREER_CV_ENCRYPTION_KEY`: base64url encoding of **32 independently generated random bytes**, reserved for AES-256-GCM encrypted CVs; losing it makes CV files unreadable.

Never commit these secrets to GitHub or scheduled task prompts. Provision a real OAuth/OIDC login UI and client registration separately. Verify the chosen provider's access token format; some providers issue **opaque access tokens**, which this JWT verifier intentionally rejects. Do not pass an ID token from an inappropriate OAuth client or bypass audience checks.

## API: only the current signed identity

- `POST /api/v2/onboard` — provision own tenant account.
- `GET /api/v2/me`, `GET /api/v2/profile`, `POST /api/v2/profile`.
- `POST /api/v2/cv` — raw PDF up to 5 MB, encrypted before storage.
- `GET /api/v2/cv` — only own decrypted PDF with integrity check; `GET /api/v2/cv/info`; `DELETE /api/v2/cv`.
- `GET /api/v2/contacts`, `POST /api/v2/contacts`, `POST /api/v2/contacts/suppress`. Imported contacts are always unverified and do NOT grant send eligibility.
- `GET /api/v2/applications`, `POST /api/v2/applications/track`, `POST /api/v2/applications/prepare`, `POST /api/v2/applications/approve`, `POST /api/v2/applications/cancel`. Approvals verify the tenant's current CV fingerprint and never send/submit a job application.
- `GET /api/v2/export` — private JSON export, encrypted CV file downloadable separately.
- `DELETE /api/v2/account` with JSON `{"confirm":"DELETE MY ACCOUNT"}` — marks account inactive, deletes own encrypted documents and tenant rows, with retryable intermediate deletion state on error. Must still be tested against live database/R2 failures before general availability.

The v2 MCP endpoint `POST /mcp/v2` exposes strictly tenant-scoped discovery/profile/contact/application preparation tools. MCP approval is **not** an application submission. No Gmail/portal/ATS sending capability is exposed.

## Identity onboarding remains outstanding

This repository has a verified-token API but does not yet contain a production OAuth/OIDC sign-in page, OAuth authorization code + PKCE setup, user session management, account linking across identity providers, or email verification user experience. Users cannot self-register through the current legacy UI.

The private Cloudflare/ChatGPT Sites deployment was **not** updated simply by merging GitHub. Any production rollout must:

1. Select and configure a legitimate identity provider, production-client audience, redirect URIs and JWKS.
2. Enforce protections on the legacy owner-only endpoints while exposing only v2 to authorized users.
3. Generate/store the tenant and CV keys securely; implement rotation with envelope/key-version support before large-scale use.
4. Run a staging deployment, migrate a test D1, provision multiple identities, test CV upload/download/isolation/deletion and revoked credentials.
5. Review the encrypted CV deletion guarantees, key migration, request size limits, abuse/rate limits and per-user data retention.
6. Verify no tenant can reach another tenant's resources through any API, MCP, app route, export, background job, queue or object storage link.
7. Add actual OAuth onboarding UX and user account administration before inviting users.

This milestone is the account/data security backend, **not** a public career assistant, a finished GDPR compliance program or autonomous ATS submission.

## Test

```bash
node --test tests/tenants.test.mjs
node --test tests/ats.test.mjs tests/cloud.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The tests generate RSA keypairs in memory, mint JWTs, verify invalid/tampered tokens are refused, exercise a real SQLite migration in memory, and check tenant isolation for CV bytes, contacts, profiles, ATS records and deletion. They do not use real identities or real candidate data.
