# Current state — 21 September 2026

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
