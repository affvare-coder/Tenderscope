# Current state — 6 October 2026

Production: https://tenderscope-healthcare.netlify.app/

## Verified at 21:52 IST
The live public RPC returned 530 active bids, 1 bid published in the last 24 hours, 73 published in the last 96 hours, 68 extended bids and 67 dental bids. These are rolling publication windows, not discovery timestamps. Extended bids use their dedicated section. Expired bids are excluded from every public view. Counts change as deadlines pass or new records are verified. The feed uses 40-row server-filtered pages; duplicate bid numbers: zero.

## Discovery and publication repairs
The publication rules are deployed. The 96-hour tab and revised 24-hour wording are implemented and tested in frontend source, together with the quick-app freshness repair. Frontend publication is pending Netlify authentication; the latest verified production deployment remains 6ab88f9acbfca067189970d8. Do not claim the new tab is visible until deployment and browser verification complete.

Worker v16 is active. It prioritizes due active-search continuations while preserving their saved page offsets and backoff. Missing live main-bid PDF verification precedes repeated checks of known bids, with fairness for older work retained. Dental and laboratory keywords were expanded without removing the previous bank. Newly recovered records include dental polishing paste, mouth mirrors, composites, cements and implant motors. Recovery does not prove complete coverage.

Daily discovery remains at 01:00 IST. A read-only daily bid and scraping-health check is enabled for 08:00 IST, beginning 7 October. It checks publication windows, source progress, unresolved verification and resource limits; it does not launch duplicate scraping or reactivate paused legacy tasks.

## Free-plan limits and remaining acceptance
Both infrastructure plans remain Free. The live database was 424,021,139 bytes at 21:52 IST, below the 450,000,000-byte collection guard. Today's 360-source-invocation allowance is exhausted; saved work waits for the next allowed cycle. The last verified official source contact was 07:23 IST. Daily source progress was 765/2,046 complete lanes at 21:47 IST; 7,298 document jobs and 10 missing live dental candidates remained. Complete pagination and authoritative category/document verification are still required before claiming comprehensive coverage.

Private archives, history, member download identity and day-1/day-2 extension checks remain protected. Day-3 retirement requires successful checks and a verified archive. Failed source requests or absence from a listing do not authorize deletion.

One complete numbered phase: Phase 0. Phase 1 remains open. WhatsApp follow is live; channel publishing and phone delivery remain unconfigured. Validation: 72 backend tests, 20 frontend tests, frontend build, and rolled-back SQL acceptance for 24/96-hour windows and queue priority.
