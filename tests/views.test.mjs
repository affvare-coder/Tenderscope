import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const context=vm.createContext({Intl,URL,Date,Map,console});
vm.runInContext(source.slice(0,source.indexOf('async function load('))+source.slice(source.indexOf('function sourceLink('),source.indexOf('function card(t)'))+'\nthis.f={matchesView,productsPanel,productPreview};',context);
const {matchesView,productsPanel}=context.f;
const bid={id:'1',bid_number:'GEM/2026/B/123',deadline:new Date(Date.now()+86400000).toISOString(),status:'published',location_class:'DELHI'};
test('Delhi stays out of default feeds and is available in Delhi view',()=>{assert.equal(matchesView(bid,'active'),false);assert.equal(matchesView(bid,'delhi'),true);});
test('mixed Delhi bid appears in both dedicated views under the same ID',()=>{const mixed={...bid,location_class:'MULTI_LOCATION',location_includes_delhi:true};assert.equal(matchesView(mixed,'delhi'),true);assert.equal(matchesView(mixed,'multi'),true);assert.equal(matchesView(mixed,'active'),true);});
test('unknown location remains discoverable and closed Delhi bids are not shown as active',()=>{assert.equal(matchesView({...bid,location_class:'UNKNOWN'},'active'),true);assert.equal(matchesView({...bid,deadline:'2020-01-01'},'delhi'),false);});
test('product panel shows only rows matching the current verified source hash',()=>{const item={name:'<script>unsafe</script>',source_url:'https://mkp.gem.gov.in/uploaded_documents/boq.csv',source_hash:'v1'};assert.match(productsPanel([item],[{official_url:item.source_url,availability:'available',content_hash:'v2'}]),/Products processing/);const html=productsPanel([item],[{official_url:item.source_url,availability:'available',content_hash:'v1'}]);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Not specified'));});


test('the reported extended bid remains in the Extended view with its current future closing time',()=>{
 const t={...bid,location_class:'NON_DELHI',is_extended:true,extension_count:1,previous_deadline:'2026-09-23T09:30:00Z',deadline:new Date(Date.now()+9*86400000).toISOString(),lifecycle_state:'ACTIVE'};
 assert.equal(matchesView(t,'extended'),true);assert.equal(matchesView({...t,is_extended:false,extension_count:0},'extended'),false);
});
test('screen refresh updates an already open bid and invalidates stale document data',async()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{open:id==='bidDialog',hidden:false,disabled:false,textContent:''});return nodes.get(id);};
 const ctx=vm.createContext({Intl,URL,Date,Map,console,document:{getElementById:get}});
 const loadSource=source.slice(source.indexOf('async function load('),source.indexOf('function renderHealth('));
 vm.runInContext(source.slice(0,source.indexOf('async function load('))+loadSource+`
 this.reopened=[];this.fresh={id:'selected',bid_number:'GEM/2026/B/7945801',deadline:'2099-10-01T09:30:00Z',status:'published'};
 byId=id=>S.all.find(t=>t.id===id);pages=async()=>[fresh];api=async()=>({});categories=()=>{};kpis=()=>{};filter=()=>{};loadProductSummaries=()=>{};renderHealth=()=>{};
 openBid=async(id,options)=>reopened.push({id,options,deadline:S.all.find(t=>t.id===id).deadline});
 openFromLocation=async()=>{throw new Error('must refresh the existing dialog')};
 S.selected={id:'selected',deadline:'2026-09-23T09:30:00Z'};S.docs.set('selected',[{content_hash:'old'}]);
 this.run=load;this.state=S;`,ctx);
 await ctx.run({quiet:true});assert.equal(ctx.reopened.length,1);assert.equal(ctx.reopened[0].deadline,'2099-10-01T09:30:00Z');assert.equal(ctx.reopened[0].options.preserveView,true);assert.equal(ctx.state.docs.size,0);assert.equal(ctx.state.loading,false);
});
