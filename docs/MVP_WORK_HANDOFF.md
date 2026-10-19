# Open Career — ChatGPT Work execution handoff

This is an operational handoff to a user-initiated authenticated ChatGPT Work session. It must not be mistaken for proof that such a session has run.

## Objective

Finish staging and acceptance of engatworks/Open-Career PR #2 without changing the existing owner's live private outreach deployment until staging is verified. Then attempt exactly ONE real, eligible graduate electrical-engineering vacancy through a compatible site/browser with the user's actual CV.

## Constraints

- Read docs/MVP_STAGING_RUNBOOK.md and docs/MVP_ARCHITECTURE.md first.
- Never publish the private Site, stored CV, Gmail records, application credentials, OAuth tokens or private database snapshots into the public repository.
- The private deployment and GitHub source are not the same environment; do not assume committing automatically publishes the Site.
- Before any production migration or change, locate and verify recovery paths and test staging. Do not alter the current owner's data or existing daily tasks in order to speed up the pilot.
- Do not manufacture candidate facts, job eligibility, contacts, applications or employer confirmations.
- A user may authorize application submission, yet the browser host's required approvals and external website restrictions remain binding.
- Resolve inconsistent candidate legal-name presentation in existing materials with the user before official application forms.
- Do not claim a completed submission without evidence. Pauses, inaccessible sites and uncertain outcomes require explicit status and no blind retry.

## Acceptance

1. GitHub branch tests and TypeScript checks pass.
2. Site preview applies D1 migration and opens consent UI privately with a real signed-in identity. New MCP tools work and unauthorized calls fail.
3. Previous outreach and CV records are intact.
4. A suitable official employer vacancy is chosen and eligibility checked.
5. One application is completed and linked to the private tracker with an external confirmation/reference, or recorded accurately as blocked with the exact reason.
6. Rerunning does not submit the same vacancy twice.
7. Return links/IDs to evidence and a concise summary of actual verified steps and remaining blockers.

If Work cannot reach the Site management interface or use the necessary browser capability, stop rather than creating a new unrelated deployment.
