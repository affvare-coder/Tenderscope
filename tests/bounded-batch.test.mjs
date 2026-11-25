import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {runSourceReviewBatch} from '../ops/source-review/bounded-batch.mjs';

const defaults = () => ({batchSize: 15, maxConcurrency: 3, deadlineMs: Date.now() + 5000});
const queue = count => {
  let i = 0;
  return async () => i < count ? {key: String(++i)} : null;
};

test('one cap covers parallel document reads across all leased jobs', async () => {
  let active = 0, high = 0;
  const result = await runSourceReviewBatch({...defaults(), claim: queue(100),
    review: async (job, signal, withFetch) => {
      await Promise.all([1, 2].map(() => withFetch(async () => {
        high = Math.max(high, ++active);
        await sleep(2);
        active--;
      })));
      return {status: 'complete'};
    }});
  assert.equal(result.claimed, 15);
  assert.equal(result.counts.complete, 15);
  assert.equal(high, 3);
  assert.equal(result.peakFetches, high);
  assert.equal(result.reason, 'batch_limit');
  assert.equal(active, 0);
});

test('duplicate and stale leases stop admissions without repeating a review', async () => {
  let runs = 0;
  const duplicate = await runSourceReviewBatch({...defaults(), claim: async () => ({key: 'same'}),
    review: async () => { runs++; return {status: 'partial'}; }});
  assert.equal(runs, 1);
  assert.equal(duplicate.reason, 'duplicate_claim');
  assert.equal(duplicate.duplicates, 1);
  const stale = await runSourceReviewBatch({...defaults(), claim: queue(5),
    review: async () => ({status: 'lease_lost'})});
  assert.equal(stale.claimed, 1);
  assert.equal(stale.reason, 'lease_lost');
  assert.equal(stale.counts.complete, 0);
});

test('upstream throttling reports the wait and does not schedule an immediate retry', async () => {
  const result = await runSourceReviewBatch({...defaults(), claim: queue(15),
    review: async () => ({status: 'rate_limited', retryAfterMs: 750})});
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.cooldownMs, 750);
  assert.equal(result.claimed, 1);
});

test('deadline cancels in-flight source I/O and drains token-aware cleanup', async () => {
  let settled = 0;
  const result = await runSourceReviewBatch({...defaults(), deadlineMs: Date.now() + 40, claim: queue(8),
    review: async (job, signal, withFetch) => {
      try { await withFetch(s => sleep(1000, null, {signal: s})); }
      catch { settled++; return {status: 'retry'}; }
      return {status: 'complete'};
    }});
  assert.equal(result.reason, 'deadline');
  assert.equal(settled, 1);
  assert.equal(result.counts.complete, 0);
});

test('an expired turn cannot claim and an adapter fault stops further admissions', async () => {
  let claims = 0;
  const expired = await runSourceReviewBatch({...defaults(), deadlineMs: Date.now() - 1,
    claim: async () => { claims++; }, review: async () => ({status: 'complete'})});
  assert.equal(claims, 0);
  assert.equal(expired.reason, 'deadline');
  const broken = await runSourceReviewBatch({...defaults(), claim: queue(10),
    review: async () => { throw Error('commit unknown'); }});
  assert.equal(broken.claimed, 1);
  assert.equal(broken.reason, 'review_error');
  assert.equal(broken.counts.complete, 0);
});

test('serialized claims and early-returning reviewers leave no reads detached', async () => {
  let activeClaims = 0, highClaims = 0, reading = 0;
  const next = queue(10);
  const result = await runSourceReviewBatch({...defaults(), claim: async () => {
    highClaims = Math.max(highClaims, ++activeClaims);
    await sleep(1);
    activeClaims--;
    return next();
  }, review: async (job, signal, withFetch) => {
    // Simulate an adapter that returned before its secondary attachment request.
    withFetch(async () => { reading++; await sleep(4); reading--; });
    return {status: 'partial'};
  }});
  assert.equal(highClaims, 1);
  assert.equal(result.claimed, 10);
  assert.equal(reading, 0);
});
