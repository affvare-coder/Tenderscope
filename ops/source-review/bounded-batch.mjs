// The caller owns atomic claims, token-checked commits and persistent retry timing.
// Each review must route every outbound source request through withFetch, including
// parallel CSV/PDF reads. No source, queue, credential or scheduler is selected here.
const outcomes = ['complete', 'partial', 'unverified', 'retry', 'rate_limited', 'lease_lost'];

export async function runSourceReviewBatch({
  batchSize = 1, maxConcurrency = 1, claim, review, deadlineMs,
  signal, clock = Date.now,
}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25 ||
      !Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 5) {
    throw new RangeError('Choose a batch size of 1–25 and concurrency of 1–5');
  }
  if (!Number.isFinite(deadlineMs)) throw new TypeError('An absolute turn deadline is required');
  if (typeof claim !== 'function' || typeof review !== 'function') throw new TypeError('Missing queue adapter');

  const counts = Object.fromEntries(outcomes.map(key => [key, 0]));
  const seen = new Set(), pending = new Set(), waiters = new Set();
  const abort = new AbortController();
  let window = 1, successes = 0, fetches = 0, peakFetches = 0, peakReviews = 0;
  let reason, exhausted = false, duplicates = 0, cooldownMs = 0;
  function wake() {
    for (const resolve of waiters) resolve();
    waiters.clear();
  }
  function stop(value) {
    reason ??= value;
    wake();
  }
  function cancel(value) {
    stop(value);
    abort.abort(new Error(value));
  }
  const onAbort = () => cancel('cancelled');
  const timer = setTimeout(() => cancel('deadline'), Math.min(2147483647, Math.max(0, deadlineMs - clock())));
  signal?.addEventListener('abort', onAbort, {once: true});
  if (signal?.aborted) onAbort();

  async function withFetch(fn) {
    while (!reason && fetches >= window) await new Promise(resolve => waiters.add(resolve));
    if (clock() >= deadlineMs) cancel('deadline');
    if (reason) throw new Error(reason);
    fetches++;
    peakFetches = Math.max(peakFetches, fetches);
    try {
      return await fn(abort.signal);
    } finally {
      fetches--;
      wake();
    }
  }
  async function finish(job) {
    const calls = new Set();
    let closed = false;
    function jobFetch(fn) {
      if (closed) return Promise.reject(new Error('Review already finished'));
      const promise = withFetch(fn);
      calls.add(promise);
      promise.then(() => calls.delete(promise), () => calls.delete(promise));
      return promise;
    }
    try {
      const result = await review(job, abort.signal, jobFetch);
      if (!outcomes.includes(result?.status)) throw new Error('Unknown review result');
      counts[result.status]++;
      if (result.status === 'rate_limited') {
        const wait = Number(result.retryAfterMs);
        if (Number.isFinite(wait) && wait > 0) cooldownMs = Math.max(cooldownMs, wait);
        stop('rate_limited');
      } else if (result.status === 'lease_lost') {
        stop('lease_lost');
      } else if (result.status === 'retry') {
        window = Math.max(1, Math.floor(window / 2));
        successes = 0;
      } else if (++successes >= window && window < maxConcurrency) {
        window++;
        successes = 0;
      }
    } catch {
      // A throwing callback may have an unsettled lease. Leave recovery to the
      // durable queue instead of acknowledging it or immediately reclaiming it.
      stop('review_error');
    } finally {
      // Promise.all rejects as soon as one attachment fails. Account for any
      // sibling reads that are still active or waiting on a shared fetch slot.
      closed = true;
      await Promise.allSettled(calls);
      wake();
    }
  }
  try {
    while (true) {
      if (clock() >= deadlineMs) cancel('deadline');
      if (reason || exhausted || seen.size >= batchSize) break;
      if (pending.size >= window) {
        await Promise.race(pending);
        continue;
      }
      let job;
      try {
        job = await claim(abort.signal);
      } catch {
        stop('claim_error');
        break;
      }
      if (job == null) {
        exhausted = true;
        break;
      }
      if (typeof job.key !== 'string' || !job.key.trim()) {
        stop('invalid_claim');
        break;
      }
      if (seen.has(job.key)) {
        duplicates++;
        stop('duplicate_claim');
        break;
      }
      seen.add(job.key);
      // Deliver even a claim returned concurrently with cancellation to its
      // adapter, which can settle/defer it with its own lease token.
      const task = finish(job).finally(() => pending.delete(task));
      pending.add(task);
      peakReviews = Math.max(peakReviews, pending.size);
    }
    await Promise.all(pending);
    return {reason: reason ?? (exhausted ? 'empty' : 'batch_limit'), claimed: seen.size,
      counts, duplicates, peakFetches, peakReviews, cooldownMs};
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
