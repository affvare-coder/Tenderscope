import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(){
 const ctx=vm.createContext({Intl,URL,URLSearchParams,Date,Map,console});
 vm.runInContext(source.slice(0,source.indexOf('async function load('))+source.slice(source.indexOf('function sourceLink('),source.indexOf('function card(t)'))+'\nthis.state=S;this.preview=productPreview;this.panel=productsPanel;this.summaries=loadProductSummaries;',ctx);
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
