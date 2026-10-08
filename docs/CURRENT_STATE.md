# Current state — 8 October 2026

Production: https://tenderscope-healthcare.netlify.app/

## Published frontend and live checks
Netlify production deployment 6ac70254143c294f4992bd72 is published.
The live site now exposes Published · 24 hours and Published · 96 hours.
At 08:05 IST the feed returned 584 active bids, 24 within the rolling
24-hour publication window, 86 within 96 hours, 103 extended bids,
68 dental bids and 3 Delhi entries. These are feed counts at that time,
not an exhaustive count of all GeM publications.

Live browser checks covered both publication tabs, two disjoint 40-row
96-hour pages, Extended (40 displayed rows all marked extended), and
Delhi (3 entries, including mixed-location bids). SQL checks found zero
invalid rows in the tested publication/Extended pages, zero expired/watch
rows and zero duplicate bid numbers. The 40-row page cap remains.
An official bid link and its explicit unverified document state were
checked; member sign-in and a completed PDF download were not exercised.

The release preserves functional commit 362e3cbc8db0e64ae14991edd7918e83f3fd9899,
API proxy redirects and headers. The static upload package disables a second
build and serves its built files at the root. Public files contain no private
backend source or private recovery material.

## Backend and remaining acceptance
Worker v18 and the verified PDF consignee-location writer are deployed.
Previous validation passed 79 backend and 20 frontend tests, build and SQL
acceptance. Today's actual production location backfill is not complete:
555 live locations remain UNKNOWN and 40 prioritized parser-upgrade jobs
are still queued. There are 7,241 queued and 6 partial document jobs.

The ongoing discovery job reports 620 fresh head pages for 8 October and
781/2,046 saved completed lanes, with zero recorded coverage errors.
Cumulative job statistics span the recovery run; they are not all today's
newly published bids. Full source/document/location acceptance remains open.

## Schedule, limits and protected history
Daily ingestion remains at 01:00 IST; the read-only 08:00 IST check remains
enabled. The bounded queue pump is enabled; legacy hourly/deep discovery
and message senders remain disabled. Today's source allowance is 360/360.
No allowance reset or unbounded wake was performed. Database size at
08:05 IST is 428,960,915 bytes, below the 450,000,000-byte guard.

The infrastructure remains on Free plans. Verified private archives,
member download identity, original dates, source histories and saved
cursors remain protected. Day-1/day-2 checks and a verified private archive
remain prerequisites for guarded retirement.

WhatsApp follow is visible. No authorized WhatsApp business sender
connection was found; phone alerts and channel publishing are unconfigured.
No alert was sent. Phase 0 remains the only fully complete numbered phase.
Phase 1 acceptance and phases 2–8 remain open.
