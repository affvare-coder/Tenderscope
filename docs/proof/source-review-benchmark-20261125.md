# Source review benchmark and live trace

25 November 2026 IST · Candidate based on PR #21 at `da9400874a3f98ec1be4356af7e898388bf7c7cb`

## Isolated benchmark

Run `node scripts/benchmark-source-review.mjs` from the repository root. Each cell used a fresh Node 24.22.3 process and replayed 60 synthetic bids through the source-review batch controller, independent CSV count, PDF text-layer cell comparison and BOQ completeness gate. The mock source returned a document in 2–4 ms, injected four first-attempt timeouts, and returned HTTP 429 above three simultaneous source reads. Every cell resolved the same 36 Complete, 12 Partial and 12 Unverified fixtures.

| Batch | Fetch cap | Complete/min | Attempt p50 / p95 (ms) | Cohort p50 / p95 (ms) | Turns | Retries | 429s | Duplicate claims | Peak RSS (MiB) | Projected starts for 1,144 | Projected decisions / 360 starts | Projected receipt bytes / 360 starts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 3,752 | 6.63 / 9.28 | 291.35 / 548.84 | 64 | 4 | 0 | 0 | 42.1 | 1,221 | 337 | 60,075 |
| 1 | 2 | 3,730.8 | 6.72 / 9.1 | 295.96 / 552.69 | 64 | 4 | 0 | 0 | 41.9 | 1,221 | 337 | 60,075 |
| 1 | 3 | 3,697.5 | 6.63 / 9.12 | 306.6 / 558.65 | 64 | 4 | 0 | 0 | 41.8 | 1,221 | 337 | 60,075 |
| 1 | 5 | 3,720.4 | 6.62 / 9.05 | 296.81 / 554.29 | 64 | 4 | 0 | 0 | 41.7 | 1,221 | 337 | 60,075 |
| 5 | 1 | 4,711.1 | 6.61 / 9.29 | 233.58 / 439.25 | 13 | 4 | 0 | 0 | 41.7 | 248 | 1,661 | 295,754 |
| 5 | 2 | 7,185.1 | 6 / 8.6 | 159.97 / 289.91 | 13 | 4 | 0 | 0 | 41.9 | 248 | 1,661 | 295,754 |
| 5 | 3 | 7,610.1 | 5.7 / 8.69 | 151.76 / 273.77 | 13 | 4 | 0 | 0 | 41.8 | 248 | 1,661 | 295,754 |
| 5 | 5 | 7,581.1 | 5.7 / 8.64 | 149.11 / 274.28 | 13 | 4 | 0 | 0 | 41.8 | 248 | 1,661 | 295,754 |
| 10 | 1 | 4,836.5 | 6.58 / 8.97 | 230.48 / 427.05 | 7 | 4 | 0 | 0 | 42.1 | 134 | 3,085 | 549,258 |
| 10 | 2 | 8,574.7 | 6.02 / 7.94 | 133.2 / 241.8 | 7 | 4 | 0 | 0 | 41.8 | 134 | 3,085 | 549,258 |
| 10 | 3 | 9,900.2 | 6.1 / 8.26 | 114.11 / 208.49 | 7 | 4 | 0 | 0 | 41.6 | 134 | 3,085 | 549,258 |
| 10 | 5 | 7,686.8 | 6.81 / 8.93 | 151.28 / 269.91 | 8 | 14 | 16 | 0 | 41.8 | 153 | 2,700 | 480,600 |
| 15 | 1 | 4,870.7 | 6.55 / 9.13 | 230.66 / 422.91 | 5 | 4 | 0 | 0 | 41.8 | 96 | 4,320 | 768,960 |
| 15 | 2 | 8,911.4 | 6.08 / 8.1 | 127.02 / 232.13 | 5 | 4 | 0 | 0 | 41.7 | 96 | 4,320 | 768,960 |
| 15 | 3 | 10,715.5 | 6.19 / 8.24 | 109.92 / 191.57 | 5 | 4 | 0 | 0 | 41.8 | 96 | 4,320 | 768,960 |
| 15 | 5 | 7,483 | 6.15 / 8.61 | 164.39 / 267.68 | 8 | 24 | 30 | 0 | 41.8 | 153 | 2,700 | 480,600 |
| 25 | 1 | 4,777.9 | 6.5 / 8.72 | 239.32 / 430.14 | 4 | 4 | 0 | 0 | 41.7 | 77 | 5,400 | 961,200 |
| 25 | 2 | 9,152 | 6.4 / 7.92 | 122.44 / 220.93 | 4 | 4 | 0 | 0 | 41.7 | 77 | 5,400 | 961,200 |
| 25 | 3 | 11,462.5 | 6.18 / 8.24 | 98.92 / 174.85 | 4 | 4 | 0 | 0 | 41.7 | 77 | 5,400 | 961,200 |
| 25 | 5 | 7,623.4 | 6.19 / 8.45 | 158.02 / 262.15 | 8 | 25 | 29 | 0 | 41.9 | 153 | 2,700 | 480,600 |

Attempt latency covers the terminal attempt. Cohort latency includes queue wait and retry. RSS includes Node and its imports. The projections assume all starts are available to this workload. Receipt bytes measure serialized JSON. Postgres rows, indexes, WAL, PDF decoding and GeM response times require separate measurement.

The five-job, two-fetch trial took 13 mock turns versus 64 for the one-job baseline. It produced zero mock 429s and duplicate claims. With five concurrent reads allowed, the 15-job and 25-job trials triggered 30 and 29 mock 429 responses. Use five jobs and two concurrent reads for the initial isolated trial. Actual GeM limits, Edge CPU and throughput remain unmeasured. Confirm storage headroom and track time from first discovery and from source availability before setting a release target.

## Production trace

At 19:43–19:45 IST the public feed reported 1,211 open tenders, one verified BOQ and 59 open tenders published in the previous 24 hours. The intersection was 0 of 59. Only GEM/2026/B/8304822 had a scheduled certification. Supabase v37 used 296 of 360 daily starts and 461,417,619 database bytes. Its remaining headroom to 485,000,000 bytes was 23,582,381 bytes. The 01:00 IST sweep was still running at 19:45 IST with 2,420 listing records scanned and five document checks. Netlify served clean SHA `7887d65499525e78e1943b83acbfb91e6ae8f9c4`. [Live release manifest](https://tenderscope-healthcare.netlify.app/release.json)

| Case | Official bid | TenderScope detail at cutoff |
|---|---|---|
| Fresh medicine | [GEM/2026/B/8316116](https://bidplus.gem.gov.in/showbidDocument/10214652) | Published 18:13. First seen 18:40. At 18:52 the parent source and links to the CSV and specification had been recorded. Parent queued, zero extracted rows and no independent count. |
| Generic schedule | [GEM/2026/B/8315688](https://bidplus.gem.gov.in/showbidDocument/10214164) | BOQ114 visible. Parent queued, zero extracted rows and no independent count. |
| Complex schedule | [GEM/2026/B/8086542](https://bidplus.gem.gov.in/showbidDocument/9950079) | 200 extracted rows. Independent count and buyer specification PDF still pending. |
| Urgent medicine | [GEM/2026/B/8241959](https://bidplus.gem.gov.in/showbidDocument/10128836) | Recorded closing at 21:00 IST on 25 November. Zero extracted rows and no independent count. |
| Recorded extension | [GEM/2026/B/8304522](https://bidplus.gem.gov.in/showbidDocument/10201157) | Recorded deadline moved from 24 November 19:00 IST to 27 November 19:00 IST. Zero extracted rows and no independent count. |

The public bid detail reads use `bid_pack_source`. All five GeM parent PDFs, the fresh medicine CSV and the complex schedule specification PDF returned HTTP 503 with an upstream timeout from the verification workspace. Current source wording, deadline and corrigenda remain independently unconfirmed for this sample.

## Candidate verification

- The v37 overlay applied to a local copy of the deployed worker. The integration fixtures exercised token-checked settlement, deadline abort, limited reads and cooldown. The staged worker smoke tests covered generic discovery, late extension, and H1 evidence spanning PDF pages.
- A read-only replay of the stored `bid_pack_source` result for GEM/2026/B/8304822 retained 9 of 9 and produced an editable nine-row Word draft. Its two A4 pages rendered. Changing the linked PDF hash at the same URL cleared verification and blocked sign-off. This replay uses the existing certification. [Official bid](https://bidplus.gem.gov.in/showbidDocument/10201509)
- The ordinary fresh and amended queue still uses the existing lane rotation and 72-hour priority. The draft uses its spare turn after normal processing. Linked ATC attachments need their own page and hash evidence before buyer-level flags can be used across documents.
- Release remains gated on the hosted staging run, three independently checked scheduled certifications and a renewed public fresh-bid readiness result. Remove the staging setting to return to single reviews. The staging batch pauses at the database warning or after an upstream access restriction. [PR #21](https://github.com/affvare-coder/Tenderscope/pull/21)
