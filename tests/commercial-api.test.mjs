import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberApi,escapeMemberText,quoteStatusMessage} from '../commercial-api.mjs';

test('member requests require an account and send the current token without caching',async()=>{
 let id=null,seen;const rpc=createMemberApi({getUserId:()=>id,getToken:async()=>'current-token',fetchImpl:async(url,options)=>{seen={url,options};return Response.json({status:'pending'});}});
 await assert.rejects(rpc('my_saved_bids'),/Log in/);assert.equal(seen,undefined);
 id='member-a';await rpc('request_pro_quote',{p_company:'Clinic'});
 assert.equal(seen.url,'/api/public/rpc/request_pro_quote');assert.equal(seen.options.headers.Authorization,'Bearer current-token');assert.equal(seen.options.cache,'no-store');assert.equal(JSON.parse(seen.options.body).p_company,'Clinic');
});
test('switching account while refreshing the token prevents the write',async()=>{
 let id='member-a',called=false;const rpc=createMemberApi({getUserId:()=>id,getToken:async()=>{id='member-b';return 'other-token';},fetchImpl:async()=>{called=true;}});
 await assert.rejects(rpc('save_my_bid'),/account changed/);assert.equal(called,false);
});
test('a response belonging to a previous account is discarded',async()=>{
 let id='member-a',resolve;const rpc=createMemberApi({getUserId:()=>id,getToken:async()=>'token',fetchImpl:()=>new Promise(r=>resolve=r)});
 const pending=rpc('my_saved_bids');await new Promise(r=>setImmediate(r));id='member-b';resolve(Response.json({rows:[{note:'private previous account'}]}));await assert.rejects(pending,/account changed/);
});
test('server-side quota and entitlement failures remain visible',async()=>{
 const rpc=createMemberApi({getUserId:()=>'member-a',getToken:async()=>'token',fetchImpl:async()=>Response.json({message:'Private bid notes require Pro or an active trial'},{status:403})});
 await assert.rejects(rpc('save_my_bid'),/require Pro/);
});
test('private notes and company text are escaped before HTML rendering',()=>{
 const text=escapeMemberText('</textarea><img src=x onerror="bad()">');assert(!text.includes('<'));assert(text.includes('&lt;/textarea&gt;'));assert(text.includes('&quot;'));
});
test('quote status never reports a payment or subscriber entitlement',()=>{
 assert.match(quoteStatusMessage({status:'pending'}),/saved for review/);assert.match(quoteStatusMessage({status:'activated'}),/account access is shown separately/);assert.match(quoteStatusMessage({status:'pending'}),/No payment is collected/);assert.equal(quoteStatusMessage(null),'');
});
