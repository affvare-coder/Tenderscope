import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function harness({offline=false}={}){
 const handlers={},writes=[],deleted=[];let fetches=0;
 const caches={open:async()=>({addAll:async()=>{},put:async(key)=>writes.push(key)}),match:async()=>new Response('old shell'),keys:async()=>['tenderscope-app-v1','tenderscope-app-v2','unrelated-cache'],delete:async key=>deleted.push(key)};
 const self={addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){},clients:{claim(){}}};
 vm.runInNewContext(source,{self,caches,URL,location:{origin:'https://tenderscope-healthcare.netlify.app'},fetch:async()=>{fetches++;if(offline)throw new Error('offline');return new Response('fresh shell');}});
 const event=request=>{let response;const work=[];return {request,respondWith:r=>response=r,waitUntil:r=>work.push(r),response:()=>response,done:()=>Promise.all(work)};};
 return {handlers,writes,deleted,event,fetches:()=>fetches};
}
test('service worker leaves live feeds, member responses and unknown URLs to the network',()=>{
 const h=harness();for(const [path,headers] of [['/api/public/rpc/public_tender_feed',{}],['/api/public/rpc/my_access',{Authorization:'Bearer member-token'}],['/index.html',{Authorization:'Bearer member-token'}],['/other-data',{}]]){
  const e=h.event(new Request('https://tenderscope-healthcare.netlify.app'+path,{headers}));h.handlers.fetch(e);assert.equal(e.response(),undefined);
 }assert.equal(h.writes.length,0);
});
test('static app assets use current network bytes and fall back only when offline',async()=>{
 const h=harness(),e=h.event(new Request('https://tenderscope-healthcare.netlify.app/app.js'));h.handlers.fetch(e);
 assert.equal(await (await e.response()).text(),'fresh shell');await e.done();assert.equal(h.writes.length,1);
 const offline=harness({offline:true}),fallback=offline.event(new Request('https://tenderscope-healthcare.netlify.app/app.js'));offline.handlers.fetch(fallback);assert.equal(await (await fallback.response()).text(),'old shell');assert.equal(offline.writes.length,0);
});
test('activation clears old TenderScope caches without removing other stored apps',async()=>{
 const h=harness(),e=h.event(null);h.handlers.activate(e);await e.done();assert.deepEqual(h.deleted,['tenderscope-app-v1']);
});
