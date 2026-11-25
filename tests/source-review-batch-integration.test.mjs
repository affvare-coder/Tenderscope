import assert from 'node:assert/strict';
import test from 'node:test';
import {setTimeout as sleep} from 'node:timers/promises';
import {
  claimSourceReview, isStagingReviewProject, runStagingSourceReviewBatch,
} from '../ops/source-review/batch-worker.mjs';

const stage = 'abcdefghijklmnopqrst';
const specUrl = 'https://mkp.gem.gov.in/uploaded_documents/technical.pdf';
const parent = 'https://bidplus.gem.gov.in/showbidDocument/12345678';
const parentSha = 'a'.repeat(64);

function makeDb({jobs = [], outcomes = {}, warning = false, pause = null} = {}) {
  const calls = [], writes = [];
  let pendingWrites = 0, peakWrites = 0;
  return {
    calls, writes, peakWrites: () => peakWrites,
    get(path) {
      if (path.startsWith('system_alerts?')) return warning ? [{code: 'DATABASE_CAPACITY_WARNING'}] : [];
      if (path.startsWith('sync_state?')) return pause ? [{state: {until: pause}}] : [];
      throw new Error('Unexpected query');
    },
    upsert(table, row) { writes.push({table, row}); },
    async rpc(name, args) {
      calls.push({name, args});
      if (name === 'claim_bid_source_pair') return jobs.shift() || null;
      if (name === 'claim_catalogue_source' || name === 'claim_bid_source_review') return null;
      if (name === 'record_bid_header_evidence') return null;
      if (name !== 'finish_bid_source_pair') throw new Error('Unexpected RPC');
      pendingWrites++;
      peakWrites = Math.max(peakWrites, pendingWrites);
      await sleep(1);
      pendingWrites--;
      return outcomes[args.p_id] ?? 'certified';
    },
  };
}

function job(id) {
  return {id, url: specUrl, parent, parent_sha: parentSha, token: 'lease-' + id};
}

test('batch enables only when the separate staging project matches exactly', () => {
  assert.equal(isStagingReviewProject(`https://${stage}.supabase.co`, stage), true);
  assert.equal(isStagingReviewProject(`https://${stage}.supabase.co/`, stage), true);
  assert.equal(isStagingReviewProject(`https://${stage}.supabase.co`, undefined), false);
  assert.equal(isStagingReviewProject(`https://${stage}.supabase.co.invalid`, stage), false);
  const prod = 'agdmlgbfxoqhztiormij';
  assert.equal(isStagingReviewProject(`https://${prod}.supabase.co`, prod), false);
});

test('normal source arbitration retains pair, catalogue and header priority; spare skips header', async () => {
  const calls = [];
  const db = {rpc(name, args) { calls.push({name, args}); return name === 'claim_bid_source_review' ? job('header') : null; }};
  assert.equal((await claimSourceReview(db, false)).id, 'header');
  assert.deepEqual(calls.map(c => c.name), ['claim_bid_source_pair', 'claim_catalogue_source', 'claim_bid_source_review']);
  calls.length = 0;
  assert.equal(await claimSourceReview(db, true), null);
  assert.deepEqual(calls.map(c => c.name), ['claim_bid_source_pair', 'claim_catalogue_source']);
  assert.ok(calls.every(c => c.args.p_spare));
});

test('bounded staging reads use spare claims, serialize token writes and count only certified settlements', async () => {
  const db = makeDb({
    jobs: ['one', 'two', 'three', 'four', 'five'].map(job),
    outcomes: {two: 'rows_compared', three: 'source_pending', four: 'specification_conflict'},
  });
  const receipts = {rows: [], facts: {ra: {value: 'No', quote: 'No', page: 1}}};
  const report = await runStagingSourceReviewBatch({
    db, deadlineMs: Date.now() + 2000, batchSize: 5, maxConcurrency: 2,
    fetchImpl: async (_url, {signal}) => { await sleep(3, null, {signal}); return new Response('fixture'); },
    async reviewJob(source, {fetchImpl, withFetch}) {
      await Promise.all([source.url, source.parent].map(url => withFetch(async signal => {
        const response = await fetchImpl(url, {signal});
        assert.equal(await response.text(), 'fixture');
      })));
      return receipts;
    },
  });
  assert.deepEqual(report.counts, {complete: 2, partial: 2, unverified: 1, retry: 0, rate_limited: 0, lease_lost: 0});
  assert.equal(report.claimed, 5);
  assert.equal(report.peakFetches, 2);
  assert.equal(db.peakWrites(), 1);
  assert.ok(db.calls.filter(c => c.name.startsWith('claim')).every(c => c.args.p_spare));
  assert.ok(db.calls.filter(c => c.name.startsWith('finish')).every(c => c.args.p_token === 'lease-' + c.args.p_id));
  assert.ok(db.calls.filter(c => c.name === 'record_bid_header_evidence').every(c => c.args.p_id !== 'three'));
});

test('stale leases stop admissions without publishing header facts', async () => {
  const db = makeDb({jobs: [job('one'), job('two')], outcomes: {one: 'lease_expired'}});
  const report = await runStagingSourceReviewBatch({
    db, deadlineMs: Date.now() + 800, reviewJob: async () => ({facts: {ra: {value: 'No'}}}),
  });
  assert.equal(report.reason, 'lease_lost');
  assert.equal(report.counts.lease_lost, 1);
  assert.equal(report.claimed, 1);
  assert.deepEqual(db.calls.map(c => c.name), ['claim_bid_source_pair', 'finish_bid_source_pair']);
});

test('source HTTP 429 drains the active lease and pauses future staging turns for Retry-After', async () => {
  const db = makeDb({jobs: [job('one'), job('two')]});
  const now = Date.now();
  let requests = 0;
  const report = await runStagingSourceReviewBatch({
    db, deadlineMs: now + 1000, clock: () => now,
    fetchImpl: async () => {
      requests++;
      return new Response(null, {status:429, headers: {'Retry-After':'600'}});
    },
    async reviewJob(source, {fetchImpl}) {
      await fetchImpl(source.url);
      await assert.rejects(() => fetchImpl(source.parent), /batch_source_paused/);
      return {error:'document_http_429'};
    },
  });
  const until = new Date(now + 600000).toISOString();
  assert.equal(report.reason, 'rate_limited');
  assert.equal(report.claimed, 1);
  assert.equal(requests, 1);
  assert.deepEqual(db.writes, [{table:'sync_state', row:{key:'staging_source_review_cooldown',state:{until}}}]);

  const pausedDb = makeDb({jobs: [job('three')], pause: until});
  const paused = await runStagingSourceReviewBatch({db:pausedDb, deadlineMs:now+1000, clock:()=>now});
  assert.equal(paused.reason, 'cooldown');
  assert.deepEqual(pausedDb.calls, []);
});

test('storage warning blocks extra claims', async () => {
  const db = makeDb({jobs: [job('one')], warning:true});
  const report = await runStagingSourceReviewBatch({db, deadlineMs:Date.now()+1000});
  assert.equal(report.reason, 'capacity_warning');
  assert.deepEqual(db.calls, []);
});

test('a completed body arriving after abort settles as retry with no stale evidence', async () => {
  const db = makeDb({jobs: [job('one'), job('two')], outcomes: {one:'batch_deadline'}});
  const stop = new AbortController();
  const report = await runStagingSourceReviewBatch({
    db, deadlineMs:Date.now()+1000, signal:stop.signal,
    async reviewJob() { stop.abort(); return {facts:{ra:{value:'No'}}}; },
  });
  assert.equal(report.reason, 'cancelled');
  assert.equal(report.claimed, 1);
  assert.equal(report.counts.retry, 1);
  assert.deepEqual(db.calls[1].args.p_data, {error:'batch_deadline'});
});
