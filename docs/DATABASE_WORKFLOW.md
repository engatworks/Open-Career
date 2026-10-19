# Open Career 0.5.0: a database that accumulates evidence

Research and access checked 18 October 2026. This release supplies a private searchable company inventory, a separate contact-candidate database, bounded public-page collection, provenance, CSV import and source-yield reports. It does not claim Apollo-equivalent coverage.

## What the research established

Apollo describes four data inputs: contributor contacts, engagement/reply/bounce signals, public crawling and third-party providers. Its coverage is not reproducible by installing a scraper. See [Apollo's data overview](https://knowledge.apollo.io/hc/en-us/articles/45824429846669-Apollo-Data-Overview).

- [OpenLeads](https://github.com/Samyrrrrrr990/openleads), AGPL-3.0, is an actual local discovery/CRM application. Its published benchmark includes pattern-derived addresses in evidence-backed results and has no Saudi benchmark. Do not substitute its safe/verified status for exact published address proof. No project code was copied into Open Career.
- [Dataforge](https://github.com/Nuclear-Marmalade/dataforge), MIT, has website enrichment, Overture discovery and US-oriented datasets. It does not ship a comparable named-contact database. Inspected discovery code uses a historical Overture release and US ZIP geography; it needs adaptation before Saudi use.
- Community alternatives commonly combine paid data with free storage/verification. [One concrete Reddit example](https://www.reddit.com/r/leadgeninsiders/comments/1wtbu42/i_replaced_apollo_with_an_api_lead_database/) still pays for its underlying databases. Community claims are leads to investigate, not a benchmark or quality guarantee.
- [Common Crawl terms](https://commoncrawl.org/terms-of-use), section 2(l), prohibit harvesting personal information separately from crawled content. It is not an email-harvesting feed for this project.
- [CAFS April 2026 directory](https://cafs.org.sa/the-5th-edition-of-the-cafs-membership-directory/) supplies 310+ member-company profiles. Actual extraction of its public 333-page PDF found zero email occurrences. The public/private contact distinction is explained in its [earlier edition notice](https://cafs.org.sa/the-4th-edition-of-the-cafs-membership-directory/). Do not buy membership just to assume job-search access.

## Useful free sources and manual access

### 1. People Data Labs company inventory

[Download form](https://www.peopledatalabs.com/data-lab/dataset/company-dataset) advertises 23.8m+ global companies. [Official documentation](https://docs.peopledatalabs.com/docs/free-company-dataset) describes a quarterly company dataset under CC BY 4.0: name, website, industry, size, headquarters country/locality and LinkedIn URL. It contains no personal emails. Saudi coverage has not been measured before downloading.

The form asks for name, work email, job title and company plus dropdowns. Complete it truthfully; acceptance of a personal Gmail address is not established. Obtain the free CSV/JSON and give Open Career the file or download link. Do not substitute paid company or people data. A global parent company's HQ country does not establish Saudi branch presence.

For a large CSV or JSONL, `scripts/filter-company-dataset.py` streams it without loading the whole file. Default country is Saudi Arabia. Optional `--industry` filters narrow electrical/industrial sectors and repeated `--include-domain` options retain global parents for separate Saudi research. Output is 100-row import packets retaining PDL attribution. It refuses to overwrite existing outputs and makes no network requests. Import each packet through POST /api/companies/import. Never import millions of irrelevant records into the hosted tracker.

### 2. Hunter permanent Free plan

[Official plan details](https://help.hunter.io/en/articles/11060999-what-s-included-in-hunter-s-free-plan) currently list 50 shared credits/month, API access, no card, 30 AI Discover searches and CSV exports limited to 10 emails per domain. A constrained supplement, not unlimited contact supply.

[Domain Search steps](https://help.hunter.io/en/articles/1830792-domain-search-find-emails-from-companies): enter a domain; select Email Source=Public, Email Type=Personal (named professional addresses), require full name and title, then narrow location/department. Reveal selected suitable contacts, expand Sources, export CSV and preserve each original source URL. The current UI guide states one credit per reveal; do not assume old API credit ratios. Never use inferred addresses. No Gmail connection is required for discovery. Sending remains solely in the existing Open Career/Gmail workflow.

Apollo's connected profile can be read, but the actual People Search test on the selected Free account returned API_INACCESSIBLE / ENDPOINT_ACCESS_DENIED. A credit balance does not grant API access. No paid enrichment was attempted. An existing legitimately exported Apollo CSV can be imported as unverified research if its use is permitted; no export-credit restriction is bypassed.

## How to use the private database

1. Open **Contact database** in the sidebar. Search contacts by company, name, role, domain or location. Switch to Companies for imported employer records.
2. Import permitted company records or contact CSVs, at most 100 rows / 150 KB per request. Supplied names and roles are claims, not verified current employment. No inferred/guessed addresses are accepted.
3. Collect 1–5 explicitly selected public original URLs. The UI processes them one at a time. The service checks robots, HTTPS, redirects, byte and PDF limits; stores exact email candidates and local source context; returns same-site team/contact links for the next bounded batch. It does not recursively scrape the web.
4. Review retained observations. Exact publication and identity/current-role verification remain different checks. An address may be shared even when it looks personal. Multiple sources and historical imports can conflict; do not silently choose the most convenient claim.
5. The daily agent uses the company inventory and contact database first, revisits relevant sources, researches the person and employer, and creates the existing outreach packet only if eligible. Named-person inquiries do not require a vacancy; recruitment inbox fallbacks require an explicit CV invitation.
6. Gmail history, company dedupe, opt-outs, current CV fingerprint, rolling 15-send cap, atomic reserve, one send and actual provider receipt still control delivery. Database collection/import cannot send.

## API

- GET `/api/companies?q=&offset=`; POST `/api/companies/import`
- GET `/api/contacts?q=&domain=&kind=named|published|uncontacted&limit=25&offset=0`
- GET `/api/contacts/detail?email=...`; GET `/api/contacts/stats`
- POST `/api/contacts/import` with provider, optional source_url and CSV or records
- POST `/api/contacts/collect` with urls

Read the durable agent guide for exact field contracts. All database records and source excerpts are private; no candidate/contact export is committed to the public code repository. Email-domain count is not verified employer count. Named-claim count is not current-person count. Measure usable named-person yield and holds, not raw database size.

## Validation limits

Automated tests exercise migrations, atomic imports, source deduplication, guessed-address rejection, retained attribution, suppressed-contact filtering and separation from delivery, alongside the existing evidence/CV/reservation tests. Live deployment checks exercise actual imports and collection. Browser rendering requires separate visual QA where browser tooling is available.
