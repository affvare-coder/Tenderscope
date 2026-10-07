# Current state — 7 October 2026

Production: https://tenderscope-healthcare.netlify.app/

## Verified at 06:36 IST
The production website visibly loaded 580 active opportunities and 16 eligible publications from the rolling last 24 hours. The backend returned 88 published within 96 hours, 95 extended bids and 69 dental bids. Duplicate bid numbers remain zero. Checks found zero expired, extended or out-of-window rows in the tested publication pages, and zero unextended rows in the tested Extended page. Public expired/watch count is zero. The 40-row page cap remains.

The prior 23:02 IST observation was 529 active opportunities. The new daily cycle is updating data; this increase is a net feed change, not a claim that every additional active bid was newly published today. Full coverage is not yet complete.

## Active backend and prepared frontend
Worker v17 is active. Dental photographic-equipment wording and verified services-only classification repairs remain live. Recovered GEM/2026/B/8029161 remains an older publication and is kept out of the 24/96-hour publication tabs. Existing bid-to-RA goods are retained; standalone RA and Q2 remain excluded.

The 24/96-hour publication RPC rules are live. Tested frontend source includes the 96-hour tab, correct publication wording, expired-cache filtering and quick-app freshness repair. Functional source commit 362e3cbc8db0e64ae14991edd7918e83f3fd9899 remains protected. Netlify publication remains blocked by account sign-in; the current deployment is still 6ab88f9acbfca067189970d8. A secure sign-in attempt timed out and fresh target-page verification still showed Log in. The current visible UI consequently retains first-seen wording and does not yet expose the 96-hour tab.

## Automation and free limits
The 7 October daily head replay is active while old pagination remains saved. At 06:36 IST the ongoing job had 282 daily head pages, 802/2,046 complete lanes and zero recorded coverage errors. Job statistics span its ongoing recovery run; they are not all today's publications. There are 7,276 queued and 6 partial document jobs.

Daily ingestion remains at 01:00 IST. The read-only 08:00 IST check is enabled. Old hourly/deep discovery and message senders remain disabled. The daily source allowance is 317/360 used with no manual reset. Database size is 425,790,611 bytes, below the 450,000,000-byte collection guard. Private verified archives total about 46.3 MB. Both infrastructure plans remain Free.

Private archives, member download identity and day-1/day-2 extension checks remain protected. Day-3 retirement requires successful checks and a verified private archive; failures or missing source listings do not authorize deletion. WhatsApp follow is live; message publishing is unconfigured.

Phase 0 is the only fully complete numbered phase. Phase 1 source/document acceptance and frontend publication remain open. Existing validation remains 75 backend tests, 20 frontend tests, build and SQL acceptance; today's live publication-window and duplicate checks pass. No exhaustive-coverage, message-delivery or outage-free guarantee is made.
