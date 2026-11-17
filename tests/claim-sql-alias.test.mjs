import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261117014500_fix_priority_candidate_alias.sql',import.meta.url),'utf8');
test('open bid priority lateral alias must not shadow existing PL/pgSQL row variable j',()=>{
 const start=sql.indexOf('with live_missing as materialized');
 const end=sql.indexOf('if selected_id is null then',start);
 assert.ok(start>0&&end>start);
 const fast=sql.slice(start,end);
 assert.match(fast,/select priority_candidate\.id into selected_id/);
 assert.match(fast,/select sj\.id,sj\.created_at,sj\.payload->>'url' as url/);
 assert.match(fast,/\) priority_candidate on true/);
 assert.match(fast,/priority_candidate\.created_at limit 1/);
 assert.doesNotMatch(fast,/select j\.id into selected_id/);
 assert.doesNotMatch(fast,/spriority_candidate/);
 assert.doesNotMatch(fast,/\) j on true/);
});
test('existing single worker, lease and fallback remain in the final function',()=>{
 assert.match(sql,/tenderscope:single-worker/);
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/update public\.sync_jobs set state='running'/);
 assert.match(sql,/else 0 end/);
 assert.match(sql,/return to_jsonb\(j\)/);
});
