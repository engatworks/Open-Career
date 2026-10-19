# Open Career MVP — Privacy Notice DRAFT (legal review required)

**Document date: 19 October 2026. NOT production-approved.** Before public access, identify the actual legal operator, country of establishment, contact point and applicable privacy law. The privacy rules and privacy rights of users in Saudi Arabia, the EEA, UK and other regions may differ. This draft does not replace qualified legal review.

## What the app would collect
- Account identity and consent: authenticated account ID, version and time of accepted Terms, optional action scopes and revocations.
- Candidate records: name, contact details, educational history, CV versions and eligibility answers supplied by users.
- Employment search: company and recruiter contacts, public source excerpts, job links, applications, outreach messages and confirmation records.
- Portal-account *references*: website hostname and login email. **This MVP does not store passwords, OTPs or browser sessions**; the design requires a separate encrypted vault before implementing credential storage.
- Diagnostics: timestamps, application status, errors, provider receipt IDs and audit events.

## Purposes
Only user-authorized job discovery, matching, recruiter outreach, applying, account reference management, reporting, follow-up and duplicate prevention. Contact data must remain limited to relevant professional outreach, sourced and subject to opt-outs.

## Third-party providers and transfers
ChatGPT, Claude, Gmail, employers, applicant tracking systems and hosting providers may separately process information under their own policies when a user authorizes those integrations. The current private Cloudflare/Sites app uses D1 for metadata and R2 for private CV files. The app does not collect Gmail OAuth tokens or process email sends itself. Browser automation may access employer websites through the user's AI host. Publish actual provider lists and data transfer mechanisms before launch.

## Security
Use user-specific authorization, minimum scopes, audit logs and private storage. No applicant secrets in public GitHub, CSV imports, message bodies, or application logs. Encrypt credentials only if/when a separately tested vault exists. Inspect exports, backups, permissions and breach response before enabling multi-user accounts.

## Retention and user rights
Consent may be revoked; this prevents future authorized actions but cannot retract emails or submitted applications. Users should be able to view/export their application history and request deletion subject to lawful retention requirements. Define actual retention windows, legal basis, data subject rights, support contact, incident notification procedures and deletion schedules before public deployment.

## Launch blocker
This text is informational and preliminary. Do not represent it as a compliant finalized privacy notice until the operator and qualified counsel review jurisdiction, processors, international transfers, user access/delete controls, retention, and applicable data-protection obligations.
