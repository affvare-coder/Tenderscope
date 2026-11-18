# TenderScope: permanent automation and completion plan
Verified baseline: 18 November 2026, 22:02 IST.
Base main: dbbbadaeb9de90c861e39e6a8dfbb0bc31be0c2d.
Status: Phase 1 incomplete. This document consolidates existing work; it does not certify deployment or activate new schedules.

## Original objective
Build a reliable autonomous GeM healthcare bidder platform for medical, dental, surgical, pharmaceutical and defence procurement. First complete discovery and synchronization: new relevant bids, exact official products/specifications/quantities, changes, extensions, corrigenda and official documents must reach the website without daily chat prompts or manual spreadsheet uploads. Then finish OEM/contact matching, participant-specific documents, ATC annexures and evidence-based representations. The product serves multiple bidders; Affix assets belong to its participant profile.

The original contract explicitly prioritizes Phase 0 and Phase 1. Do not divert substantial work to later features until the data backbone passes end-to-end acceptance.

## Consolidated evidence
| Area | Verified state | Meaning |
| --- | --- | --- |
| Database | 394,349,715 bytes | Below configured 420 MB warning and 485 MB ingestion stop; these are application guard thresholds, not a newly verified provider quota |
| Open published bids | 569 | Direct count uses status='published', not ingestion_status='published' |
| Bids with current product rows | 127 of 569, about 22.3% | Row presence does not establish the official total or full specification coverage |
| Document queue | 10,250 queued by direct count; health snapshot 10,251 two minutes earlier | Samples differ in time; do not treat a cached health count as an exact simultaneous count |
| Recent work | 448 document jobs created in 24h; 244 succeeded jobs updated in 24h | Update time is a throughput proxy, not an immutable completion event; measure true arrival/completion rates before tuning |
| Source work | Latest health source contact 21:56 IST | Contact is not a completed source sweep |
| Worker budget | 360 starts/IST day; paced at 240 seconds; 331 used at health snapshot | Preserve pacing, leases, retry limits and source backoff |
| Hourly task | Active; most recent head tick checked 4 selected lanes | Head pages only; not complete healthcare discovery |
| Four-hour task | Active; most recent tick checked 8 selected bids | Rotating subset; not a complete four-hour reconciliation |
| Daily audit | Scheduled at 01:00 IST | Scheduling success alone does not prove full audit coverage |
| Health task | Every 15 minutes; degraded snapshot | Two recent deadlock failures occurred in reconcile_sync_runs; later ticks succeeded |
| History maintenance | Active daily 00:20 IST; seven-day history; bounded 5,000 rows | Reuses DB cron and makes no GeM or model calls |
| Frontend PR #11 | Merged to main on 18 Nov at 07:19:50 IST | Earlier statements that it awaits merge are obsolete |
| Live Netlify | Still deploy 6af276da5b343c9c34b7da61 from 10 Nov | GitHub merge has not reached production |
| Completeness PR #13 | Draft, head ad1888e9fd84c86f223b079575b84e5c8a0ac320 | Official expected count and full-spec proof remain blocked |
| Retention | Stale expiry proof repair and saved-bid protection still gated | A passed deadline is not adequate deletion evidence |

Existing historical archive project is inactive. Production must not depend on its availability as an untested automatic archive destination.

## Work recovered and preserved
- DB editor/council P1: actual claim_sync_job deadline priority, reserved document slots, fairness, leases and retry safeguards; already installed, do not apply it twice.
- P2: durable excluded/retired receipts, replay suppression and changed-source/deadline reentry. Keep the minimal receipts when pruning bulky data.
- P3: page-scoped product summaries and RLS invoker behavior. The earlier 27.9 ms benchmark is historical, not a current universal latency guarantee.
- Worker v27 already batches short jobs. Do not introduce a second unbounded batch loop.
- Last cleanup recovered about 21.9 MB, removed old execution logs and verified archived job shells, and retained saved bids and recovery evidence.
- GEM/2026/B/8278976 is founder-confirmed medicine. Official product extraction remains unverified; SCH labels are not product names.
- Preserve standalone RA exclusion versus ordinary Bid-to-RA eligibility, the configured Q2 mask/glove policy, and conservative handling of mixed/unknown item manifests.
- Preserve source hashes, evidence, event history and extension recovery. Do not replace exact specifications with an ATC pointer or invent YES claims.

## Normal operation: zero recurring LLM calls
Use existing Supabase/PostgreSQL schedules and version-controlled worker code for retrieval, pagination, hashes, change detection, deduplication, classification by known rules, queueing, retries, lifecycle updates, cleanup and health metrics. ChatGPT being closed must not stop these jobs.

Use content hashes and shared parsed-source caches; fetch changed documents and retry due failures only. Keep large source bytes outside hot relational rows under a bounded, verified archive policy. Retain compact evidence and receipts required for recovery and reentry checks.

Do not add a recurring ChatGPT task, Make scenario, paid model bridge or continuous ChatGPT/Gemini conversation to operate the scraper. The existing council decision is no Make and no paid AI middleware.

Demand-driven legal interpretation, ambiguous OCR/extraction, OEM matching and drafting can still require model usage. Gemini API usage has its own token/rate limits. A zero-LLM daily pipeline is the target; unlimited free AI or unlimited free hosting is not promised.

## Exact implementation order and acceptance gates

### 1. One controlled code and release path
Owner: ChatGPT implementation; Gemini independent review.
- Maintain this plan plus CURRENT_STATE, PHASE_STATUS, NEXT_ACTIONS and Issue #8.
- Work from current main, compare actual installed SQL/worker code with Git history, and avoid changes from competing chats to the same object.
- Finish a permanent authorized deployment path for the existing Netlify site. Prefer linking its Git repository; the current connected Netlify operations cannot configure or publish that path.
- After release, verify actual live revision, public API and mobile bid workflow. A successful CI or merge is not publication.
Gate: live manifest identifies the exact approved source revision; rollback is available.

### 2. Safe storage lifecycle before enabling expiry repair
Owner: backend implementation; Gemini concurrency review.
- Validate saved-bid protection on native PostgreSQL 17 with concurrent save/retire, lock timeout, retry and archive-failure cases.
- Preserve original lock ordering, unfinished-run links and archive receipt checks.
- Only then enable the already prepared stale day-2 scheduling/persistence repair.
- Recheck real official deadlines/extensions and preserve the existing three-day verification window.
- Archive, verify relationships/checksums and protected references, then retire eligible rows in bounded transactions.
- Test changed-source reentry. Audit archive object/reference dependencies before deleting storage objects.
Gate: saved bids survive races, extensions return to active, failed source checks cannot manufacture expiry proof, and physical/reusable space is measured.
Do not broadly delete expired rows or recurring VACUUM FULL tables.

### 3. Make discovery and document work converge
Owner: worker implementation; Gemini queue/capacity review.
- Measure arrival rate, true completion rate, oldest eligible age, urgent missing-spec age, source failures and full-lane cursor progress.
- Repair reconcile_sync_runs contention using exact live definitions and PostgreSQL concurrent tests. Successful cron dispatch must remain distinct from completed worker work.
- Preserve 360/day starts, source backoff and database guards while improving eligible-work selection and eliminating proven redundant work.
- Keep dedicated discovery and extension capacity; do not starve nonurgent bids.
- Optimize existing bounded batches and cached parses; do not duplicate batching or force manual extra starts.
- If measured necessary work exceeds the safe current budget after optimization, present the measured shortfall and options. Do not silently raise spending/quotas or claim complete hourly coverage.
Gate: representative new/changed generic-title healthcare bids are discovered; every lane advances within a declared window; queue age and backlog converge under measured load.

### 4. Official BOQ and exact specification acceptance
Owner: parser implementation; Gemini count-dimension review.
- Count expected official items independently of extracted rows. Category count, consignee count, total quantity and extracted-row count are different dimensions.
- Do not use GREATEST of structural counts unless they identify the same deduplicated item dimension.
- Fetch referenced ATC/specification content; an 'as per ATC' cell is not the specification.
- Reconcile names, units, quantities, complete buyer specs, source pages and current hashes.
- Prove the three controls: 8281503, 8278976 and 8184612, then a broader matrix including scanned PDFs, CSV, mixed goods, extensions and changed attachments.
- Preserve four states: Complete N/N, Partial K/N, Extracted K/?, Unverified 0/N or 0/?. Unknown N stays unknown.
Gate: complete official count and all full specifications are independently supported; only Complete can pass final compliance sign-off. Drafts may remain available.

### 5. Unattended outcome monitoring
Owner: existing health/cron integration.
- Extend the current health path rather than adding duplicate schedulers.
- Track full sweeps separately from head-page/subset ticks; measure a queue run's actual terminal outcome.
- Alert on stale source contact, overdue coverage, growing oldest queue age, incomplete urgent BOQs, repeated failures/deadlocks, storage growth and live/source revision mismatch.
- Use bounded retries and observable failed states; no auto-editing SQL or auto-publishing arbitrary AI changes.
- Keep existing optional email/WhatsApp delivery disabled until a delivery route is explicitly configured/authorized. Database alerts alone are not delivered notifications.
Gate: demonstrate a simulated missed run/failure, recorded detection, permitted delivery when configured, and recovery while ChatGPT is closed.

### 6. Complete Phase 1, then bidder features
Gate: new bid -> single stored identity -> official documents and verified rows -> website; extension -> history event -> active resurfacing; changed document invalidates stale proof; temporary failure recovers; saved data survives retention; schedules and coverage pass an observed multiday run including at least one cleanup cycle.

Only after this gate prioritize four simple bidder workflows: exact OEM/product matches; verified OEM contacts and document requests; participant-letterhead compliance/ATC documents; evidence-based clarifications/representations. Existing useful UI can remain, but cannot mask missing source data.

## Gemini coordination and decision record
The shared meeting room is https://github.com/affvare-coder/Tenderscope/issues/8.
Read the latest main and PR #13 before reviewing. Recorded Gemini reviews from 17 Nov and founder-relayed 18 Nov are incorporated; this document has not received a new Gemini sign-off. No direct automatic model-to-model connection was found.

Review requested from Gemini:
1. Confirm objective/priority order and no recurring model bridge.
2. Resolve official item-count semantic dimensions in PR #13.
3. Review native PostgreSQL saved-bid/retirement concurrency plan.
4. Review sustainable queue completion under the existing budget and source limits.
5. Verify live exact-revision release once the existing-site deployment path works.

Council responses must name the exact commit, evidence, disagreement and next task. Model agreement is not production acceptance or authorization. Product scope is frozen to Phase 1 reliability until evidence closes these gates.

## Confirmed work in this consolidation
Read original execution contract, DB editor/council records, current main/PR status, private engineering and cleanup bundles; rechecked live database/schedules and Netlify; created this unified plan and review handoff. No production SQL, worker, credentials, purge, subscription, new schedule or deployment is changed by this documentation step.
