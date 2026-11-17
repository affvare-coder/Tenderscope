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
