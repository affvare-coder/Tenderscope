# Current state — 26 November 2026, 21:50 IST

## Verified capacity work

- Production A measured **465,955,987 database bytes**, with **19,044,013 bytes** before the 485,000,000-byte ingestion guard. Dropping two unused non-constraint indexes took the measured size from 468,290,707 to 465,824,915 bytes at release.
- Scheduled retirement removed seven confirmed old bids from A after the expiry repair. The latest snapshot counted 1,184 published open bids, six saved bids and one fully certified BOQ. A public feed smoke test returned HTTP 200. The remaining old unsaved cohort had 388 bids pending the applicable evidence checks.
- The authenticated maintenance worker removed **142 detached candidate files**, totaling **1,595,521 file bytes**. Every absence was confirmed from Storage metadata. The next batch was idle and a separate query found zero of those files still present. Hash receipts remain available for audit. Nightly detached-file cleanup runs at 00:47 IST. The expiry worker reserves one stale-proof renewal after the first ordinary check in each multi-check slice.
- Mumbai Project B `noeobaiuzhywneddekpn` is healthy on Free and measured **11,458,227 database bytes**. It fetched the official CSVs for GEM/2026/B/8308373, 8313971 and 8315522. All 61 extracted rows, source hashes and document revisions matched A. B holds zero customer accounts. Anonymous and authenticated member roles failed the engine-access check.
- B's BOQ runner version 1 digest is `7dc1a26865c29c81081b9572a8e5953bdc788dfc3c021e4ac83b790c6f51b6db`. B migrations are `20261126160518` and `20261126160520`. Source comparison was a shadow acceptance run. Canonical publication continues in A.

## Release and next work

- Capacity code merged through `37fcf98b5caca6cfb0a3a5ddbc190e8ad4f1aebe`. CI passed for [expiry and repeat writes](https://github.com/affvare-coder/Tenderscope/pull/24), [capacity and archive cleanup](https://github.com/affvare-coder/Tenderscope/pull/25), [B intake and runner](https://github.com/affvare-coder/Tenderscope/pull/26) and [cleanup throughput](https://github.com/affvare-coder/Tenderscope/pull/27).
- A applied `20261126134443`, `20261126134446`, `20261126160321`, `20261126160347`, `20261126160501`, `20261126161450` and `20261126161451`. Maintenance v3 digest is `88a7d58b62261a661b3ee75a3f2fceb9fa3d58945d08c1b7141657ae52a29b28`. Netlify serves `600232ffd37617969d045f81d73edfccce83fe33` and the canonical sync worker is v37.
- **Pending** — implement A's fenced work dispatch and transactional result acceptance before transferring production workload to B. Retain the existing whole-bid certification and hosted throughput gates in PR #22. Compare sustained A database allocation after the scheduled expiry and vacuum cycles.
- **Awaiting final confirmation** — downloaded the paused Historical Archive `xwxexchtbviiyxcmuvnn` database and Storage backups without resuming it. The dump had no application schema or business data, 35 empty tables and 240 provider migration rows. All 240 rows restored locally with matching content checksums. Storage was empty. An encrypted working copy decrypted to the exact source hashes. The deletion dialog identifies only the old archive ref. Archive copies in A with active dependencies require resolution before deletion.
- Historical export SHA-256 values were `d35261623371c74e001858b97b0cd31396e8207b809bb06888e4850ab776b484` for the database and `8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85` for Storage.

---

# Current state — 18 November 2026, 22:02 IST

Phase 1 remains incomplete. Canonical consolidation and exact next gates: [autonomous execution plan](AUTONOMOUS_EXECUTION_PLAN_2026_11_18.md).

- Main: dbbbadaeb9de90c861e39e6a8dfbb0bc31be0c2d; PR #11 merged at 07:19:50 IST. Netlify still publishes November 10 deploy 6af276da5b343c9c34b7da61. Merge is not deployment.
- Database: 394,349,715 bytes. 569 open published bids, 127 with current product rows. These are not completeness counts.
- About 10,250 queued document jobs. Existing hourly heads, four-hour rotating reconciliation, daily audit and bounded worker are active; full coverage is not proven. Health is degraded; two recent reconcile_sync_runs deadlocks need concurrent verification.
- Daily 00:20 IST history pruning is active. Saved-bid safety and stale expiry proofs still block the complete expired-bid purge.
- PR #13 remains Draft: official expected item count and complete specifications are not proven for the three real-bid controls.
- No Make, paid model bridge, duplicate site or recurring LLM scheduler. Existing infrastructure continues while ChatGPT is closed.
- Gemini's recorded reviews are incorporated; new review of this consolidation is requested, not claimed complete.

The prior state below is retained as history and must not override this dated baseline.

---

# Current state — 1 November 2026

Production is https://tenderscope-healthcare.netlify.app/. Netlify published deploy `6af276da5b343c9c34b7da61` on 10 November 2026 at 07:14 IST. All 64 frontend tests and static ZIP validation passed before publication. Production checks confirmed bid cards and the sync health endpoint, plus the Ask AI snapshot, item-wise compliance editor and buyer ATC/annexure workflow on GEM/2026/B/8218595. Member-account document export and two-account isolation remain to be checked in production. Scanned annexures still require manual mapping and review.

The live health snapshot showed verified product rows on 94 of 559 open published bids and 9,345 pending document jobs. The release surfaces those gaps. The 1 November records below describe earlier states.

## Live repairs

The 485,000,000-byte guard paused ingestion at 486,788,243 bytes. VACUUM FULL ANALYZE of public.sync_candidates recovered about 23 MB without removing records. The ordinary bounded queue resumed; quota and budget limits were retained. Latest observed database size was about 465 MB; headroom is limited and this is not a permanent capacity solution. Five publications within the last 24 hours were recovered by 11:52 IST, including GEM/2026/B/8208535. Coverage is still incomplete; the document queue is approximately 9,157 jobs. Thirty-eight existing open-bid BOQ jobs were prioritised without duplicating jobs or resetting budgets.

The deployed worker update adds an explicit GeM Item Name/Quantity CSV variant and conservative positional PDF table parsing with source page keys. Current-hash verification remains mandatory. Scans, unsupported table layouts and wrapped ambiguous rows are not represented as verified product lists. The historical parser only extracted one CSV format; only four of 487 open stored bids initially had product rows. Later fixture or unit acceptance is not proof that all production PDFs have been parsed.

## Prepared frontend

Reuses the pending 24 October commercial frontend rather than discarding its account/draft safeguards. Ask AI opens bid intelligence and a document studio. Item-wise offers use verified source rows, editable OEM/product/pack, response and evidence. Responses start NEEDS REVIEW. Deterministic DOCX and PDF exports include participant letterhead/signature/stamp images. Profile text is private under per-account RLS; images, ATCs and draft offers remain in memory and clear on account change. Source document changes invalidate offers and mappings.

ATC PDFs retain original page geometry/content; standard text fields receive conservative participant bindings. Flat PDFs use visual point-and-fill mapping and explicit annexure-page selection. A filled preview and review confirmation precede download. This is not autonomous exact reconstruction of every scanned ATC, and scanned annexures still require mapping. No LLM provider has been wired into TenderScope; source analysis still opens ChatGPT with official links. Automatic OEM choices, automatic Yes claims, a secure persisted image vault, multi-company team roles and ZIP packs remain open.

## Verification

124 backend tests and 43 frontend tests pass, including deterministic document exports, page preservation, stale-source exclusion, missing values, overflow, and PDF field flattening. Build and public ZIP validation pass. Preview UI was checked against the live public database: recovered new bid, missing-products state, studio tabs and a 93-row parsed BOQ. Full signed-in browser export and two-account user journeys have not yet been completed. Database RLS blocked cross-account update in a rolled-back acceptance check. No subscriber alert or WhatsApp message was sent.


## Follow-up recovery — 1 November, 16:26 IST

Live database had grown back to 483,986,579 bytes after ingestion resumed. Physical compaction of sync_candidates, sync_jobs, tender_versions and tender_events reduced it to 412,224,659 bytes. The verified post-maintenance snapshot retained 1,007 tenders, 5,567 versions, 7,507 events and 155,388 candidate rows. Source checks continued through 10:56 UTC. Eleven bids published within 24 hours were present in the preceding snapshot. Nightly compaction is now scheduled at 00:40 IST using pg_cron, before the existing 01:00 IST discovery run. No guard threshold, worker budget, WhatsApp delivery or source request limits were changed. This reclaims retention bloat; unbounded long-term candidate growth remains a capacity consideration.

Netlify API still reports the 8 October frontend deployment. A fresh dashboard tab still shows Log in. Prior secure sign-in request timed out; its runtime was reset. Publication of the prepared document studio remains blocked by browser authentication, not by missing user authorisation. Frontend tests were repeated: 43 passed. The public package SHA-256 is e6dcc76a4d743c56b91db40bb1440375da86597fca9db25da746068e9052a3a3.


## Open-bid BOQ fairness repair — 1 November

Only five of 599 open stored bids had verified product rows at the continuation check. The queue now reserves its first document slot for a due open-bid CSV/BOQ lacking current-hash product rows. New publication heads, discovery/expiry turns, the reserved location slot and oldest-job recovery retain their existing ordering. No daily call counter, budget or quota was reset. A database claim test selected an actual queued BOQ under the reserved-slot state and rolled back its fixture. An initial attempt could not complete because the worker was busy; the retry passed. All 124 backend tests still pass. Full product/specification acceptance and Netlify publication remain incomplete.
