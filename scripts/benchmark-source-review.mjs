// Usage: node scripts/benchmark-source-review.mjs > benchmark.json
// Run one isolated cell with: node scripts/benchmark-source-review.mjs --case 10 2
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {assessBoqCompleteness} from '../boq-completeness.mjs';
import {runSourceReviewBatch} from '../ops/source-review/bounded-batch.mjs';
import {officialScheduleCount} from '../ops/source-review/official-count.mjs';
import {compareSchedule} from '../ops/source-review/schedule-pdf.mjs';

const batchSizes = [1, 5, 10, 15, 25], caps = [1, 2, 3, 5];
const cohort = 60, startsBudget = 360, exampleBacklog = 1144;
const columns = ['Item Number', 'Item Title', 'Item Description', 'Item Quantity',
  'Unit of Measure', 'Consignee ID', 'Delivery Period (In number of days)'];
const heading = ['Item','Number','Item Title','Item Description','Item','Quantity',
  'Unit of','Measure','Consignee ID','Delivery Period (In','number of days)'];
const xs = [8, 60, 155, 255, 305, 360, 420];
const glyph = (str, x, y) => ({str, transform: [1, 0, 0, 1, x, y], width: str.length * 3});
const digest = value => createHash('sha256').update(value).digest('hex');
const percentile = (numbers, p) => +numbers.toSorted((a,b) => a-b)[Math.ceil(numbers.length * p)-1].toFixed(2);

// Synthetic CSV and text-layer PDF cells are read separately. The spec-only
// conflict, unavailable text, pending attachment, and changed hash must stay open.
function fixture(id) {
  const rows = [
    ['1','Dental mirror','Diameter 22 mm','8','Nos','Receiver A','15'],
    ['2','Dental mirror','Diameter 22 mm','6','Nos','Receiver B','15'],
  ];
  const csv = [columns, ...rows].map(r => r.join(',')).join('\r\n');
  const tokens = heading.map((s,i) => glyph(s,[8,8,60,155,255,255,305,305,360,420,420][i],150));
  for (const [i,row] of rows.entries()) {
    const pdf = row.slice();
    if (id % 10 === 2 && i === 1) pdf[2] = 'Diameter 24 mm';
    tokens.push(...pdf.map((s,j) => glyph(s,xs[j],120-i*20)));
  }
  const pdfTokens = id % 10 === 4 ? [] : tokens;
  const stem = 'https://mkp.gem.gov.in/uploaded_documents/mock/' + id;
  return {csv, pdfTokens, csvUrl: stem + '.csv', pdfUrl: stem + '.pdf',
    csvHash: digest(csv), pdfHash: digest(JSON.stringify(pdfTokens)),
    changed: id % 10 === 5, pendingAttachment: id % 10 === 3};
}

function assess(f, csv, pdfTokens) {
  const independentCount = officialScheduleCount(new TextEncoder().encode(csv));
  const records = csv.split('\r\n').map(row => row.split(',')); // fixture CSV has no escaped fields
  const comparisons = compareSchedule(pdfTokens, records) ?? [];
  const items = comparisons.map(row => ({item_number: row.n, name: row.name,
    quantity: row.quantity, unit: row.unit, specification: row.specification,
    source_url: f.pdfUrl, source_hash: f.pdfHash, source_question: row.question,
    specification_verified: !row.question}));
  const decision = assessBoqCompleteness({items,
    documents: [{official_url: f.csvUrl, availability:'available', content_hash:f.csvHash},
      {official_url: f.pdfUrl, availability:'available', content_hash:f.changed ? 'updated' : f.pdfHash}],
    expectedCountEvidence: {source_url: f.csvUrl, source_hash: f.csvHash, verified: true,
      source_type:'official_boq_csv', source_location:'CSV records 1–2', count:independentCount,
      full_review_pending:f.pendingAttachment}});
  return {status: decision.state.toLowerCase(), n: independentCount, k: decision.verified_item_count,
    sourceHash: f.pdfHash, issues: decision.issues};
}

async function runCell(batchSize, maxConcurrency) {
  const jobs = Array.from({length: cohort}, (_,id) =>
    ({id, key: 'fixture-' + id, state:'ready', attempt:0, readyAt:0, fixture:fixture(id)}));
  const latencies = [], cohortLatencies = [];
  const totals = {complete:0, partial:0, unverified:0};
  let starts = 0, claims = 0, retries = 0, rateLimitResponses = 0, turnsStoppedOn429 = 0;
  let duplicateClaims = 0, spentBytes = 0, fetches = 0, activeFetches = 0, peakFetches = 0;
  const start = performance.now();

  async function sourceRead(job, kind, signal) {
    fetches++;
    const active = ++activeFetches;
    peakFetches = Math.max(peakFetches, active);
    try {
      await sleep(2 + (job.id % 3), null, {signal});
      if (active > 3) {
        rateLimitResponses++;
        throw Object.assign(new Error('mock 429'), {status:429});
      }
      if (kind === 'csv' && job.id % 17 === 0 && job.attempt === 1) {
        throw new Error('mock transient timeout');
      }
      return kind === 'csv' ? job.fixture.csv : job.fixture.pdfTokens;
    } finally { activeFetches--; }
  }
  async function claim() {
    const job = jobs.find(item => item.state === 'ready' && item.lastTurn !== starts && item.readyAt <= Date.now());
    if (!job) return null;
    job.state = 'leased';
    job.lastTurn = starts;
    job.attempt++;
    if (job.attempt > 12) throw Error('fixture retry budget exhausted');
    job.started = performance.now();
    claims++;
    return {...job, token: job.attempt};
  }
  async function review(job, signal, withFetch) {
    const owner = jobs[job.id];
    // Drain both operations, even if the source rejects one of them.
    const reads = await Promise.allSettled(['csv','pdf'].map(kind =>
      withFetch(s => sourceRead(job,kind,s))));
    if (owner.state !== 'leased' || owner.attempt !== job.token) return {status:'lease_lost'};
    const errors = reads.filter(r => r.status === 'rejected');
    if (errors.length) {
      const limited = errors.some(r => r.reason?.status === 429);
      owner.state = 'ready';
      owner.readyAt = Date.now() + 5;
      retries++;
      return {status: limited ? 'rate_limited' : 'retry', retryAfterMs: limited ? 5 : 0};
    }
    const receipt = assess(job.fixture, ...reads.map(r => r.value));
    const shouldComplete = ![2,3,4,5].includes(job.id % 10);
    if ((receipt.status === 'complete') !== shouldComplete) throw Error('wrong fixture certification');
    totals[receipt.status]++;
    owner.state = 'finished';
    latencies.push(performance.now() - job.started);
    cohortLatencies.push(performance.now() - start);
    spentBytes += Buffer.byteLength(JSON.stringify(receipt));
    return receipt;
  }
  while (jobs.some(job => job.state !== 'finished')) {
    if (starts > cohort * 3) throw Error('fixture queue did not drain');
    const earliest = Math.min(...jobs.filter(job => job.state === 'ready').map(job => job.readyAt));
    if (!Number.isFinite(earliest)) throw Error('leaked fixture lease');
    if (earliest > Date.now()) await sleep(earliest - Date.now());
    await sleep(2); // modeled per-invocation overhead, identical for every configuration
    starts++;
    const turn = await runSourceReviewBatch({batchSize, maxConcurrency, claim, review,
      deadlineMs: Date.now() + 4000});
    duplicateClaims += turn.duplicates;
    if (!['empty','batch_limit','rate_limited'].includes(turn.reason)) throw Error(turn.reason);
    if (turn.reason === 'rate_limited') {
      turnsStoppedOn429++;
      await sleep(turn.cooldownMs);
    }
  }
  const durationMs = performance.now() - start;
  return {batchSize,maxConcurrency, starts, claims, uniqueBids:jobs.length, ...totals, retries,
    duplicateClaims, rateLimitResponses, turnsStoppedOn429, fetches, peakFetches,
    wallMs: +durationMs.toFixed(1), completePerMinute:+(totals.complete*60000/durationMs).toFixed(1),
    terminalAttemptP50Ms:percentile(latencies,.50), terminalAttemptP95Ms:percentile(latencies,.95),
    cohortToDecisionP50Ms:percentile(cohortLatencies,.50), cohortToDecisionP95Ms:percentile(cohortLatencies,.95),
    processPeakRssMiB:+(process.resourceUsage().maxRSS/1024).toFixed(1), receiptJsonBytes:spentBytes,
    estimates:{startsFor1144:Math.ceil(exampleBacklog*starts/cohort),
      decisionsPer360Starts:Math.floor(startsBudget*cohort/starts),
      receiptJsonBytesPer360Starts:Math.ceil(startsBudget*spentBytes/starts)}};
}

if (process.argv[2] === '--case') {
  const [batch,cap] = process.argv.slice(3).map(Number);
  if (!batchSizes.includes(batch) || !caps.includes(cap)) throw Error('Unsupported benchmark cell');
  console.log(JSON.stringify(await runCell(batch,cap)));
} else {
  const cells = [];
  for (const batch of batchSizes) for (const cap of caps) {
    const child = spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--case',String(batch),String(cap)],
      {encoding:'utf8',timeout:30000});
    if (child.error || child.status !== 0) throw Error(child.error?.message || child.stderr || 'Child failed');
    cells.push(JSON.parse(child.stdout));
  }
  console.log(JSON.stringify({cohort,kind:'isolated synthetic CSV and PDF text-layer replay; no network or database',
    upstream:'2–4 ms per document, mock HTTP 429 if more than 3 reads overlap, transient error on first read for IDs divisible by 17',
    timing:'2 ms mock invocation overhead. Terminal attempt latency excludes previous attempts and queue wait. Cohort latency includes both.',
    projection:'1144 is an example backlog. The 360-start estimate assumes every start is available to this workload. JSON receipt bytes exclude tables, indexes, retained files and WAL.',
    memory:'Peak RSS includes Node and its imports, in a fresh child process per matrix cell.',
    node:process.version,cells},null,2));
}
