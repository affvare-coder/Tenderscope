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
