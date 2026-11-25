import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(saved=null){
 const nodes=new Map();
 const get=id=>{if(['screenRefresh','headerStatus','exportBtn','syncStatus'].includes(id))return null;if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',open:false,scrollIntoView(){}});return nodes.get(id);};
 const storage=new Map(saved ? [['tenderscope.public-page.v3',JSON.stringify(saved)]] : []);
 const ctx=vm.createContext({Intl,URL,URLSearchParams,Date,Map,console,setTimeout,clearTimeout,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{getElementById:get,querySelectorAll:()=>[]}});
 vm.runInContext(source.slice(0,source.indexOf('function sourceLink('))+source.slice(source.indexOf('function render()'),source.indexOf('async function docs('))+`
 card=t=>t.bid_number;loadProductSummaries=()=>{};loadBuyerReviews=()=>{};openFromLocation=async()=>{};
 this.run=load;this.state=S;this.restore=restoreRegister;this.counts=kpis;this.render=render;this.page=turnPage;this.key=()=>feedParams().toString();
 `,ctx);
 return {ctx,get,storage};
}
const bid={id:'kept',published_at:new Date(Date.now()-3600000).toISOString(),bid_number:'GEM/2026/B/7945801',deadline:'2099-10-01T09:30:00Z',status:'published'};
const feed={rows:[bid],total:578,counts:{active:578,extended:70},categories:[]};
test('failed first load shows unavailable rather than a false zero',async()=>{
 const {ctx,get}=setup();vm.runInContext(`api=async()=>{throw new Error('timeout')};`,ctx);
 await ctx.run();ctx.counts();ctx.render();
 assert.equal(get('kpiLive').textContent,'—');assert.equal(get('resultCount').textContent,'Bid data unavailable');assert.equal(get('tenderList').innerHTML,'');
 assert.match(get('errorState').textContent,/does not mean there are no bids/);assert.equal(get('refreshBtn').disabled,false);
});
test('one feed request renders server totals without a monitor or removed DOM nodes',async()=>{
 const {ctx,get}=setup();ctx.feed=feed;vm.runInContext(`this.requests=[];api=async path=>{requests.push(path);return feed;};`,ctx);
 await ctx.run();assert.equal(ctx.state.all.length,1);assert.equal(ctx.state.loading,false);assert.equal(get('errorState').hidden,true);assert.equal(get('kpiLive').textContent,'578');assert.equal(ctx.requests.length,1);assert.match(ctx.requests[0],/public_tender_feed/);
});
test('failed refresh restores only the matching recent page with a stale notice',async()=>{
 const key=setup().ctx.key();const saved={key,savedAt:new Date().toISOString(),data:feed};const {ctx,get}=setup(saved);
 vm.runInContext(`api=async()=>{throw new Error('timeout')};`,ctx);
 await ctx.run();assert.equal(ctx.state.all[0].id,bid.id);assert.equal(get('kpiLive').textContent,'578');assert.match(get('errorState').textContent,/freshness is not confirmed/);
});
test('expired and differently filtered saved pages are not restored',()=>{
 const key=setup().ctx.key();const {ctx,get}=setup({key,savedAt:'2020-01-01T00:00:00Z',data:feed});assert.equal(ctx.restore(),false);
 const fresh=setup({key,savedAt:new Date().toISOString(),data:feed});fresh.get('searchInput').value='implant';assert.equal(fresh.ctx.restore(),false);
});
test('next page replaces rows and searches are sent to the server',async()=>{
 const {ctx,get}=setup();ctx.feed=feed;vm.runInContext(`this.requests=[];api=async path=>{requests.push(path);return {...feed,rows:[{...feed.rows[0],id:String(requests.length)}]};};`,ctx);
 await ctx.run();await ctx.page(1);assert.equal(ctx.state.all.length,1);assert.equal(ctx.state.all[0].id,'2');assert.match(ctx.requests[1],/p_offset=40/);
 get('searchInput').value='implant';ctx.state.pageOffset=0;await ctx.run();assert.match(ctx.requests[2],/p_search=implant/);
});
test('an older in-flight response cannot replace the newer search',async()=>{
 const {ctx,get}=setup();ctx.feed=feed;vm.runInContext(`this.pending=[];api=path=>new Promise(resolve=>pending.push({path,resolve}));`,ctx);
 const first=ctx.run();get('searchInput').value='implant';const next=ctx.run();ctx.pending[1].resolve({...feed,rows:[{...bid,id:'new'}]});await next;ctx.pending[0].resolve(feed);await first;assert.equal(ctx.state.all[0].id,'new');assert.equal(ctx.state.loading,false);
});
test('eligibility filters are sent to the feed and an older server cannot return unfiltered matches',async()=>{
 const {ctx,get,storage}=setup();
 get('raFilter').value='no'; get('turnoverFilter').value='gem'; get('evaluationFilter').value='item';
 ctx.feed=feed;
 vm.runInContext(`this.requests=[];api=async path=>{requests.push(path);return feed;};`,ctx);
 await ctx.run();
 assert.match(get('errorState').textContent,/Eligibility filters are temporarily unavailable/);
 assert.equal(ctx.state.all.length,0);
 ctx.feed={...feed,total:1,features:{eligibility_search:true,closed_watch:true}};
 await ctx.run();
 const {searchParams}=new URL(ctx.requests.at(-1),'https://example.test');
 const filters=Object.fromEntries(Object.entries(JSON.parse(searchParams.get('p_filters'))).filter(([,value])=>value));
 assert.deepEqual(filters,{ra:'no',turnover_method:'gem',evaluation:'item'});
 assert.equal(ctx.state.all.length,1);
 assert.equal(storage.size,0);
 vm.runInContext(`api=async()=>{throw new Error('timeout')};`,ctx);
 await ctx.run();
 assert.equal(ctx.state.all.length,0);
 assert.equal(get('resultCount').textContent,'Bid data unavailable');
});
test('closed search uses retained public rows, a server total, and a separate closing-window scope',async()=>{
 const {ctx,get}=setup();
 ctx.state.view='watch';
 ctx.state.sort='deadline';
 get('urgencyFilter').value='critical';
 get('searchInput').value='forceps';
 ctx.feed={...feed,total:47,counts:{watch:64,allopen:200},features:{eligibility_search:true,closed_watch:true},
   rows:[{...bid,deadline:new Date(Date.now()-3600000).toISOString(),lifecycle_state:'CLOSED_PENDING_VERIFICATION',location_class:'DELHI'}]};
 vm.runInContext(`this.requests=[];api=async path=>{requests.push(path);return feed;};`,ctx);
 await ctx.run();
 const {searchParams}=new URL(ctx.requests[0],'https://example.test');
 assert.equal(searchParams.get('p_view'),'watch');
 assert.equal(searchParams.get('p_search'),'forceps');
 assert.equal(JSON.parse(searchParams.get('p_filters')).urgency,'');
 assert.equal(ctx.state.all.length,1);
 assert.match(get('resultCount').textContent,/47 bids awaiting verification.*most recently closed first/);
 assert.equal(get('loadMoreBtn').hidden,false);
});
