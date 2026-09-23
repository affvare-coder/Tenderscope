import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(saved=null){
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',open:false});return nodes.get(id);};
 const storage=new Map(saved ? [['tenderscope.public-register.v1',JSON.stringify(saved)]] : []);
 const ctx=vm.createContext({Intl,URL,Date,Map,console,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{getElementById:get,querySelectorAll:()=>[]}});
 vm.runInContext(source.slice(0,source.indexOf('function renderHealth('))+source.slice(source.indexOf('function kpis('),source.indexOf('function filter('))+source.slice(source.indexOf('function render()'),source.indexOf('async function docs('))+`
 categories=()=>{};filter=()=>{};loadProductSummaries=()=>{};renderHealth=()=>{};openFromLocation=async()=>{};
 this.run=load;this.state=S;this.restore=restoreRegister;this.counts=kpis;this.render=render;
 `,ctx);
 return {ctx,get,storage};
}
const bid={id:'kept',bid_number:'GEM/2026/B/7945801',deadline:'2099-10-01T09:30:00Z',status:'published'};
test('failed first load shows unavailable, never zero bids, even after switching a view',async()=>{
 const {ctx,get}=setup();vm.runInContext(`pages=async()=>{throw new Error('timeout')};api=async()=>({});`,ctx);
 await ctx.run();ctx.counts();ctx.render();
 assert.equal(get('kpiLive').textContent,'—');assert.equal(get('resultCount').textContent,'Bid data unavailable');assert.equal(get('tenderList').innerHTML,'');
 assert.match(get('errorState').textContent,/does not mean there are no bids/);assert.equal(get('refreshBtn').disabled,false);
});
test('a slow health check does not delay successfully loaded bids',async()=>{
 const {ctx,get}=setup();ctx.bid=bid;vm.runInContext(`pages=async()=>[bid];api=()=>new Promise(()=>{});`,ctx);
 await ctx.run();assert.equal(ctx.state.all.length,1);assert.equal(ctx.state.loading,false);assert.equal(get('errorState').hidden,true);
});
test('a failed refresh restores the recent public register with an explicit stale notice',async()=>{
 const saved={savedAt:new Date().toISOString(),rows:[bid]};const {ctx,get}=setup(saved);
 vm.runInContext(`pages=async()=>{throw new Error('timeout')};api=async()=>({});`,ctx);
 await ctx.run();assert.equal(ctx.state.all[0].id,bid.id);assert.equal(get('kpiLive').textContent,'1');assert.match(get('errorState').textContent,/freshness is not confirmed/);
});
test('expired saved registers are not presented as current records',()=>{
 const {ctx}=setup({savedAt:'2020-01-01T00:00:00Z',rows:[bid]});assert.equal(ctx.restore(),false);assert.equal(ctx.state.loaded,false);
});
