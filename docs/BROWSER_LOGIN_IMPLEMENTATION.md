# Open Career — Browser sign-in and onboarding (alpha source)

This release implements a new optional, separate **server-side OpenID Connect Authorization Code + PKCE** login flow and a real `/join` onboarding interface. This does not modify the legacy private outreach UI, does not make the private Site public, does not send applications, and does not create real third-party accounts before an identity provider is configured.

## Security design (review before enabling)

- Server generates cryptographically random OAuth `state`, PKCE `code_verifier` and OIDC `nonce`. It stores the verifier and nonce in D1 under the *hash* of state and sets a 10-minute, Secure, HttpOnly, SameSite=Lax, `__Host-` browser transaction cookie.
- The authorization server sends the browser back to `/auth/callback`. The server requires the callback `state` to match the short-lived browser cookie, consumes the D1 record *once*, and exchanges the authorization code over HTTPS with the identity provider. The code challenge uses S256.
- The ID token is verified against the pinned configured issuer's JWKS, signed RS256, exact `iss`, `aud` equal to this site's OIDC client ID, expiration, issued-at time, and the original one-time nonce. We do not treat an opaque access token as an ID token, and we do not ask the browser to decode any credential.
- The server provisions only that verified `issuer/sub`'s tenant, then creates a 12-hour session. The browser receives only a 256-bit opaque `__Host-oc_session` cookie with Secure, HttpOnly, SameSite=Lax and Path=/. D1 stores **only its SHA-256**, tenant ID and expiry. OAuth access/refresh/ID tokens and PKCE verifiers never enter browser JS or session storage.
- Every browser POST/DELETE to `/api/v2` requires the same-origin Origin header and a session-bound CSRF header. The CSRF value comes from `GET /auth/session`, is HMAC-derived and is not sufficient without the cookie. An explicit `Authorization: Bearer` header uses the original validated API token path rather than cookie fallback.
- `POST /auth/logout` revokes the D1 session. Account deletion relies on the tenant foreign-key cascade to revoke all sessions for that account. No automatic refresh tokens are stored.
- The existing private `/api/*` and `/mcp` routes remain owner-only. The new UI calls `/api/v2/*` and public read-only ATS job discovery only.

## Environment configuration

Provision **secrets**, not repository files:

| Environment variable | Purpose |
| --- | --- |
| `OPENCAREER_SITE_ORIGIN` | Exact public HTTPS origin, e.g. `https://career.example.com`, no trailing slash |
| `OPENCAREER_OIDC_ISSUER` | Exact issuer from the identity provider |
| `OPENCAREER_OIDC_JWKS_URL` | HTTPS JWKS URL from the identity provider |
| `OPENCAREER_OIDC_CLIENT_ID` | Registered confidential OAuth client ID |
| `OPENCAREER_OIDC_CLIENT_SECRET` | Registered client secret; stored only server-side |
| `OPENCAREER_OIDC_AUTH_URL` | HTTPS authorization URL |
| `OPENCAREER_OIDC_TOKEN_URL` | HTTPS authorization-code token exchange URL |
| `OPENCAREER_SESSION_SECRET` | Base64url encoding of a fresh 32-byte random HMAC key |
| `OPENCAREER_TENANT_SECRET` | Stable base64url 32-byte tenant derivation key (see multi-tenant document) |
| `OPENCAREER_CV_ENCRYPTION_KEY` | Separate base64url 32-byte CV encryption key |

Register the identity provider's callback as **exactly** `https://YOUR_HOST/auth/callback`. Ensure its confidential client supports RS256 OIDC ID tokens and enforces PKCE (S256) during token exchange. The previous `OPENCAREER_OIDC_AUDIENCE` continues to apply to direct bearer API/MCP tokens (resource API); it is **not** used as the ID-token client audience for browser login. Provider selection, domain/SSL setup, secrets, deployment, sign-in branding and real account verification are still operator-owned tasks.

## New user experience

Visit `/join`. With no configured provider, the page displays a disabled early-access state rather than inventing a working login.

With valid provider configuration, **Sign in or create your account** redirects to that provider, returns through the secured callback, and creates a private workspace for the verified subject. The client can edit personal evidence, upload and download its encrypted PDF CV, search a known Greenhouse/Lever/Ashby job board, save candidate jobs, add unverified professional contacts, export data, sign out or request account deletion.

Saving a job is **not submitting an application**; no automated portal registration or email sending has been connected to browser onboarding.

## Production rollout gates (not completed)

1. Use staging domain and real configured identity provider with two unrelated test identities.
2. Run migration `0005_browser_oidc.sql`, confirm D1 foreign-key cascades and R2 CV encryption behavior on real hosted bindings.
3. Verify HTTPS-only cookies survive Cloudflare/Vinext/Next navigation, callback redirects, CSP, caching, and MFA/SSO challenges.
4. Verify same-origin/CSRF failure modes with a cross-origin harness; inspect full browser console and network flows.
5. Add request throttling and monitoring to `/auth/start`, provider availability alerts, and login audit trails.
6. Build token refresh/re-auth UX, session management, secret rotation, GDPR/legal/privacy policy, data-retention enforcement and abuse controls.
7. Lock the legacy owner-only routes to an owner-only audience before any new user may access the same host.
8. Carry out independent security review and end-to-end test before general availability.

Security standard references: [RFC 9700](https://www.rfc-editor.org/info/rfc9700/) and [RFC 10017](https://www.rfc-editor.org/info/rfc10017/) (August 2026).

## Local tests

```bash
node --test tests/browser-auth.test.mjs tests/tenants.test.mjs
node --test tests/ats.test.mjs tests/cloud.test.mjs
node node_modules/drizzle-kit/bin.cjs check
node node_modules/typescript/bin/tsc --noEmit
```

The code in GitHub is not a live deployment, and no actual user accounts have been provisioned in production.
