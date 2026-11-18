# Three-bid real-data validation: Verified BOQ Completeness

**Date:** 18 November 2026, ~21:23 IST. **Mode:** read-only production Supabase audit plus attempted official GeM PDF retrieval. **Status:** PARTIAL ACCEPTANCE; not production-ready. Source PDF endpoints could not be fetched by the independent web reader, so official page/BOQ structural counts have **not** been validated.

## Evidence matrix

| GeM bid | Actual records (18 Nov) | Independent official N | Source-valid extracted rows | Fully verified item K | Safe UI now | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| [GEM/2026/B/8281503](https://bidplus.gem.gov.in/showbidDocument/10174619) — Conduct of Medical Camp | Exists in `public.tenders`. Main PDF `unverified`, no hash, no parse cache, `0` current items; description mentions transport and medicines; bulk quantity `1695` | **UNKNOWN**: source PDF not retrieved | 0 | 0 | **Unverified (0/?)** | Fetch the actual PDF, distinguish procurement item schedules from quantities/services, extract source count and technical scope. Do **not** assume `N=1` from bid title or header. |
| [GEM/2026/B/8278976](https://bidplus.gem.gov.in/showbidDocument/10171677) — BOQ ITEMS | Present as `pending_verification` in `sync_candidates`, **not** in `tenders`; listing shows `Sch 1` through `Sch 15` and a **truncated** trailing `Sch`; main PDF document job is `queued` without error | **UNKNOWN**: at least 15 labels visible, but truncated listing cannot establish final N | 0 | 0 | **Unverified (0/?)** | Preserve candidate and queued job; load entire official PDF/BOQ; identify healthcare context and all schedule names. Never treat as 2 schedules or exclude for generic title. |
| [GEM/2026/B/8184612](https://bidplus.gem.gov.in/showbidDocument/10062725) — Consumable Items for Dentistry | 189 current rows; all 189 joined to `available` BOQ CSV by official URL + SHA; 189 distinct `item_number` | **UNKNOWN**: raw CSV count not independently observed | 189 source-linked | **0** under proposed strict full-parameter rule | **Unverified (0/?)** with `189 extracted rows` shown separately | All 189 current `specification` values match 'As per the Specification attached in the ATC'; fetch entire ATC and full BOQ CSV, then compare item-by-item. Avoid `Complete` based on 189/189 hash linkage alone. |

## Structural counting and correctness rules requiring CTO sign-off

1. **Independent `N`**: Count raw **numbered** BOQ CSV line records before parsing/filtering, with source file URL, SHA, header mapping, parser version, and any repeated item-number/consignee rows recorded. Do not use `count(tender_items)`, total quantity, page count or the current product summary as expected N.
2. **PDF archetypes**: Capture complete original PDF category/schedule sections with pages. `GREATEST(category_count,technical_section_count,consignee_block_count)` is a **candidate upper bound, not automatically an official N**, unless each counter measures the same item/schedule dimension. Multiple consignees may relate to one item; a category can contain multiple schedules; a technical section can repeat.
3. **Contradictions**: If official BOQ and PDF structure disagree, or item dimensionality differs, set expected count `UNKNOWN/NEEDS_REVIEW`. Never choose a larger count by default and then claim verified completeness.
4. **Single item/service**: `N=1` only if the full official primary document explicitly identifies one bid item/schedule. Medicine lines embedded in an ATC or service deliverables require their own technical-scope completeness checks; bulk `Total Quantity` does not identify N.
5. **Strict K**: A source-hash match is provenance, not evidence that specification text was copied fully. Require non-anonymous item identity, valid quantity+unit, concrete full spec/pack parameters and separate exact-source comparison before counting K. 'As per ATC' without ATC extraction is a reference, not complete specification.
6. **Four UI states**: `Complete (N/N)`, `Partial (K/N)`, `Extracted (K verified, N unknown)` and `Unverified (K=0)`; always distinguish raw extracted rows from verified K. Only Complete may pass final compliance sign-off.

## Implementation / release controls

- Draft PR #13 now includes a four-state pure completeness evaluator, full-spec proof gate and deterministic tests. No Supabase migrations/DDL or Edge Functions deployed.
- The production schema does not yet carry independent expected-count or per-row full-specification proof. The initial implementation is **fail-closed** until reviewed worker extraction provides these fields.
- Database size at final read-only check: **416,099,475 bytes**, under the 420,000,000-byte warning threshold and 485,000,000-byte custom guard, leaving <4 MB before the early-warning threshold.
- **Acceptance verdict**: 3 real records checked; **0/3 independently verified N counts** because their source bytes were inaccessible through this review channel; **0/3 safe Complete**. The accepted outcome is that no bid is falsely promoted to Complete. A full official-source acceptance run and independent CTO review are required before making this live.
