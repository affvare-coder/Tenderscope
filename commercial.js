import {createMemberApi,escapeMemberText as h,quoteStatusMessage} from './commercial-api.mjs';
import {createBidDrafts} from './commercial-drafts.mjs';
const drafts=createBidDrafts();

const el=id=>document.getElementById(id);
const rpc=createMemberApi({getToken:sessionToken,getUserId:()=>AUTH.session?.user?.id});
const workspace={userId:null,rows:[],limit:10,notes:false,request:null,version:0,busy:false,operation:0,quoteDirty:false,quoteVersion:0};
const stages={watching:'Watching',preparing:'Preparing bid',submitted:'Submitted',skipped:'Not pursuing'};
const intentKey='tenderscope.member-intent.v1';
function rememberIntent(intent){try{sessionStorage.setItem(intentKey,JSON.stringify(intent));}catch{}}
function takeIntent(){try{const value=JSON.parse(sessionStorage.getItem(intentKey)||'null');sessionStorage.removeItem(intentKey);return value;}catch{return null;}}
function feedback(id,message,error=false){el(id).textContent=message;el(id).classList.toggle('error',error);}
function accountReady(kind,bid){
 if(AUTH.session?.user?.id)return true;
 rememberIntent({kind,bid});
 el('plansDialog').close();el('workspaceDialog').close();openAuth('signup');
 return false;
}
function resetWorkspace(){
 workspace.version++;workspace.operation++;workspace.busy=false;workspace.userId=AUTH.session?.user?.id||null;workspace.rows=[];workspace.request=null;workspace.notes=false;workspace.limit=10;workspace.quoteDirty=false;workspace.quoteVersion++;drafts.setOwner(workspace.userId);
 el('savedBidList').innerHTML='';el('quoteCompany').value='';el('quoteConsent').checked=false;el('quoteSector').value='all';el('quotePlan').value='pro';el('requestQuoteBtn').disabled=false;
 feedback('quoteFeedback','');feedback('workspaceFeedback','');
}
function renderWorkspace(){
 el('workspaceAccess').textContent=`${workspace.rows.length} saved · ${workspace.limit} bid limit${workspace.notes?' · Pro workspace':' · Free workspace'}`;
 el('savedBidList').innerHTML=workspace.rows.length?workspace.rows.map(saved=>{const row=drafts.display(saved);return `<article class="saved-bid" data-saved-row="${h(row.bid_number)}"><div class="saved-bid-heading"><div><span class="bid-no">${h(row.bid_number)}</span><h3>${h(row.title)}</h3><p class="section-note">${row.currently_open?'Open in current register':'Past or unavailable in current register'} · Recorded closing ${h(stamp(row.deadline))}</p></div>${row.currently_open?`<button class="btn ghost" type="button" data-open-saved="${h(row.bid_number)}">Open bid</button>`:''}</div><label>Bid stage<select data-saved-stage>${Object.entries(stages).map(([value,label])=>`<option value="${value}"${row.stage===value?' selected':''}>${label}</option>`).join('')}</select></label><label>Private bid notes${workspace.notes?'':' · Pro feature'}<textarea data-saved-note maxlength="2000" rows="3" ${workspace.notes?'':'readonly'} placeholder="Your follow-up, document checklist and next action">${h(row.note)}</textarea></label>${drafts.has(row.bid_number)?'<p class="commercial-feedback">Unsaved changes · choose Save changes to keep this update.</p>':''}<div class="saved-bid-actions"><button class="btn primary" type="button" data-update-saved="${h(row.bid_number)}">Save changes</button><button class="btn ghost" type="button" data-remove-saved="${h(row.bid_number)}">Remove from saved bids</button></div></article>`;}).join(''):'<div class="empty-card"><h3>Your next bid starts with a shortlist.</h3><p>Use Save bid on any opportunity to keep it in your account.</p></div>';
 el('quoteAccountHint').textContent=AUTH.access?.premium?`Your ${AUTH.access.reason==='subscription'?'subscription':'Pro trial'} is active${AUTH.access.reason==='trial'&&AUTH.access.trial_ends_at?' until '+stamp(AUTH.access.trial_ends_at):''}.`:'Free account: save 10 bids. Pro adds a larger workspace and private bid notes.';
 el('quoteForm').hidden=!AUTH.session;el('quoteSignin').hidden=!!AUTH.session;
 el('requestQuoteBtn').textContent='Request Pro quote';
 if(workspace.request){
  feedback('quoteFeedback',quoteStatusMessage(workspace.request));
 }
}
async function loadWorkspace({hydrateQuote=false}={}){
 const uid=AUTH.session?.user?.id;if(!uid)return;
 const version=++workspace.version;
 feedback('workspaceFeedback','Loading your saved bids…');
 const [saved,request]=await Promise.all([rpc('my_saved_bids'),rpc('my_pro_request')]);
 if(uid!==AUTH.session?.user?.id||version!==workspace.version)return;
 if(!Array.isArray(saved?.rows))throw new Error('Your saved-bid register could not be loaded.');
 workspace.rows=saved.rows;workspace.limit=saved.limit;workspace.notes=saved.private_notes===true;workspace.request=request;
 if(hydrateQuote&&!workspace.quoteDirty&&request){el('quoteCompany').value=request.company;el('quoteSector').value=request.sector;el('quotePlan').value=request.plan;}
 renderWorkspace();feedback('workspaceFeedback','Saved bids are private to your account.');
}
async function openWorkspace(){
 if(!accountReady('workspace'))return;
 el('plansDialog').close();if(!el('workspaceDialog').open)el('workspaceDialog').showModal();
 try{await loadWorkspace();}catch(error){feedback('workspaceFeedback',error.message,true);}
}
async function openPlans(){
 el('workspaceDialog').close();if(!el('plansDialog').open)el('plansDialog').showModal();
 renderWorkspace();
 if(AUTH.session)try{await loadWorkspace({hydrateQuote:true});}catch(error){feedback('quoteFeedback',error.message,true);}
}
async function saveBid(bid){
 if(!/^GEM\/\d{4}\/B\/\d+$/.test(bid||'')||!accountReady('save',bid))return;
 if(workspace.busy)return;workspace.busy=true;const operation=++workspace.operation;
 try{await rpc('save_my_bid',{p_bid_number:bid});toast('Bid saved to your account.');await loadWorkspace();}
 catch(error){toast(error.message);}
 finally{if(operation===workspace.operation)workspace.busy=false;}
}
document.addEventListener('click',async event=>{
 const action=event.target.closest('[data-commercial]');
 if(action){if(action.dataset.commercial==='plans')await openPlans();else await openWorkspace();return;}
 const save=event.target.closest('[data-save-bid]');if(save){await saveBid(save.dataset.saveBid);return;}
 const open=event.target.closest('[data-open-saved]');if(open){el('workspaceDialog').close();location.hash='bid='+encodeURIComponent(open.dataset.openSaved);return;}
 const update=event.target.closest('[data-update-saved]'),remove=event.target.closest('[data-remove-saved]');
 if(!(update||remove)||workspace.busy)return;
 workspace.busy=true;const uid=AUTH.session?.user?.id,operation=++workspace.operation;
 try{
  if(update){const row=update.closest('[data-saved-row]'),sent={stage:row.querySelector('[data-saved-stage]').value,note:row.querySelector('[data-saved-note]').value};const saved=await rpc('save_my_bid',{p_bid_number:update.dataset.updateSaved,p_stage:sent.stage,p_note:workspace.notes?sent.note:null});if(uid===AUTH.session?.user?.id)drafts.acknowledge(update.dataset.updateSaved,{stage:saved.stage,note:saved.note});}
  else {await rpc('remove_my_saved_bid',{p_bid_number:remove.dataset.removeSaved});if(uid===AUTH.session?.user?.id)drafts.drop(remove.dataset.removeSaved);}
  if(uid===AUTH.session?.user?.id)await loadWorkspace();
 }catch(error){feedback('workspaceFeedback',error.message,true);}
 finally{if(operation===workspace.operation)workspace.busy=false;}
});
el('closePlans').onclick=()=>el('plansDialog').close();el('closeWorkspace').onclick=()=>el('workspaceDialog').close();
el('quoteSigninBtn').onclick=()=>accountReady('plans');
el('quoteForm').onsubmit=async event=>{
 event.preventDefault();if(!accountReady('plans')||workspace.busy)return;
 workspace.busy=true;const operation=++workspace.operation,quoteVersion=workspace.quoteVersion;el('requestQuoteBtn').disabled=true;feedback('quoteFeedback','Saving your request…');
 try{
  const result=await rpc('request_pro_quote',{p_company:el('quoteCompany').value.trim(),p_sector:el('quoteSector').value,p_plan:el('quotePlan').value,p_contact_consent:el('quoteConsent').checked});
  workspace.request=result;
  feedback('quoteFeedback',quoteStatusMessage(result));
  if(quoteVersion===workspace.quoteVersion)workspace.quoteDirty=false;
  try{workspace.request=await rpc('my_pro_request');}catch{if(operation===workspace.operation)feedback('quoteFeedback','Your quote request is saved. Reopen Plans to refresh its status. No payment was collected.');}
 }catch(error){feedback('quoteFeedback',error.message,true);}
 finally{if(operation===workspace.operation){workspace.busy=false;el('requestQuoteBtn').disabled=false;}}
};
function captureChanges(event){
 const row=event.target.closest('[data-saved-row]');
 if(row){const values={stage:row.querySelector('[data-saved-stage]').value,note:row.querySelector('[data-saved-note]').value},saved=workspace.rows.find(x=>x.bid_number===row.dataset.savedRow);if(saved&&saved.stage===values.stage&&saved.note===values.note)drafts.drop(row.dataset.savedRow);else drafts.capture(row.dataset.savedRow,values);}
 if(event.target.closest('#quoteForm')){workspace.quoteDirty=true;workspace.quoteVersion++;}
}
document.addEventListener('input',captureChanges);
document.addEventListener('change',captureChanges);
window.addEventListener('tenderscope:account',()=>{
 const uid=AUTH.session?.user?.id||null;
 if(uid!==workspace.userId){resetWorkspace();if(!uid){el('workspaceDialog').close();el('plansDialog').close();}}
 renderWorkspace();
 if(uid){const intent=takeIntent();if(intent?.kind==='save')saveBid(intent.bid);else if(intent?.kind==='workspace')openWorkspace();else if(intent?.kind==='plans')openPlans();}
});
resetWorkspace();renderWorkspace();
if(AUTH.session){const intent=takeIntent();if(intent?.kind==='save')saveBid(intent.bid);else if(intent?.kind==='workspace')openWorkspace();else if(intent?.kind==='plans')openPlans();}

window.addEventListener('beforeunload',event=>{if(drafts.size||workspace.quoteDirty){event.preventDefault();event.returnValue='';}});
