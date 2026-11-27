# Current state — 27 November 2026, 21:54 IST

## Website optimisation

- **Live database change.** [PR #31](https://github.com/affvare-coder/Tenderscope/pull/31) merged at `b3909b8bdd054ee9abefd17e5fe8bc63179a51f6` and applied to Project A as migration `20261127161717`. The public feed evaluates each candidate's current buyer evidence once per eligibility search. Seven same-snapshot result comparisons matched. Combined RA and evaluation read 15,179 shared buffer blocks, down from 35,258. Home feed, medicine search, combined eligibility and closed-bid requests returned HTTP 200 through Netlify. End-to-end mobile performance remains to be measured.
- **Built, awaiting founder approval.** [PR #29](https://github.com/affvare-coder/Tenderscope/pull/29) merged at `8354c6ce37c36eb978ee66566a85f8612b6e618c`. It defers 2,231,734 decoded bytes of document-tool JavaScript until requested and aborts replaced feed requests. The 128-test suite, CI, exact-SHA build and ZIP checks passed. ZIP SHA-256 `46d73f12505bdff3485b9f769167b768780f6be4d48d6536e07c88614dc85620`. Netlify still serves `600232ffd37617969d045f81d73edfccce83fe33`. The cloud preview could not load the local release. After exact-SHA approval, publish through the existing production workflow and check the served SHA and user paths.

## Project B result handoff

- **Hosted canary verified.** [PR #30](https://github.com/affvare-coder/Tenderscope/pull/30) merged at `072925354eeb29d5b02f50494946b5de58c66a22` and applied to A as migration `20261127161723`. Private service-only receipts bind results to the current tender revision, manifest, CSV hash and lease generation. Application and receipt commit in one transaction. Local acceptance covered stale evidence, hash mismatch, rollback, replay and member access.
- Hosted B fetched and parsed the official CSV for GEM/2026/B/8313977. A rejected the obsolete ticket, accepted the current seven-row result with canonical write status `UNCHANGED` and acknowledged the replay as `already_accepted`. B retained the digest and cleared the delivered payload. This was an operator-driven canary. Automatic dispatch and result transport, bounded hosted throughput and broader whole-bid certification remain pending. Preserve PR #22's acceptance gates and the existing A scheduler.
- A `agdmlgbfxoqhztiormij` remains the canonical publisher and authentication authority with sync worker v37. At 21:54 IST A held **473,173,139 database bytes**, leaving **11,826,861 bytes** before its unchanged 485,000,000-byte guard. Six saved bids remained present at the post-change check. B `xwxexchtbviiyxcmuvnn` held **11,340,947 database bytes**. The largest A relations were `sync_candidates` at 110,149,632 bytes and `sync_jobs` at 78,217,216 bytes. Keep dependent archive copies until their references are resolved.

## Project B reuse verified

- The founder selected the former Historical Archive `xwxexchtbviiyxcmuvnn` as Project B. Supabase restored this project in Mumbai on the Free plan. Before provisioning, its live database had zero application tables, public application routines, customer accounts, Storage buckets, Storage objects, Vault secrets, or scheduling extensions. The verified prior export contained only Supabase migration history. The pending project deletion was canceled.
- The earlier trial project `noeobaiuzhywneddekpn` is paused as a rollback option. A `agdmlgbfxoqhztiormij` and the restored B `xwxexchtbviiyxcmuvnn` were the two healthy active projects.
- Restored B uses BOQ runner v1 digest `7dc1a26865c29c81081b9572a8e5953bdc788dfc3c021e4ac83b790c6f51b6db`, with its invocation token and runner URL bound locally. B applied migrations `20261126183707`, `20261126183709` and `20261126183717`. The binding change merged in [PR #28](https://github.com/affvare-coder/Tenderscope/pull/28) at `0d61a042d879d5b460d57dc281e6affb057e6d11`. CI and local binding tests passed.
- B used **11,259,027 database bytes** with zero customer accounts and Storage objects. Three authenticated hosted runs matched A's source hash, revision and all 61 CSV rows for GEM/2026/B/8308373, 8313971 and 8315522. Anonymous and member roles lack engine queue and result access.

## Capacity controls and next gate

- Scheduled retirement and the stale GeM confirmation repair are live. Seven expired bids were retired in the 26 November verification window. The scan found 388 older unsaved bids needing current evidence checks. A guard protects saved bids and current tender evidence.
- Authenticated maintenance removed 142 detached candidate archive objects, totaling 1,595,521 file bytes. Their absence and receipts were verified. Nightly detached-file cleanup runs at 00:47 IST. A's capacity migrations were `20261126134443`, `20261126134446`, `20261126160321`, `20261126160347`, `20261126160501`, `20261126161450` and `20261126161451`. Maintenance v3 digest is `88a7d58b62261a661b3ee75a3f2fceb9fa3d58945d08c1b7141657ae52a29b28`.
- Prior archive export SHA-256 values are `d35261623371c74e001858b97b0cd31396e8207b809bb06888e4850ab776b484` for the database and `8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85` for Storage. The 240 provider migration rows restored locally with matching checksums.

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
