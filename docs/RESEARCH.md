# Architecture research and decisions — 14 October 2026

## Chosen path

ChatGPT web-scheduled task → private cloud tracker/MCP → native connected Gmail. The research model and mail authorization stay in the tools the user already connected. The tracker owns durable records and send reservations; it never claims a send succeeded merely because a prompt was scheduled.

Official documentation now explicitly supports web tasks using uploaded context, connected tools, skills and plugins, while noting that they do not retain a local working directory. This is why durable evidence and CV bytes belong in the protected tracker.

- https://learn.chatgpt.com/docs/automations
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://developers.openai.com/plugins/build/auth

## Community lessons reviewed

- OpenAI Developer Community thread 1403242 reports scheduled Gmail sends blocked while interactive sends work. Multiple October reports distinguish read from write behavior; an October 13 support reply says it is under investigation. These are reports of affected accounts, not proof every account fails or that a fix has shipped. We require an actual background send test for this account.
- A career-memory MCP implementation on Cloudflare illustrates persistent career context across chats. Its product claims do not validate this project's behavior.
- Workers MCP transport reports warn against assuming a traditional SDK transport fits a Worker lifecycle. This project exposes a small stateless native Sites JSON-RPC endpoint and follows the platform's documented private authentication path.
- Minimal GitHub mailer projects demonstrate cloud scheduling but often rely on SMTP passwords, preloaded spreadsheets or weak dedupe. They are unsuitable as a direct replacement for this user's evidence-backed, ChatGPT-first requirement.

Links:
- https://community.openai.com/t/regression-scheduled-tasks-safety-checks-block-authorized-gmail-sends-and-google-sheets-writes/1403242
- https://www.reddit.com/r/mcp/comments/1s70mfd/was_job_hunting_for_4_months_so_i_built_a/
- https://www.reddit.com/r/CloudFlare/comments/1tf03i3/psa_mcp_servers_hanging_on_cloudflare_workers_use/
- https://github.com/ziafatmajeed0/AI-outreach-email-agent
- https://github.com/Aditya-rjs/ai-job-outreach-agent

## Alternatives assessed

| Option | Useful property | Why it is not the primary path |
|---|---|---|
| Google Apps Script | Google-hosted Gmail/timers; consumer quota supports 15 recipients/day | Requires its own research-to-queue and authorization setup; does not provide ChatGPT research |
| GitHub Actions | Hosted execution, free allowances | At the October 14 evaluation, source write access was unavailable; cron delay/drop/inactivity behavior and AI engine setup also remained |
| Workers AI | Cloud inference and free daily allowance | Additional account/key/model dependency; quota needs actual measurement and some models require payment |
| Always-on local Ollama | Private local inference | Does not meet the user's laptop-off outcome |

An alternative must not be used to bypass an observed automatic approval rejection. If native scheduled sending is rejected, stop the write, preserve state and explain the actual blocker.

## Open-source components

Original application code/UI: MIT. Reused components retain licenses: Vinext/React and Zod, Drizzle for schema/migration generation, htmlparser2 (MIT) for source parsing, and robots-parser (MIT) for robots policy. No proprietary platform was copied or bypassed.

## Follow-up audit and decisions — 14 October 2026

The first acceptance test demonstrated actual background Gmail delivery to the owner with a byte-identical CV. It did not demonstrate daily research, employer delivery or response yield. Those are distinct acceptance criteria.

### Product corrections implemented in 0.3.1

| Finding | Decision and implementation |
|---|---|
| Named-person-only gate excluded legitimate employer application channels | Accept an official corporate careers inbox only when the employer's own page explicitly invites CVs/applications. Preserve named-person verification as the other route. Never invent a human recipient. |
| Fresh tasks lacked the full packet/API contract | Return a credential-free research and delivery contract in `/api/agent-context`, including fields, endpoints, recipient rules, replay behavior and error handling. |
| Saved draft was shown as delivery readiness | Require a successful background test for the currently stored CV fingerprint. |
| Pausing during source fetch could still reserve delivery | Recheck pause state and background/CV verification inside the atomic SQL reservation. |
| Network retry of a stored receipt looked like failure | Make identical receipt recording idempotent; reject conflicting provider identifiers. Never retry the actual email send. |
| Declines/bounces had no structured evidence trail | Store actual source message IDs, timestamp and short summary; suppress further contact without deleting sent history or quota usage. |
| Cancelled messages inflated completed queue counts | Exclude cancelled/rejected rows from completion metrics. |
| Long research runs had no lease refresh | Add heartbeat operation, preserving the single active run constraint. |

### Recruitment-community findings

Recruiter comments favor concise, complete introductions explaining relevant experience, target role and location, with a CV attached. They also distinguish active-vacancy fit from speculative interest. These are qualitative practitioner reports, not controlled evidence of a response-rate uplift. Applied design: prefer 80–160 words, a specific technical connection, accurate supervised scope and a clear request; avoid generic admiration and fabricated familiarity. Do not optimize to an invented open-rate benchmark or add tracking pixels.

- https://www.reddit.com/r/recruiting/comments/mlh32s/cold_emails_to_introduce_yourself_to_a_recruiter/
- https://www.reddit.com/r/recruiting/comments/12ysdle/coldmessaging_recruiters_on_linkedin/

### Real-source evaluation

Official pages were inspected, not merely search snippets:

- Saudi ProTech explicitly welcomes fresh graduates and invites PDF CVs through its HR address; its electrical services cover panels, power distribution and industrial installations. A speculative junior inquiry must still avoid claiming a current suitable vacancy. https://saudiprotech.com/careers/ and https://saudiprotech.com/service/electrical/
- SALCON publishes a careers inbox and describes control-panel manufacture, integration and commissioning support, providing a concrete connection to supervised panel experience. https://salcon-electric.com.sa/career/ and https://salcon-electric.com.sa/about-us/
- Power Drive publishes a CV invitation and electrical-maintenance openings; its requirements still need role-level review. https://www.powerdrivecorp.com/careers.html and https://www.powerdrivecorp.com/services.html
- ATG asks applicants for personally configured platforms and commissioning records, which the current candidate profile does not establish. Hold rather than infer qualifications. Its website/email domain difference also requires verified corporate-domain handling before automated acceptance. https://atgcontrols.com/careers/
- AISIC's graduate listing is explicitly Saudi-national-only; reject that vacancy. A separate general CV invitation is not permission to represent eligibility for the restricted role. https://aisicompany.com/careers

### Deferred ideas and why

- Paid enrichment/email guessing: conflicts with cost and source-trust requirements.
- Automatic follow-up sequences: risk repeated unwanted contact; prioritize new, verified opportunities and actual replies.
- Fancy autonomous-agent frameworks: no demonstrated advantage for this bounded task; keep the durable tracker and existing ChatGPT tools.
- CV rewrites per employer: risks altering approved evidence and attachment identity; personalize the email instead.
- More graphical effects: secondary to working discovery, exact delivery and useful run reporting; visual QA remains unverified in this environment.

A daily target of 10–15 is an objective, not an evidence guarantee. Research must report real reviewed/sent/held counts and reasons; it must never lower verification standards to fill a quota.

## Source publishing update — 15 October 2026

The repository owner installed the GitHub app on the repository-owning account. Native installation and repository reads now confirm access to `engatworks/Open-Career`. The earlier HTTP 403 was an integration-access blocker, independent of the private cloud runtime. This public export contains application source and synthetic test fixtures, not runtime personal data.
