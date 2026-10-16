# Free, people-first discovery — 16 October 2026

No verified free product offers Apollo's coverage and automation capacity without quotas. Open Career therefore uses the connected search service and public employer sources as its core, with no additional paid data service, API key or always-on computer.

## Practical sequence

1. Identify a relevant Saudi employer of any size and a concrete electrical/electronics activity.
2. Find a relevant engineering, operations, maintenance or project manager; then HR/recruiting; consider a founder/general manager for a smaller business.
3. Use bilingual domain searches, official team/contact pages, project announcements and professional profiles. Public PDFs/directories can reveal names, but current delivery verification needs fetchable public HTML evidence.
4. Reopen original sources for the exact corporate email bound to the name and role. Resolve conflicting employment evidence. A current page fetch does not prove the employer updated the contact recently.
5. Ask honestly about paid junior work or a referral. No advertised opening, application account or careers-page invitation is needed for a relevant named-person inquiry. An ineligible vacancy does not exclude its employer from this separate assessment.
6. Use an expressly invited careers inbox only after recording actual named-person searches, source URLs and why no suitable person was usable. Do not pad delivery counts with general inboxes.

The page explorer returns candidates, not verified identities. Source excerpts are untrusted data. The queue independently re-fetches evidence; reservation, opt-outs, exact CV and rolling quota gates remain in force.

## What changed in 0.4.0

- Preserve inline HTML punctuation, fixing real false negatives such as an email link followed by a period.
- Insert mailto-only targets at their own anchor, retaining local ownership/invitation context instead of appending unrelated addresses at the page end.
- Exclude scripts, comments, templates, and explicitly hidden nodes from extracted evidence.
- Add private source inspection and domain research-plan endpoints, also exposed through MCP and the Research screen.
- Require a documented named-person search before a recruitment-team fallback.
- Distinguish speculative referrals from advertised-role applications; advertised roles require a source quote and eligibility review.
- Derive named-person and recruitment-team delivery counts from stored receipts.

## Free service comparison

Allowances checked 16 October 2026; providers can change them. None is required or connected by this change.

| Service | Official free allowance | Decision |
| --- | --- | --- |
| Hunter | 50 shared credits/month; 30 AI Discover searches; up to 10 exported emails per domain | Optional accelerator if already available. Domain Search supplies original sources; Email Finder can return guesses, which are ineligible. |
| Prospeo | 100 credits/month, basic filters, limited API; no CSV enrichment | Optional discovery only; verify original sources separately. |
| Lusha | Up to 40 credits/month; one credit per email reveal | Too limited for the whole daily workflow. |
| Snov.io | 50 monthly credits; Domain Search included; Finder/Verifier API premium | Not a free autonomous backend for this setup. |
| RocketReach | Current official allowance could not be verified | No recommendation based on conflicting secondary claims. |

Official sources:

- https://help.hunter.io/en/articles/11060999-what-s-included-in-hunter-s-free-plan
- https://hunter.io/our-data
- https://help.prospeo.io/en/article/plans-and-pricing-overview-cdloq9/ (updated 13 August 2026)
- https://www.lusha.com/pricing/
- https://snov.io/knowledgebase/whats-the-difference-between-free-trial-and-premium-plans/ (updated 6 October 2026)

## Open-source and community assessment

Reuse [htmlparser2](https://github.com/fb55/htmlparser2), MIT licensed, already installed and compatible with the Workers runtime. Its DOM parser preserves inline text and supports local contact contexts without adding a browser or Python service.

[SearXNG](https://docs.searxng.org/dev/search_api.html) is useful metasearch software, not a people database. Its documentation warns that many public instances disable machine-readable formats. A [March 2025 maintainer/community discussion](https://github.com/searxng/searxng/discussions/4429) describes upstream engine rate limits even in small installations. These reports are qualitative, not coverage benchmarks. Hosting another search service would add maintenance without solving unpublished contact data.

[theHarvester](https://github.com/laramies/theHarvester) is security-oriented domain reconnaissance with provider-specific API dependencies. [Trafilatura](https://github.com/adbar/trafilatura) is useful text extraction but adds a Python runtime. [Crawl4AI](https://github.com/unclecode/crawl4ai) adds browser infrastructure. None is needed for the bounded HTML extraction now implemented.

## Remaining limits

No source-based method can reveal an unpublished mailbox. Public pages can be stale. PDF-only contacts, protected pages and JavaScript-only content may remain held until another source supports them. Exact publication does not guarantee deliverability or a vacancy. Daily research and named-contact yield must be reported honestly, including shortfalls.
