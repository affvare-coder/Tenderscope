import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const context=vm.createContext({Intl,URL,Date,Map,console});
vm.runInContext(source.slice(0,source.indexOf('async function load('))+source.slice(source.indexOf('function sourceLink('),source.indexOf('function card(t)'))+source.slice(source.indexOf('function publicChange('),source.indexOf('function versionsPanel('))+'\nthis.timeline=timelinePanel;',context);
const base={detected_at:'2026-09-26T07:03:03Z',source_url:'https://bidplus.gem.gov.in/showbidDocument/9892782'};
test('large snapshot updates reveal only changed customer field names',()=>{
 const before={buyer:'Department of Military Affairs',title:'veh diagnostic board',search_text:'internal payload '.repeat(1000),reviewed_at:'old',source_uid:'9892782'};
 const after={...before,buyer:'Indian Army',reviewed_at:'new'};
 const html=context.timeline([{...base,event_code:'UPDATED',previous_value:before,new_value:after,summary:'internal full audit text'}]);
 assert.match(html,/Bid details changed/);assert.match(html,/<p>Buyer<\/p>/);assert(html.length<600);
 for(const text of ['search_text','internal payload','reviewed_at','9892782:','internal full audit text'])assert(!html.includes(text));
 assert.match(context.timeline([{...base,event_code:'UPDATED',previous_value:before,new_value:{...before,reviewed_at:'new'}}]),/No recent bid changes/);
});
test('extensions retain both IST dates and suppress duplicate date events',()=>{
 const event={...base,event_code:'EXTENDED',previous_value:'2026-09-23T09:30:00Z',new_value:'2026-10-01T09:30:00Z'};
 const html=context.timeline([event,{...event,event_code:'CLOSING_DATE_CHANGED'}]);
 assert.equal((html.match(/<li>/g)||[]).length,1);assert.match(html,/23 Sept 2026/);assert.match(html,/01 Oct 2026/);assert.match(html,/03:00 pm IST/);
});
test('only six concise relevant changes render and history starts collapsed',()=>{
 const events=Array.from({length:30},(_,i)=>({...base,event_code:'DOCUMENT_ADDED',detected_at:new Date(1789900000000+i*1000).toISOString(),new_value:{content_hash:'secret-internal-hash',title:'<script>bad</script>'}}));
 const html=context.timeline(events);assert.equal((html.match(/<li>/g)||[]).length,6);assert(!html.includes('secret-internal-hash'));assert(!html.includes('<script>'));
 assert.match(source,/<details><summary>Recent changes<\/summary>/);assert.match(source,/tender_events\?[^`]+&limit=24/);
});
