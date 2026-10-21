# Open Career Security Policy

## Supported releases

Open Career is currently an experimental, owner-private project with pre-release multi-user components. No public production multi-user version has been released, and this repository is not an audited service.

## Reporting a vulnerability

Please disclose vulnerabilities **privately** through the repository's GitHub Security tab and its private vulnerability reporting or advisory mechanism when available. If that mechanism is unavailable, contact a maintainer through a private, trusted channel without publishing exploit details or personal information. Do not include candidate CVs, bearer tokens, session cookies, API keys or other people's data in reports.

Include affected commit/endpoint, minimal sanitized reproduction, expected and observed behavior, impact, and suggested remediation. Do not run destructive tests against another person's workspace or crawl employer sites in violation of their rules.

## Security scope and current restrictions

- Original single-user `/api/*` and `/mcp` endpoints have access to personal contact research, outreach and CV data. They are allowed only in an operator-verified, separately protected `owner_private` deployment. They MUST NOT run in a public multi-user application.
- Multi-user v2 routes use verified OIDC identity, isolated database access and encrypted CV storage. The code is not equivalent to a completed security or privacy audit.
- Access mode defaults closed when missing/misspelled. Public-beta signup requires a verified-email allowlist. Open-public mode must not be used until independent rollout gates are met.
- Scheduled external email actions and job-portal submissions are not evidence of delivery or submission without receipts.
- CVs and contact information are personal data. Never commit real user data, secrets, logs containing PII, or test credentials to this source repository.
- Use separate storage bindings and identity clients for owner-private, staging and public environments.

See `docs/COMMERCIAL_BETA_GATES.md` for the detailed checklist before any public release. This document is a security reporting process, **not a warranty**.
