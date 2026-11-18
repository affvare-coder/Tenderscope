import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isAnonymousScheduleLabel} from '../product-quality.mjs';
import {verifiedItems,documentVerification} from '../document-core.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(){
 const ctx=vm.createContext({Intl,URL,URLSearchParams,Date,Map,console});
 vm.runInContext(source.slice(0,source.indexOf('async function load('))+source.slice(source.indexOf('function sourceLink('),source.indexOf('function card(t)'))+'\nthis.state=S;this.preview=productPreview;this.panel=productsPanel;this.summaries=loadProductSummaries;this.isSchedule=isAnonymousScheduleLabel;',ctx);
 vm.runInContext('render=()=>{};this.pending=[];api=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));',ctx);
 ctx.state.all=[{id:'12345678-1234-1234-1234-123456789012'}];ctx.state.pageKey='page';ctx.state.requestId=1;
 return ctx;
}
test('older product summaries cannot overwrite a newer refresh of the same page',async()=>{
 const ctx=setup();const first=ctx.summaries();ctx.state.requestId=2;const second=ctx.summaries();
 ctx.pending[1].resolve([{tender_id:ctx.state.all[0].id,item_names:['new'],item_count:1}]);await second;
 ctx.pending[0].resolve([{tender_id:ctx.state.all[0].id,item_names:['old'],item_count:1}]);await first;
 assert.deepEqual(Array.from(ctx.state.products.values())[0].item_names,['new']);
});
test('network failure is distinguished from an unverified product list',async()=>{
 const ctx=setup();const task=ctx.summaries();assert.match(ctx.preview(ctx.state.all[0]),/Checking product list/);
 ctx.pending[0].reject(Error('network'));await task;
 assert.match(ctx.preview(ctx.state.all[0]),/preview unavailable/);assert.doesNotMatch(ctx.preview(ctx.state.all[0]),/Products processing/);
});
test('a new page invalidates prior product errors and malformed responses are not accepted',async()=>{
 const ctx=setup();const task=ctx.summaries();ctx.state.pageKey='new page';ctx.state.productsState='idle';ctx.pending[0].reject(Error('old'));await task;assert.equal(ctx.state.productsState,'idle');
 const newer=ctx.summaries();ctx.pending[1].resolve({unexpected:true});await newer;assert.equal(ctx.state.productsState,'error');
});
test('current extracted rows remain a partial source view and preserve exact specification text',()=>{
 const ctx=setup(),url='https://mkp.gem.gov.in/boq.csv';
 const item={name:'Medicine',item_number:'1',quantity:3,specification:'2 mg\nPack < 10',source_url:url,source_hash:'new'};
 const html=ctx.panel([item],[{official_url:url,content_hash:'new',availability:'available'}]);
 assert.match(html,/completeness still need checking/);assert.match(html,/2 mg\nPack &lt; 10/);assert.match(html,/buyer-specification/);
 assert.doesNotMatch(html,/OFFICIAL FACT|fully analyzed/);
 assert.doesNotMatch(ctx.panel([{...item,source_url:'https://untrusted.example/a'}],[{official_url:'https://untrusted.example/a',content_hash:'new',availability:'available'}]),/<table/);
});

test('anonymous schedules cannot be presented as verified products or signed compliance rows',()=>{
 const ctx=setup(),url='https://mkp.gem.gov.in/boq.csv',doc={official_url:url,content_hash:'current',availability:'available'};
 for(const name of ['Sch 1','S C H - 2','Schedule Ⅳ','SCH–1','SCH—1','SCH 1.','SCH 1:']){
  assert.equal(ctx.isSchedule(name),true);assert.equal(isAnonymousScheduleLabel(name),true);
  const item={name,item_key:'1',source_url:url,source_hash:'current',specification:'to be confirmed',quantity:1};
  assert.equal(verifiedItems([item],[doc]).length,0);assert.doesNotMatch(ctx.panel([item],[doc]),/<table/);
  ctx.state.products.set('bid',{item_names:[name],item_count:1});assert.match(ctx.preview({id:'bid'}),/descriptions need verification/);
  assert.doesNotMatch(ctx.preview({id:'bid'}),/<li>/);
  const report=documentVerification({bid:{bid_number:'GEM/2026/B/123'},profile:{company:'Bidder',signatory:'Signer'},items:[item],offers:{},images:{},review:{}});
  assert.equal(report.ready,false);assert.ok(report.items[0].blockers.includes('Buyer item description not verified'));
 }
 for(const name of ['Schedule 40 carbon steel pipes','SCH-2 dental kit','Surgical gloves','IV cannula']){assert.equal(ctx.isSchedule(name),false);assert.equal(isAnonymousScheduleLabel(name),false);}
});
