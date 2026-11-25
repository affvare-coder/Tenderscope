import {runSourceReviewBatch} from './bounded-batch.mjs';

const cooldownKey = 'staging_source_review_cooldown';
const productionProject = 'agdmlgbfxoqhztiormij';
const partialResults = new Set(['count_recorded', 'header_reviewed', 'rows_compared', 'specification_conflict']);
const temporaryError = /document_http_(?:408|429|5\d\d)|\btimeout\b|network|batch_deadline/i;
const minCooldownMs = 4 * 60 * 1000;

export function isStagingReviewProject(supabaseUrl, project) {
  return typeof project === 'string' && /^[a-z]{20}$/.test(project) &&
    project !== productionProject &&
    (supabaseUrl === `https://${project}.supabase.co` || supabaseUrl === `https://${project}.supabase.co/`);
}

export async function claimSourceReview(db, spare) {
  const pair = await db.rpc('claim_bid_source_pair', {p_spare: spare});
  if (pair) return {...pair, paired: true};
  const catalogue = await db.rpc('claim_catalogue_source', {p_spare: spare});
  const job = catalogue || (!spare && await db.rpc('claim_bid_source_review'));
  return job ? {...job, paired: false} : null;
}

export function finishSourceReview(db, job, data) {
  const rpc = job.paired ? 'finish_bid_source_pair' : 'finish_bid_source_review';
  return db.rpc(rpc, {p_id: job.id, p_url: job.url, p_token: job.token, p_data: data});
}

export async function recordPairHeader(db, job, data) {
  if (job.paired && data.facts && Object.keys(data.facts).length) {
    await db.rpc('record_bid_header_evidence', {
      p_id: job.id, p_url: job.parent, p_sha: job.parent_sha, p_facts: data.facts,
    });
  }
}

function retryAfterMs(value, now) {
  if (!value) return minCooldownMs;
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(8.64e15 - now, Math.max(delay, minCooldownMs)) : minCooldownMs;
}

/** Use only the spare work of an already dispatched staging invocation. */
export async function runStagingSourceReviewBatch({
  db, reviewJob, deadlineMs, signal, clock = Date.now, fetchImpl = fetch,
  batchSize = 5, maxConcurrency = 2,
}) {
  const [warning] = await db.get('system_alerts?select=code&code=in.(DATABASE_CAPACITY_WARNING,DATABASE_BUDGET_GUARD)&resolved_at=is.null&limit=1');
  if (warning) return {reason: 'capacity_warning', claimed: 0};
  const [pause] = await db.get(`sync_state?select=state&key=eq.${cooldownKey}&limit=1`);
  if (Date.parse(pause?.state?.until) > clock()) {
    return {reason: 'cooldown', claimed: 0, cooldownUntil: pause.state.until};
  }

  let restrictedUntil = 0;
  let rateLimited = false;
  let settlements = Promise.resolve();
  const report = await runSourceReviewBatch({
    batchSize, maxConcurrency, deadlineMs, signal, clock,
    async claim(batchSignal) {
      if (batchSignal.aborted || restrictedUntil > clock()) return null;
      const job = await claimSourceReview(db, true);
      return job && {...job, key: job.id + '\u0000' + job.url};
    },
    async review(job, batchSignal, withFetch) {
      let data, jobRateLimited = false, transientFailure = false;
      const observeSource = async (url, init) => {
        if (restrictedUntil > clock()) throw new Error('batch_source_paused');
        const response = await fetchImpl(url, init);
        if ([401, 403, 429].includes(response.status)) {
          const now = clock();
          jobRateLimited ||= response.status === 429;
          rateLimited ||= jobRateLimited;
          restrictedUntil = Math.max(restrictedUntil, now + retryAfterMs(response.headers.get('retry-after'), now));
        }
        transientFailure ||= response.status === 408 || response.status >= 500;
        return response;
      };
      try {
        batchSignal.throwIfAborted();
        data = await reviewJob(job, {fetchImpl: observeSource, withFetch});
      } catch (error) {
        data = {error: String(error?.message || 'source_review_failed').slice(0, 120)};
      }

      const settle = settlements.then(async () => {
        const evidence = batchSignal.aborted ? {error: 'batch_deadline'} : data;
        const outcome = await finishSourceReview(db, job, evidence);
        if (outcome === 'lease_expired') return {status: 'lease_lost'};
        if (outcome === 'certified' || partialResults.has(outcome)) await recordPairHeader(db, job, evidence);
        if (jobRateLimited) return {status: 'rate_limited', retryAfterMs: restrictedUntil - clock()};
        if (outcome === 'certified') return {status: 'complete'};
        if (transientFailure || batchSignal.aborted || restrictedUntil > clock() || temporaryError.test(evidence.error || '')) return {status: 'retry'};
        if (partialResults.has(outcome)) return {status: 'partial'};
        return {status: 'unverified'};
      });
      // A failed settlement leaves its lease to expire. Other admitted jobs
      // can still settle using their own tokens.
      settlements = settle.catch(() => {});
      return settle;
    },
  });

  if (restrictedUntil) {
    const cooldownUntil = new Date(restrictedUntil).toISOString();
    await db.upsert('sync_state', {key: cooldownKey, state: {until: cooldownUntil}});
    return {...report, reason: rateLimited ? 'rate_limited' : 'access_restricted', cooldownUntil};
  }
  return report;
}
