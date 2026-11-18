# Reliability execution — 18 November 2026 IST

Task: [#10](https://github.com/affvare-coder/Tenderscope/issues/10). Council: [#8](https://github.com/affvare-coder/Tenderscope/issues/8).

## Verified baseline

Repository main `e64f027`; lightweight buildless JavaScript plus bundled document tools, not a React/Next.js application. Existing Netlify project remains `ef2a51b5-ca33-4ba5-8592-8eae11d03008`. Its published manual deployment is `6af276da5b343c9c34b7da61`; browser verification on the known target still showed the three old actions. Historical green CI is not evidence of production publication.

Read-only database audit at 00:31 IST: 557 published open bids, 85 with current verified item summaries and 472 lacking current items, 10,120 queued document jobs, database 408,849,555 bytes. These are timestamped operational observations, not coverage certification. No production database writes or deployment were performed in this work.

The bounded worker already drains up to eight lightweight jobs within a 40-second slice, stopping on CPU-heavy PDFs and failures. Its 360-start IST-day cap, pacing, leases and 485,000,000-byte stop remain. Main discovery is scheduled for 01:00 IST; hourly heads and four-hour reconciliation exist. The measured reserved-slot query completed in about 9ms with existing indexes. Another batch layer or speculative index is not justified by this audit.

## Frontend implementation

- Four primary tasks: matching OEMs; verified business contacts and email drafts; compliance and annexures; clarification and representation. Existing focused prompts remain collapsed and accessible.
- Links explicitly hand off to ChatGPT. No integrated LLM service, autonomous email sending, complete OEM catalogue or guaranteed annexure reconstruction is claimed.
- Anonymous SCH/Schedule labels are withheld from product previews and verified compliance rows; direct document-release verification also blocks them. This protects against already-stored placeholder rows while retaining source records for recovery.
- Missing products remain unverified. Current extracted rows are shown with a completeness caveat; source hashes and official-host checks remain mandatory. Buyer specification line breaks are preserved.
- Older summary requests cannot replace a newer refresh, including the same page. A failed product-preview request is distinguished from absence of extracted rows.
- Bidder-facing source status retains freshness and coverage gaps, without worker-budget or queue jargon. Future timestamps cannot falsely prove freshness.
- Release workflow is manual, requires the exact approved source SHA and explicit release acknowledgement, scopes the token to publication and fails when authorization is missing. The public `release.json` records source SHA, dirty status and build time; CI checks clean provenance and the live publish workflow verifies the deployed revision.

This manual workflow is an approval acknowledgement, not a cryptographic proof of who gave approval. Existing Git-connected Netlify automatic publication, if enabled separately in its dashboard, is outside this workflow's control.

## Discovery regressions and backend candidates

A strong staging candidate is `GEM/2026/B/8278976`, title BOQ ITEMS, listing items Sch 1, Sch 2 and further schedules, published 17 November 2026 17:31:30 IST, closing 7 December 15:00 IST. The official-listing staging record is pending verification and its main PDF has not been processed. It cannot yet be identified conclusively as the founder's medicine tender. Official main source: https://bidplus.gem.gov.in/showbidDocument/10171677 . The PDF could not be independently read during this audit.

Live classifier code can exclude anonymous SCH/Schedule labels before official document evidence is read. Live product extraction can also accept these labels as product names. A private candidate normalizes anonymous labels, keeps ambiguous listings pending, adds generic discovery lanes and withholds placeholder product rows. The PDF cache parser version must change so cached pre-fix extraction cannot bypass validation. Independent QA reproduced baseline failures; production rollout remains gated by complete candidate review and source-backed acceptance.

Existing current rows are not automatically invalidated by an extraction error. Any remediation of previously accepted placeholder rows needs exact evidence, preserved history and a separate approved bounded operation. Do not declare completeness after only changing a parser.

`GEM/2026/B/8281503` is CONDUCT OF MEDICAL CAMP, deadline 27 November 2026 10:00 IST. It is discovered, published and visible, but has zero current verified items and a queued main-PDF job with attempts zero. This is an extraction wait, not evidence that a service tender necessarily has a BOQ of medicines.

The deployed Q2 configuration has exceptions disabled. The requested masks/gloves exception must be reconciled with the versioned business rules before changing production. Broad healthcare recall, complete attachment extraction and reconciliation coverage remain unproven.

## Retention candidate and release limits

No saved or submitted member bid was deleted. The existing retirement predicate does not protect saved bids, although the saved row's note/stage survives FK nulling. A private, drift-guarded SQL candidate adds explicit saved-bid protection and serializes concurrent saves; it also corrects three overescaped CSV suffix expressions without changing queue behavior. No currently eligible saved bids were observed. Full PostgreSQL archive/concurrency tests are not available in this environment, so the SQL is not approved for production use.

RLS is disabled on a private receipt table, but actual schema/table grants deny anon and authenticated access; the generic 'fully exposed' advisory is not demonstrated by those grants. Defense-in-depth RLS needs a separate reviewed policy; no security change was auto-applied.

## Acceptance gates

- Frontend automated tests, build and package verification.
- Browser check of the four tasks and missing-product state on the real known bid in preview.
- Independent QA review of frontend, private backend candidate and release controls.
- Exact final SHA and clean release package in CI.
- Founder approval before merge/publication, production worker/SQL changes or irreversible deletion.
- Production verification after authorized publication, including revision and all four workflows.

Signed-in two-account browser exports, mobile browser acceptance, complete official source-to-row comparison and a recoverable archive restore remain open. No claim is made that these frontend changes resolve the extraction backlog.
