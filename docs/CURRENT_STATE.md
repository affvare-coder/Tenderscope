# Current state — 1 November 2026

Production remains https://tenderscope-healthcare.netlify.app/. Frontend publication is pending authenticated Netlify dashboard access; the dashboard currently shows Log in. Do not report the document studio as live until its matching deployment is verified.

## Live repairs

The 485,000,000-byte guard paused ingestion at 486,788,243 bytes. VACUUM FULL ANALYZE of public.sync_candidates recovered about 23 MB without removing records. The ordinary bounded queue resumed; quota and budget limits were retained. Latest observed database size was about 465 MB; headroom is limited and this is not a permanent capacity solution. Five publications within the last 24 hours were recovered by 11:52 IST, including GEM/2026/B/8208535. Coverage is still incomplete; the document queue is approximately 9,157 jobs. Thirty-eight existing open-bid BOQ jobs were prioritised without duplicating jobs or resetting budgets.

The deployed worker update adds an explicit GeM Item Name/Quantity CSV variant and conservative positional PDF table parsing with source page keys. Current-hash verification remains mandatory. Scans, unsupported table layouts and wrapped ambiguous rows are not represented as verified product lists. The historical parser only extracted one CSV format; only four of 487 open stored bids initially had product rows. Later fixture or unit acceptance is not proof that all production PDFs have been parsed.

## Prepared frontend

Reuses the pending 24 October commercial frontend rather than discarding its account/draft safeguards. Ask AI opens bid intelligence and a document studio. Item-wise offers use verified source rows, editable OEM/product/pack, response and evidence. Responses start NEEDS REVIEW. Deterministic DOCX and PDF exports include participant letterhead/signature/stamp images. Profile text is private under per-account RLS; images, ATCs and draft offers remain in memory and clear on account change. Source document changes invalidate offers and mappings.

ATC PDFs retain original page geometry/content; standard text fields receive conservative participant bindings. Flat PDFs use visual point-and-fill mapping and explicit annexure-page selection. A filled preview and review confirmation precede download. This is not autonomous exact reconstruction of every scanned ATC, and scanned annexures still require mapping. No LLM provider has been wired into TenderScope; source analysis still opens ChatGPT with official links. Automatic OEM choices, automatic Yes claims, a secure persisted image vault, multi-company team roles and ZIP packs remain open.

## Verification

124 backend tests and 43 frontend tests pass, including deterministic document exports, page preservation, stale-source exclusion, missing values, overflow, and PDF field flattening. Build and public ZIP validation pass. Preview UI was checked against the live public database: recovered new bid, missing-products state, studio tabs and a 93-row parsed BOQ. Full signed-in browser export and two-account user journeys have not yet been completed. Database RLS blocked cross-account update in a rolled-back acceptance check. No subscriber alert or WhatsApp message was sent.
