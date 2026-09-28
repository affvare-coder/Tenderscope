# Current state — 28 September 2026

Production: https://tenderscope-healthcare.netlify.app/

## Latest verification — 14:12 IST
The production feed returned HTTP 200 with 676 active opportunities and 97 extended bids. Database size at 14:11 IST was 324,209,811 bytes; duplicate bid numbers: zero. Counts change as deadlines pass. The feed loads 40 server-filtered rows per page and reports unavailable data separately from a genuine empty result.

The expiry maintenance failure has been repaired. A document referenced by a member download prevented retirement, stopping later cleanup scopes. Verified retirement now preserves the member usage row and original document identity with its private archive reference before clearing the live foreign key. All 12 existing download history records retained their original identity, member, kind, count and timestamp. A real worker run succeeded and archived 735 old job payloads, 1,000 excluded candidate payloads and two expired bids; protected retirements reached 259.

Maintenance now skips worker invocation when no eligible work exists. Small partial indexes target only unarchived payloads, and archive job lookups use UUID indexes. The source pump checks its spent daily allowance before database-size inspection. The existing day-1/day-2 source checks, day-3 archive-before-removal, 450 MB collection guard and 360 daily source-invocation cap remain enforced. Failed source checks do not authorize deletion.

## Free-plan operations
Netlify and Supabase were verified as Free on 28 September. No plan upgrade or paid feature was enabled. The Netlify email dated 27 September reported 75% of 300 credits used for the September 13–October 12 cycle; this is an email observation, not a live remaining balance. Production releases must be bundled. Backend data refreshes do not require a frontend deploy. Documentation-only Git commits use the supported skip-deploy marker.

## Phase status
Phase 0 is complete. Phase 1 remains open: source completion is 189/2,014 daily lanes, 539/1,914 older deep lanes and 73/82 older hourly lanes; 8,140 document jobs remain queued. Today's 360 source-invocation allowance was reached; durable progress resumes after the IST-day reset. The new daily discovery start remains 01:00 IST. No extra hourly/deep sweep is scheduled.

The website has the logo, WhatsApp follow link, hourly refresh and at most six concise recent changes, collapsed by default. GEM/2026/B/7945801 retains its verified 1 October 2026, 15:00 IST deadline and Bid to RA Yes. Automatic WhatsApp publishing and phone authentication delivery require configured providers; delivery is not claimed.

Validation: 63 backend tests, existing protected-retention acceptance and the new download-history retirement regression passed. Latest frontend validation remains 14 tests and the production build. The functional frontend release is unchanged; source/configuration recovery points and archived bid data are preserved. Full coverage, broad document freshness and remaining classification review are still acceptance gates.
