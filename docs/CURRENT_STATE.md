# Current state — 28 September 2026

Production: https://tenderscope-healthcare.netlify.app/

The timeout/false-zero incident is repaired. The website uses a server-filtered feed of 40 bids per page. Errors display an unavailable state; a matching saved page may be shown with its actual freshness warning. Logo and the owner’s WhatsApp follow link are live. Internal sync panels and export controls have been removed. This release replaces raw activity snapshots with at most six concise recent changes, collapsed by default. Full source history is retained.

The owner’s current cadence supersedes the original contract: one daily scraping start at 01:00 IST, bounded resumable work, and hourly screen refresh. No new hourly/deep sweeps are scheduled; earlier unfinished sweeps retain their progress. Source collection has daily invocation and database-size guards.

Expired bids receive extension checks after day 1 and day 2. On day 3, removal requires confirmed unchanged deadlines and a verified private archive. A failed or missing source response never authorizes deletion. Old excluded/succeeded payloads are archived and compacted. Earlier code and database history remain recoverable.

At 03:34 UTC (09:04 IST): the public feed returned 694 active opportunities and 109 extended bids; duplicate bid identities: zero. Database size was 309,144,723 bytes. Previous compaction reduced it from 427,895,955 to 286,777,871 bytes; subsequent normal collection increased it. Counts and size are observations, not permanent values.

GEM/2026/B/7945801 retains the 1 October 2026, 15:00 IST closing time and its previous deadline. Its PDF, ATC and BOQ/specification URLs were successfully rechecked at 04:20 IST on 27 September by the independent source worker.

Validation: 63 backend tests, 14 frontend tests, production build, retention acceptance, page-wise feed and live extension checks. Full Phase 1 remains open. Current discovery completed 125/2,014 daily lanes, 443/1,914 deep lanes and 73/82 old hourly lanes; retries and document dependencies remain. The daily source budget has paused collection until the next IST day. Do not describe this as exhaustive GeM coverage.

WhatsApp follow is available. Automatic publishing and phone sign-in require configured providers; no message delivery is claimed. Detailed backend source, restoration steps and immutable audit records remain in the private recovery checkpoint, outside the public repository.

## 28 September continuation

At 01:05 UTC (06:35 IST), the public feed returned 753 active opportunities and 123 extended bids; database size was 322,120,851 bytes. Today’s independent source processing was running within its daily budget. Source collection resumes automatically after each IST-day budget reset; the complete new daily sweep is scheduled at 01:00 IST. Full coverage remains pending.

The concise activity release is live and was checked on the owner-reported bid. The previous frontend commit is protected by recovery/before-20260927-activity-cleanup. Sync worker v14 also preserves verified PDF conditions and buyer information across overlapping listing observations, and allows a known non-Q2 bid to receive PDF enrichment when that PDF omits its quadrant. New unknown-quadrant bids still require verification.
