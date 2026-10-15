# Open Career — cloud edition 0.3.1

Your private career workspace, driven by ChatGPT cloud research and your connected Gmail. The core workflow does not require an always-on laptop, Ollama, a separate inference API key, or exporting your Gmail authorization.

The deployed Site provides D1 records, private R2 CV storage, source verification, immutable attachment fingerprints, dedupe, single-run tracking and a rolling 15-send reservation cap. ChatGPT researches original public sources and writes messages. The native Gmail tool receives the exact multipart message returned by the tracker.

## Important operational distinction

A saved task, successful deployment or interactive Gmail test does not prove unattended delivery. Community reports describe scheduled sends being blocked while interactive calls work. A verified background send/attachment test establishes this account's current scheduled path; provider permissions and platform behavior may change.

The site is owner-private and relies on platform authentication. Its native MCP plugin exposes the same protected operations. Sites service access is separate from visitor Gmail consent; the tracker never proxies Gmail writes or stores Google tokens.

## Cloud workflow

1. Retrieve `/api/agent-context` and outreach history, or use the private MCP tools.
2. Claim a research run; research 40–60 Saudi employers and try to produce 10–15 meaningful, evidence-backed inquiries.
3. Record actual company/person/project sources, published named-person work email or explicit official careers-inbox invitation, contact role and candidate evidence. Preserve supervised scope. Reject internships, senior jobs and Saudi-national-only vacancies.
4. Submit packets through `queue_verified_outreach`; the tracker independently re-fetches cited quotations and freezes CV/profile state.
5. `prepare_delivery` atomically reserves one contact and a quota slot, returning an exact Gmail MIME tree with CV.pdf.
6. Forward that object unchanged through the connected Gmail tool. Record actual returned Gmail message/thread IDs, then reconcile replies and declines.
7. If the provider call is uncertain or safety-blocked, hold the reservation, report the stated reason and never retry or move the rejected action to another route.
8. Finish each run with counts computed from stored records. Insufficient evidence yields a partial run, never invented recipients.

## Development

This Sites/Vinext/Cloudflare Workers project uses D1 and R2 bindings provisioned by hosting. No personal profile, CV, token or recipient history is committed. Upload setup through authenticated API operations after publication.

Use Node.js 22.13 or newer and the pnpm version pinned in `package.json`. Production hosting and authentication use ChatGPT Sites; a generic static host is insufficient.

```sh
pnpm install --frozen-lockfile
node --test tests/cloud.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/prepare-career-ui.mjs
pnpm build
```

Use the supported Sites workflow for source synchronization, migration application, packaging and private publication. This public export includes only generic `.openai/hosting.json` bindings; initialize a new private Site for your own deployment and preserve the project identity it returns. Migrations are immutable once applied. The `ui/` source and preparation script preserve the previously tested responsive design.

## Proven limitations

Quotations prove publication, not complete semantic truth; the research agent must also review facts and prose. Some websites block fetches or omit a trustworthy recruitment route. Recipient yield can fall below 10. Confirmation of a Gmail send and D1 receipt is not a distributed transaction; ambiguous outcomes remain quarantined. No automated follow-ups or reply-body actions occur outside the authorized job outreach scope.

The old Python edition remains an optional local developer toolkit, not the required deployment model. This repository is the public source distribution. The running private Site has its own source repository and deployment workflow; pushing here does not automatically redeploy that Site.

See `docs/RESEARCH.md` and `docs/CLOUD_RUNBOOK.md` for decisions and acceptance checks.

## Source provenance and privacy

This public export is based on cloud source commit `e738f108fe021dde8fe7e54b2cc556c07deed96e` (version 0.3.1). The application logic is unchanged. Deployment identity and generated compiler state are excluded, receipt test fixtures use fictional IDs, and these public setup instructions are updated. No live candidate profile, CV bytes, Gmail credentials, contact records, or runtime database is included.

Original Open Career code is MIT licensed. Bundled third-party components retain their existing license notices.
