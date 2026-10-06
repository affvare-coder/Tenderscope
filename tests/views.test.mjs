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
test('product panel shows only rows matching the current verified source hash',()=>{const item={name:'<script>unsafe</script>',source_url:'https://mkp.gem.gov.in/uploaded_documents/boq.csv',source_hash:'v1'};assert.match(productsPanel([item],[{official_url:item.source_url,availability:'available',content_hash:'v2'}]),/Read the official BOQ/);const html=productsPanel([item],[{official_url:item.source_url,availability:'available',content_hash:'v1'}]);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Not specified'));});


test('the reported extended bid remains in the Extended view with its current future closing time',()=>{
 const t={...bid,location_class:'NON_DELHI',is_extended:true,extension_count:1,previous_deadline:'2026-09-23T09:30:00Z',deadline:new Date(Date.now()+9*86400000).toISOString(),lifecycle_state:'ACTIVE'};
 assert.equal(matchesView(t,'extended'),true);assert.equal(matchesView({...t,is_extended:false,extension_count:0},'extended'),false);
});

test('new view follows publication time rather than discovery time',()=>{
 const t={...bid,location_class:'NON_DELHI',first_seen_at:new Date().toISOString(),published_at:new Date(Date.now()-2*86400000).toISOString()};
 assert.equal(matchesView(t,'new'),false);
 assert.equal(matchesView({...t,published_at:new Date(Date.now()-3600000).toISOString(),first_seen_at:'2020-01-01'},'new'),true);
 for(const published_at of [null,'invalid',new Date(Date.now()+3600000).toISOString()])assert.equal(matchesView({...t,published_at},'new'),false);
});
test('extensions stay out of new and expired bids stay out of every public view',()=>{
 const t={...bid,location_class:'NON_DELHI',published_at:new Date().toISOString(),is_extended:true};
 assert.equal(matchesView(t,'new'),false);assert.equal(matchesView(t,'extended'),true);
 for(const view of ['active','new','extended','dental','medical','watch'])assert.equal(matchesView({...t,deadline:'2020-01-01'},view),false);
});


test('96-hour view includes the full four-day publication window and excludes rediscovered old bids',()=>{
 const t={...bid,location_class:'NON_DELHI',first_seen_at:new Date().toISOString(),published_at:new Date(Date.now()-72*3600000).toISOString()};
 assert.equal(matchesView(t,'recent96'),true);assert.equal(matchesView(t,'new'),false);
 for(const published_at of [null,'invalid',new Date(Date.now()-97*3600000).toISOString(),new Date(Date.now()+3600000).toISOString()])assert.equal(matchesView({...t,published_at},'recent96'),false);
 assert.equal(matchesView({...t,is_extended:true},'recent96'),false);
 assert.equal(matchesView({...t,deadline:'2020-01-01'},'recent96'),false);
});
