import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261117014000_guard_warning_and_verified_archive_prune.sql',import.meta.url),'utf8');
test('retains the hard storage guard and reports a lower early-warning threshold',()=>{
  assert.match(sql,/>=420000000/);
  assert.match(sql,/DATABASE_CAPACITY_WARNING/);
  assert.match(sql,/>=485000000/);
  assert.match(sql,/DATABASE_BUDGET_GUARD/);
  assert.match(sql,/tenderscope_private\.wake_sync\(\)/);
});
test('archive cleanup requires cold-object confirmation and does not delete active bids',()=>{
  assert.match(sql,/tenderscope_private\.cold_archives/);
  assert.match(sql,/storage\.objects/);
  assert.match(sql,/a\.verified_at is not null/);
  assert.match(sql,/c\.bid_number=any\(a\.ids\)/);
  assert.match(sql,/j\.id::text=any\(a\.ids\)/);
  assert.match(sql,/not exists\(select 1 from public\.tenders t/);
  assert.match(sql,/not exists\(select 1 from public\.sync_jobs j[\s\S]*?state in \('queued','running'\)/);
  assert.match(sql,/r\.finished_at is not null/);
  assert.match(sql,/not exists\(select 1 from public\.sync_job_dependencies d/);
  assert.match(sql,/not exists\(select 1 from public\.sync_job_failures f/);
  assert.match(sql,/pg_try_advisory_xact_lock/);
  assert.match(sql,/for update of c skip locked/);
  assert.match(sql,/for update of j skip locked/);
  assert.match(sql,/least\(greatest\(p_candidate_limit,0\),250\)/);
  assert.match(sql,/least\(greatest\(p_job_limit,0\),50\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
});
