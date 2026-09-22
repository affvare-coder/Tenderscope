# Current state — 22 September 2026

## Latest reliability release

The document worker now spaces temporary retries, preserves an immutable failure record, and reuses complete PDF parsing only for matching source bytes and parser version. Incomplete scans retain their page progress and links. Invalid or blocked evidence remains held for review.

The previously blocked 15,982,114-byte attachment for GEM/2026/B/7984244 was verified on the live system at 03:54:45 UTC on 22 September. Two earlier failed jobs were resolved using that newer exact-source verification; their original errors remain recorded. Existing bids, dates, source history and earlier source checkpoints are preserved.

50 backend tests and database acceptance checks passed, including retry pacing, expired leases, unchanged/changed PDF cache behavior, complete annotation scans, identity checks, queue fairness and private data access. Frontend application code is unchanged in this release.

Phase 1 acceptance remains open: at 03:55 UTC, deep and daily discovery had completed 1,840 and 1,841 of 1,844 lanes, with about 7,100 document jobs pending. Full hourly/four-hour completion has not been demonstrated. Phone sign-in and WhatsApp delivery still need their providers configured.

## Earlier checkpoints

- Website: https://tenderscope-healthcare.netlify.app
- Public frontend repository: `affvare-coder/Tenderscope`, branch `main`.
- Existing Netlify site and Supabase database remain in use.
- Redesigned responsive healthcare workspace, search/filter/sort controls, opportunity categories, deadline watch, bid details, source documents and change timeline are deployed.
- Email/password and Google authentication are connected. Member PDF downloads and CSV export have server-side authorization, rate limits and a configurable membership policy. Downloads are free for verified accounts today.
- A temporary verified test account successfully signed in, downloaded a real official PDF and exported CSV. The test account was deleted and temporary QA endpoint retired.
- Collection runs independently of ChatGPT. Hourly discovery, four-hour deep reconciliation and daily recovery are scheduled. Every run and durable retry remains recorded.
- At 01:24 UTC on 21 September: 1,259 stored bids, 709 active records and 16 records with extensions. Counts continue changing.
- One complete 76-lane keyword discovery job finished. Its document dependencies remain pending. Deep and daily discovery each passed 289 of 1,844 lanes with no current source errors at this checkpoint.
- Full Phase 1 acceptance remains OPEN until complete reconciliation and document verification succeed. No zero-missed-bid guarantee is claimed.
- Backend recovery sources and detailed operational instructions are preserved separately from this public repository.

At 08:19 UTC on 21 September: 1,342 stored bids, 693 reviewed active records and 16 extended records. Deep and daily discovery passed 442 and 432 lanes respectively, with temporary GeM server errors retained for retry. A bounded-batch worker update was deployed at 08:24 UTC to improve document throughput and retry failed sources before the full sweep ends. Full acceptance remains open.

## Continuation release — 21 September 2026

The source is protected by the `recovery/before-20260921-continuation` branch. This release completes the prepared mobile verification and opt-in alert interface, adds Delhi and multi-location views, and connects official BOQ product rows to cards and bid details. Existing bid identities, source links and extension histories are preserved.

Products are parsed asynchronously from supported official GeM BOQ CSVs. Unreadable formats remain marked for review; bids still publish. Product names are not inferred from keywords or truncated listing titles. Source hashes gate current product rows, and previous rows are archived when a BOQ changes.

Delhi-only records are omitted from default feeds. Mixed locations containing Delhi remain available in both location views without creating a second bid. Historical location labels without source proof are explicitly UNVERIFIED; UNKNOWN is retained in discovery.

Phone sign-in and WhatsApp delivery require configured providers. The interface shows unavailable setup; it does not claim that messages are sending. Location and category choices, consent, and pause controls are stored per verified account. No payment or provider connection is enabled by this release.

Validation: 41 deterministic backend tests, 4 frontend behavior tests and rollback-only database checks for product history, source hash freshness, location routing and queue fairness. Full reconciliation remains incomplete; at the initial live check there were over 7,000 queued documents. Premium eligibility, OEM/price enrichment, Vault/document generation and an in-app Copilot remain subsequent phases.
