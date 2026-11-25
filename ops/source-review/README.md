The production v37 bundle has SHA-256 `9a205b2d2c86ce4201c8ed2db3aa2bdeacca2bde4943daedbcdef118e6bcc129`. PR #21 preserves the v32 overlay and modules used to build that baseline. Source review shares the existing budgeted scheduler.

The linked-schedule path reads the GeM CSV independently and compares each row with the separate buyer specification PDF. Complete requires current buyer PDF links, matching quantities and consignees, embedded ATC, every active attachment, a current deadline and the official corrigendum response. Ambiguous layouts, unreadable scans, missing references and conflicting wording remain open. Source-backed eligibility entries carry the page and quotation.

A catalogue review reserves one additional existing turn in eight for fresh or closing-soon sources. The hourly listing recheck reservation recovers earlier exclusions through a fresh official lookup. It uses the ordinary discovery writer and preserves first observation.

Group tenderscope_private.bid_source_checks by outcome for operational checks. public.verified_boq_bids is the live certification count. Intersect it with the published24 feed cohort to calculate rolling fresh BOQ readiness. Technical offer readiness also requires participant and OEM evidence.

## Isolated staging candidate

Use a disposable local copy of the v37 bundle. Preserve the original import map and authentication. Run the following from the Git checkout with `worker_root` set to the absolute path of the copy.

```sh
git -C "$worker_root" apply "$PWD/ops/source-review/staging-worker-v37.patch"
cp ops/source-review/{batch-worker,bounded-batch,catalogue,eligibility,linked-schedule,official-count,review-worker,schedule-pdf}.mjs "$worker_root/worker/"
node ops/source-review/test-staged-v37.mjs "$worker_root"
npm test
node scripts/benchmark-source-review.mjs
```

An isolated hosted test uses a separate Supabase project and sets `TENDERSCOPE_BATCH_STAGING_PROJECT` to its project reference. The batch uses the existing spare slot after normal processing and admits up to five reviews with at most two simultaneous source reads. Each result settles under the original lease token. An unresolved 420 MB capacity warning or the 485 MB guard blocks spare batch claims. A source access restriction pauses staging batch requests through `Retry-After` or the next four-minute turn, whichever is later. Removing the staging setting restores the single spare review.

A hosted pilot must measure GeM response status, wall time, CPU and memory, lease recovery, source-ready completion rate, and database growth under the existing pace. Escalation depends on actual source and storage measurements. See [the 25 November replay and benchmark](../../docs/proof/source-review-benchmark-20261125.md).
