# Current state — 6 October 2026

Production: https://tenderscope-healthcare.netlify.app/

## Verified at 04:27 IST
The public feed returned 574 active opportunities, 102 newly discovered bids and 90 extended bids. The database has 111 first-seen records in the last 24 hours; the public newly discovered count applies active/non-Delhi eligibility. Counts change as records arrive or deadlines pass. Data is loading in 40-row server-filtered pages. Zero duplicate bid numbers were verified at 04:23 IST.

New published bids are reaching production. GEM/2026/B/8061112 (DENTAL MATERIALS, published 5 October, closing 20 October at 17:00 IST) and GEM/2026/B/8119934 (Procurement of Medical Equipment, published 5 October, closing 26 October at 20:00 IST) were rechecked against official GeM listings by the production worker. Both exact rechecks and a targeted two-page freshness-path verification completed with zero source errors. The dental bid was also found in the live website search.

## Repairs deployed
Worker v15 keeps the original listing comparison separate from PDF enrichment. This prevents enrichment itself from repeatedly marking an unchanged listing as changed. Normal PDF rechecks now use a 24-hour interval; observed deadline/content changes bypass it. Authoritative PDF buyer/department/Bid-to-RA facts survive unchanged listings.

If a broad daily run overlaps the next 01:00 IST start, its existing job receives a fresh active-keyword first-page pass. Old pagination, row cursors and source retries remain intact. Active keyword searches precede closed recovery on new runs. A locked finish check preserves a daily freshness request arriving while a worker completes. The fresh pass is not a claim of full pagination coverage.

Verified excluded-candidate archives now retain a fingerprint. Identical rediscovery updates freshness without restoring the large live payload; changed facts/classification/rules restore it for review. Automatic maintenance had already written 171 such compact records by 04:26 IST. Verified archive-before-removal, day-1/day-2 extension checks and day-3 eligibility rules remain enforced. Failed or absent source results do not authorize deletion. Protected retirements: 1,254.

## Free-plan status and remaining work
Both Netlify and Supabase were verified as Free. Main Supabase project is ACTIVE_HEALTHY. The separate Historical-Archive project is inactive; it is not the live feed database. No paid feature or frontend deploy was enabled for this data repair. The existing 360-source-invocation daily cap and 450,000,000-byte collection guard remain. Database size was 411,937,939 bytes at 04:26 IST; source calls 213/360. These controls stop excess collection rather than promise unlimited free storage.

One complete numbered phase: Phase 0. Full Phase 1 remains open. Daily source progress at 04:27 IST: 429/1,978 complete lanes, with saved backfill still running. Document queue at 04:26 IST: 7,394 pending jobs. Classification/source-failure review and provider-backed authentication/notification checks remain acceptance gates. WhatsApp follow is live; publishing remains disabled pending a configured authorized provider.

Validation: 70 backend tests; 17 frontend tests; frontend build; rolled-back SQL acceptance for daily head scheduling, concurrent finish, daily document refresh, compact rediscovery and protected retention. No new security-advisor category was introduced.

The separate quick-app source commit 8acd04b is preserved. Its service worker previously cached live API responses and its build omitted the manifest/worker files. These have been repaired and tested in source. They are prepared for a bundled frontend release; current production deploy remains 6ab88f9acbfca067189970d8. Do not claim that the new quick-app revision has been deployed.
