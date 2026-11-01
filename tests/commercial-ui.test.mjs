import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createMemberApi,escapeMemberText,quoteStatusMessage} from '../commercial-api.mjs';
import {createBidDrafts} from '../commercial-drafts.mjs';

// Exercise the actual event handlers with a minimal DOM surface. This does not
// replace the live two-account browser acceptance required before launch.
function workspaceHarness(){
 const elements=new Map(),documentHandlers=new Map(),windowHandlers=new Map();
 const node=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,hidden:false,open:false,innerHTML:'',textContent:'',classList:{toggle(){}},close(){this.open=false;},showModal(){this.open=true;}});return elements.get(id);};
 const AUTH={session:{user:{id:'member-a'}},access:{premium:true,reason:'trial'}};
 const server={rows:[{bid_number:'GEM/2026/B/8181571',stage:'watching',note:'Original private note',title:'Medicines',deadline:'2026-11-01',currently_open:true}],notes:true,request:{company:'Stored Clinic',sector:'pharmaceutical',plan:'pro',status:'pending'}};
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const name=url.split('/').at(-1),args=JSON.parse(options.body);calls.push({name,args});
  if(name==='my_saved_bids')return Response.json({rows:server.rows,private_notes:server.notes,limit:server.notes?250:10});
  if(name==='my_pro_request'){if(server.quoteSaved&&server.failQuoteRefresh)throw new Error('Connection interrupted');return Response.json(server.request);}
  if(name==='request_pro_quote'){server.quoteSaved=true;server.request={company:args.p_company,sector:args.p_sector,plan:args.p_plan,status:'pending'};return Response.json({id:'fixture-request',status:'pending',plan:args.p_plan,payment_collected:false});}
  if(name==='save_my_bid'){const row=server.rows.find(x=>x.bid_number===args.p_bid_number);row.stage=args.p_stage??row.stage;if(args.p_note!==null&&args.p_note!==undefined)row.note=args.p_note;return Response.json(row);}
  throw new Error(`Unexpected RPC ${name}`);
 };
 const context=vm.createContext({AUTH,createMemberApi:options=>createMemberApi({...options,fetchImpl}),createBidDrafts,h:escapeMemberText,quoteStatusMessage,sessionToken:async()=>'fixture-token',stamp:value=>value,toast(){},openAuth(){},location:{hash:''},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{getElementById:node,addEventListener:(name,handler)=>documentHandlers.set(name,handler)},window:{addEventListener:(name,handler)=>windowHandlers.set(name,handler)}});
 const source=readFileSync(new URL('../commercial.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 const click=kind=>documentHandlers.get('click')({target:{closest:selector=>selector==='[data-commercial]'?{dataset:{commercial:kind}}:null}});
 const editBid=(stage,note)=>{
  const row={dataset:{savedRow:server.rows[0].bid_number},querySelector:selector=>({value:selector==='[data-saved-stage]'?stage:note})};
  documentHandlers.get('input')({target:{closest:selector=>selector==='[data-saved-row]'?row:null}});
  return row;
 };
 return {node,AUTH,server,calls,click,editBid,account:()=>windowHandlers.get('tenderscope:account')(),editQuote:()=>documentHandlers.get('input')({target:{closest:selector=>selector==='#quoteForm'?node('quoteForm'):null}}),submitQuote:()=>node('quoteForm').onsubmit({preventDefault(){}}),beforeUnload:()=>{let prevented=false;windowHandlers.get('beforeunload')({preventDefault(){prevented=true;}});return prevented;},update:row=>documentHandlers.get('click')({target:{closest:selector=>selector==='[data-update-saved]'?{dataset:{updateSaved:row.dataset.savedRow},closest:()=>row}:null}})};
}

test('actual workspace handlers preserve unsaved notes across token and register refresh, then clear them on account change',async()=>{
 const ui=workspaceHarness();await ui.click('workspace');
 ui.editBid('preparing','Request OEM authorisation <private>');assert.equal(ui.beforeUnload(),true);
 ui.account();assert.match(ui.node('savedBidList').innerHTML,/Request OEM authorisation &lt;private&gt;/);
 ui.server.rows[0].title='Updated official medicines';await ui.click('workspace');
 assert.match(ui.node('savedBidList').innerHTML,/Updated official medicines/);assert.match(ui.node('savedBidList').innerHTML,/Request OEM authorisation/);assert.match(ui.node('savedBidList').innerHTML,/value="preparing" selected/);
 ui.AUTH.session={user:{id:'member-b'}};ui.account();assert.doesNotMatch(ui.node('savedBidList').innerHTML,/Request OEM authorisation/);assert.equal(ui.beforeUnload(),false);
});

test('a quote draft survives account refresh and reopening Plans, and logout clears the company and consent',async()=>{
 const ui=workspaceHarness();await ui.click('plans');assert.equal(ui.node('quoteCompany').value,'Stored Clinic');
 ui.node('quoteCompany').value='New company draft';ui.node('quoteConsent').checked=true;ui.editQuote();ui.account();await ui.click('plans');
 assert.equal(ui.node('quoteCompany').value,'New company draft');assert.equal(ui.node('quoteConsent').checked,true);assert.equal(ui.beforeUnload(),true);
 ui.AUTH.session=null;ui.account();assert.equal(ui.node('quoteCompany').value,'');assert.equal(ui.node('quoteConsent').checked,false);assert.equal(ui.beforeUnload(),false);
});

test('trial expiry retains an unsaved note when the stage-only save cannot persist that note',async()=>{
 const ui=workspaceHarness();await ui.click('workspace');const row=ui.editBid('preparing','Keep this unsaved private note');
 ui.server.notes=false;await ui.click('workspace');await ui.update(row);
 assert.equal(ui.calls.find(x=>x.name==='save_my_bid').args.p_note,null);assert.equal(ui.server.rows[0].note,'Original private note');
 assert.match(ui.node('savedBidList').innerHTML,/Keep this unsaved private note/);assert.match(ui.node('savedBidList').innerHTML,/Unsaved changes/);assert.equal(ui.beforeUnload(),true);
});

test('a committed quote remains reported as saved when its optional status refresh loses connection',async()=>{
 const ui=workspaceHarness();await ui.click('plans');ui.node('quoteCompany').value='New Clinic';ui.node('quoteConsent').checked=true;ui.editQuote();ui.server.failQuoteRefresh=true;
 await ui.submitQuote();assert.equal(ui.server.quoteSaved,true);assert.match(ui.node('quoteFeedback').textContent,/quote request is saved/);assert.match(ui.node('quoteFeedback').textContent,/No payment/);assert.equal(ui.node('requestQuoteBtn').disabled,false);assert.equal(ui.beforeUnload(),false);
});
