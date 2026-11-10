import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ctx=vm.createContext({Intl,URL,Date,Map,console});
vm.runInContext(source.slice(0,source.indexOf('async function load('))+source.slice(source.indexOf('function sourceHealthSummary('),source.indexOf('async function loadSyncStatus('))+'\nthis.summary=sourceHealthSummary;',ctx);
test('spent request allowance and incomplete products are visible even with a recent snapshot',()=>{
 const now=Date.now();const state=ctx.summary({checked_at:new Date(now).toISOString(),last_gem_contact:new Date(now-5*3600000).toISOString(),worker_budget:{daily_limit:360,calls:360,exhausted:true,next_reset_at:'2026-11-05T18:30:00Z'},product_coverage:{open_bids:554,with_verified_items:62},document_queue:{queued:9602}},now);
 assert.equal(state.warning,true);assert.match(state.text,/SYSTEM_SYNC_FAILED/);assert.match(state.text,/62 of 554/);assert.match(state.text,/360 of 360/);assert.match(state.text,/Next daily allowance/);assert.doesNotMatch(state.text,/recovery running/);
});
test('source freshness uses actual source contact instead of snapshot generation time',()=>{
 const now=Date.now();const recent=ctx.summary({last_gem_contact:new Date(now-3600000).toISOString(),worker_budget:{exhausted:false,calls:15,daily_limit:360}},now);assert.equal(recent.warning,false);assert.match(recent.text,/within the recorded/);
 assert.equal(ctx.summary({checked_at:new Date(now).toISOString()},now).warning,true);
});
