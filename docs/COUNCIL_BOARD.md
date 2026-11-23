# TenderScope AI Council Board

Canonical conversation: [Issue #8](https://github.com/affvare-coder/Tenderscope/issues/8). This is a **public sanitized status log**; no secrets, bidder-private data, API keys or internal security details.

## Roles and working agreement
Founder: final objectives and production release approvals. ChatGPT: product/technical execution and evidence. Gemini: independent CTO review and live browser QA. Specialists: PM, developer and QA as reviewable GitHub tasks, not currently autonomous background agents.

**Architecture decision:** no Make.com and no paid API-based AI Council for now. A separate private Council site is **not deployed**; the public TenderScope website remains the only deployment target. Use Issue #8 comments for handoffs, and this file for concise decisions.

## Production snapshot (2026-11-17 17:39:43.579043+00, UTC)
| Metric | Verified value |
|---|---|
| Open published tenders | 556 |
| Open closing within 72h | 152 |
| Open without current items | 475 |
| Open with verified item summaries | 81 |
| Worker starts today | 348 / 360 |
| Database bytes | 408841363 |
| Archive receipts / legacy reconstructed | 19575 / 43 |
| GEM/2026/B/8281503 | Published, main PDF queued, attempts=0, current items=0, official documents available=0 |
| Netlify published deploy | `6af276da5b343c9c34b7da61` (Nov 10 manual drop) — **not updated** |
| GitHub build | `c85f64c` includes `02a074c` six-button Ask AI; GitHub Actions passed |

## Priority queue
- [ ] P0: Publish the **existing** Netlify site from verified GitHub build; do **not** create a second website; confirm 6 functional actions and API proxy on target bid.
- [x] P1: Deadline-first BOQ scheduler with two reserved slots, 72h urgency + retry backoff. **Already live**, snapshot committed only.
- [x] P2: Excluded candidate staging, receipts, deterministic 43-row legacy remediation and changed-source bypass. **Already live**, snapshot committed only.
- [x] P3: LATERAL page-scoped verified product summary, RLS invoker and source hashes. **Already live**, snapshot committed only.
- [ ] P4: Resolve verified BOQ throughput and specific bid 8281503 using paced worker with 360/day budget, 4-minute allowance, and 485 MB capacity stop; don't claim a job without a worker.
- [ ] QA: CTO verifies all six Ask AI functions, exact BOQ rows/specifications/quantities, official sources, current corrigenda and location verification.
- [ ] Council: CTO reviews SQL snapshots and posts `[COUNCIL]` evidence/recommendations.

**Critical distinction:** GitHub build success != Netlify publication. Await authorized deployment credential/linkage; live six-button rollout remains unverified.

## Execution update — 18 November 2026 IST

[#10](https://github.com/affvare-coder/Tenderscope/issues/10) tracks the current work. Real delegated specialists audited discovery and the live database, implemented the four-workflow studio, and performed an independent QA pass. These are task-scoped agents, not an unattended Council bridge; Gemini did not review this change.

Prepared on `improve/reliability-20261118`: four primary workflows with focused legacy prompts retained; honest incomplete-product and preview-error states; stale-summary race fix; exact specification line breaks; nontechnical source status; manual exact-SHA release and live revision verification. Local frontend suite: 87 passed. Browser preview on `GEM/2026/B/8281503` confirms the four primary choices and explicitly missing product details. Existing production still shows its older three-action UI.

New read-only evidence: 557 open bids, 85 with current items, 472 without, 10,120 queued document jobs at 00:31 IST. Actual worker v27 already batches short jobs; don't add a second batch loop. Existing reserved-query selection used current indexes in about 9ms.

A strong SCH-listing candidate `GEM/2026/B/8278976` exists in staging; its medicine content and identity as the founder's reported tender remain unverified. Private backend candidates address anonymous schedules and saved-bid retention, with separate review/testing requirements. No private backend source or production credentials are committed here. See [execution record](EXECUTION_2026_11_18.md) for acceptance limits.

No production SQL, purge, credentials change or deploy occurred. Founder approval is still required for production release; backend SQL also needs disposable PostgreSQL/concurrency acceptance.

Follow-up accuracy guard: anonymous SCH/Schedule labels are suppressed as product identities in cards, details and compliance validation. Stored source records remain for audited backend recovery. Final test count and exact revision are recorded in CI.


## Consolidation — 18 November 2026, 22:02 IST

The latest baseline and unified sequence are in [AUTONOMOUS_EXECUTION_PLAN_2026_11_18.md](AUTONOMOUS_EXECUTION_PLAN_2026_11_18.md). PR #11 is already merged; earlier pending-merge notes above are historical. Existing Netlify still serves the November 10 deploy. Live checks: 394.35 MB DB, 569 open published bids, 127 with current rows, approximately 10,250 queued document jobs. Existing hourly/four-hour jobs process subsets, not proven full sweeps. Retention protection, expiry proof refresh, source completeness and health deadlocks remain open. Preserve the no-Make/no-paid-council decision and zero recurring LLM goal. New Gemini review is requested; no new joint approval or deployment is claimed.

## 23 November 2026 · Production source verification

PRs #14 and #15 merged into main on 22 November. The previous public site served `7887d65`. At 00:41 IST on 23 November the feed reported 1,174 open bids, 255 closing in 72 hours, 12 published in 24 hours, and zero certified BOQs. Supabase occupied 442,444,947 bytes. The database guard applies at 485,000,000 bytes.

The scheduled source reviewer reads turnover, relaxation, RA and award-method cells with a page and quotation. It checks the CSV denominator independently of the product importer. In the single-category PDF path it also checks the official open listing, deadline, separate public corrigendum response, consignee quantity and technical parameters before proposing a certification. Other document layouts and unreadable source material remain pending. The existing worker budget is 360 starts per IST day. Source checks use existing invocations.

For GEM/2026/B/8048949 the official CSV SHA-256 begins `f7192142db96`. Separate CSV reads each found 16 rows. The linked buyer specification scan was unresolved. The bidder-facing change separates extracted rows from verified specifications and the official denominator. Release acceptance requires three independently checked scheduled certifications and the live rolling 24-hour result.

### 23 November 2026, 07:43 IST

The existing scheduled Edge worker v34 certified GEM/2026/B/8304822 at 01:32 IST on its first review. All nine independent CSV rows match the separate buyer specification PDF and the nine parent quantity/consignee entries. The publication-to-certification interval was 16 h 25 min. The public feed reported 1 verified BOQ, 1,200 open, 264 closing within 72 hours and 13 published within 24 hours. Rolling fresh BOQ readiness was 1/13. Bidder-specific technical offer readiness requires separate OEM and participant evidence. The database held 445,025,427 bytes.

GEM/2026/B/8254458 stayed partial. The worker found three wording conflicts across 21 schedule rows, including film dimensions. On the reported GEM/2026/B/8048949 case, the original CSV count and a visual check of the scanned two-page specification now support all 16 row mappings. Its full attachment review is still pending. This manual repair is excluded from the automatic QA count. Frontend release approval awaits three independent automatic passes.

### 23 November 2026, 08:05 IST

A rotating sample from the open GeM listings yielded 26 relevant bids. Twenty were visible on the site at the audit cutoff. The other six had reached staging. A narrow classification rule missed clinical terms in the title or listing item text. The refresh queue also left eligible recoveries waiting four days. Edge worker v37 recognizes the six clinical descriptions. Recoveries use the regular listing processor after a fresh GeM identity and open-deadline check. The scheduler now reserves an hourly turn for waiting listing rechecks. The first previously stalled job already finished. The clinical recovery job includes eleven staged records; public recovery of the six awaits a fresh feed check.

| Official listing sample | Bid suffixes (prefix GEM/2026/B/) |
|---|---|
| Visible at audit cutoff | 8302327, 8285232, 8305364, 8305081, 8305062, 8304382, 8304371, 8301511, 8300800, 8100802, 8287821, 8304231, 8301991, 8291967, 8304288, 8302725, 8300450, 8259618, 8301705, 8257984 |
| Staged, absent from the public feed | [8304616](https://bidplus.gem.gov.in/showbidDocument/10201263), [8302774](https://bidplus.gem.gov.in/showbidDocument/10199129), [8291566](https://bidplus.gem.gov.in/showbidDocument/10186142), [8283233](https://bidplus.gem.gov.in/showbidDocument/10176650), [8304522](https://bidplus.gem.gov.in/showbidDocument/10201157), [8302603](https://bidplus.gem.gov.in/showbidDocument/10198933) |

All three PR #13 seeds were listed as open by GeM and present in TenderScope. They are historical regression cases. A fresh source recheck of GEM/2026/B/8304765 compared seven PDF rows with the CSV and held row four for a wording difference. GEM/2026/B/8254458 still has three differences among 21 rows. For the automatic nine-row certification on GEM/2026/B/8304822, an independent CSV/PDF read reproduced all quantities, units and item descriptions. The bid detail page showed Complete, 9 of 9, and two distinct attachment types. The editable technical draft reached three rendered pages with nine rows. Each offer and photograph awaits evidence from the sample bidder.

The public release reported clean build 7887d65499525e78e1943b83acbfb91e6ae8f9c4, built 21 November at 23:01 IST. At 08:03 IST the running database used 445,566,099 bytes with 121 of 360 daily starts. Public counts were 1,200 open, 264 closing within 72h, one certified, and 1/13 certified among bids published in the rolling 24h. The live site still gives overly cautious text under the nine-row result. The candidate corrects this and explains the extracted count on incomplete bids. Its source-review paths have deployment digest 9a205b2d2c86ce4201c8ed2db3aa2bdeacca2bde4943daedbcdef118e6bcc129. Routine catalogue checks now receive an additional reserved turn in eight within the same worker budget.

The 01:00 IST daily and the four-hour reconciliation cron both fired. The active 19 November full sweep had scanned 15,329 listing records and reached lane 341; a current full-sweep completion is unconfirmed. Release sign-off still requires two additional independent automated positives and renewed verification of the live public results.
