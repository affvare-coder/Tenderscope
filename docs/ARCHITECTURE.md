# TenderScope architecture

## Frozen Phase 0 decision

Extend the existing `affvare-coder/Tenderscope` static frontend on Netlify and the existing Supabase project `agdmlgbfxoqhztiormij`. Keep existing tender IDs, public-access model, document records and premium tables. Do not create another website or database. Supabase PostgreSQL is the production source of truth; spreadsheets remain exports only.

## Runtime

GeM public discovery → resumable deterministic worker → transactional PostgreSQL ingestion → existing REST API → automatic frontend refresh.

Supabase Cron enqueues hourly, four-hour and daily work. A short queue pump invokes the authenticated Edge Function. Each invocation handles bounded work, checkpoints page/candidate cursors and releases its lease. Subsequent invocations continue; a finished page is not a finished run. Worker auth secrets stay in Supabase Vault and the hosted runtime. Ordinary recurring work makes zero model calls.

The worker uses official GeM public listing and Advanced Search sessions, with normal session cookies and CSRF tokens, explicit request limits and bounded retries. It never bypasses CAPTCHA, login, provider security controls or access restrictions. A blocked lane records failure and remains recoverable.

## Compatibility and history

`tenders` remains the canonical bids table. `tender_documents` and `tender_events` remain the canonical document/event tables. New version, item, sync-run, sync-job, sync-state and rule-version structures extend them. The repository's SQL is the schema source; table names are intentionally compatible with the existing frontend instead of duplicating the same bids in a second table.

Lifecycle is separate from existing publication status. A passed closing time moves to `CLOSED_PENDING_VERIFICATION`; it never proves expiry. A later official closing time updates the same identity, records the previous time and both closing-date-change and extension events, and restores ACTIVE. History is append-only. Partial source responses must not erase authoritative fields, and older observations must not replace newer ones.

## Discovery and rules

Independent keyword, exact BOQ, organisation and targeted bid lanes converge on one bid number. Preserve provenance, exclusion reasons and pending-verification candidates. Standalone reverse auctions are excluded; normal bids with Bid-to-RA Yes remain eligible. All Q2 bids are excluded under the user's latest explicit instruction. Optional healthcare exceptions remain configurable but disabled. Unknown classification is visibly pending, never silently treated as verified.

Only official buyer-published values are authoritative. EMD×30, OEM turnover÷1.5 and bidder turnover÷0.5 are configurable TenderScope planning signals, with uncertainty and divergence retained. These rules stay outside the published frontend bundle.

## Documents and security

Document identity, official URL, first/last checked time, content hash and availability are retained. Conditional retrieval avoids downloading unchanged documents when the source supports it; content hashes detect changes even at unchanged URLs. Failed retrieval does not imply removal. Complete verified inventories alone may establish removal.

Public views expose public tender metadata, documents, activity and sanitized sync health. Write RPCs and queues are service-only. RLS protects exposed tables; explicit grants avoid accidental Data API exposure. Secrets, queue cursors, source cookies, raw diagnostics and future tenant records stay private. Published build output contains only the frontend assets, never source/config/SQL.

Seller-private communication is outside public discovery: `SELLER_PRIVATE_UPDATE_CHANNEL_NOT_CONNECTED` until an authorized channel exists. Absence of that channel never means absence of a representation or reply.

## Future phases

The full specifications for eligibility, OEM/product/contact intelligence, price intelligence, company vault, deterministic bid packs, bid-scoped retrieval, reviewed communications and multi-tenant SaaS are preserved in `TENDERSCOPE_CONSTITUTION.md`. This execution does not implement substantial Phase 2+ work.

## Official implementation references

- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase API protection](https://supabase.com/docs/guides/api/securing-your-api)
- [GeM All Bids](https://bidplus.gem.gov.in/all-bids)
- [GeM Advanced Search](https://bidplus.gem.gov.in/advance-search)

Current Supabase changelog checked 2026-09-20: no applicable self-hosted migration; explicit grants are required for new Data API tables. Avoid reliance on deprecated client Node 20 support; source uses standard fetch/Web APIs.
