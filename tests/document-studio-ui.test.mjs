import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PDFDocument,PDFTextField} from 'pdf-lib';
import {buildDocumentInstructions,publicDocumentAIUrl,buildAnnexureTemplate} from '../document-workflow.mjs';

const master=readFileSync(new URL('../assets/compliance-atc-master.txt',import.meta.url),'utf8');
const source=readFileSync(new URL('../document-studio.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const decode=s=>String(s||'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
function harness(){
 const nodes=new Map(),offers=new Map(),uploads=new Map(),assetUploads=new Map(),downloads=[],calls=[],blobs=new Map(),tabs=new Map();let copied='';
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,open:false,files:[],dataset:{},textContent:'',innerHTML:'',showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){},querySelector(){return null;},querySelectorAll(){return [];},getContext(){return {strokeRect(){},fillText(){}};}});return nodes.get(id);};
 const dialog=node('documentStudio');
 function parse(html){
  for(const m of html.matchAll(/<(input|select|textarea|iframe|a|button|small|canvas)[^>]*\bid="([^"]+)"[^>]*>/g)){const el=node(m[2]);el.value=decode(m[0].match(/\bvalue="([^"]*)"/)?.[1]);el.checked=/\bchecked(?:[ >])/.test(m[0]);el.type=m[0].match(/\btype="([^"]*)"/)?.[1]||'';}
  for(const m of html.matchAll(/<textarea[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))node(m[1]).value=decode(m[2]);
  tabs.clear();for(const key of ['overview','profile','compliance','annexure'])tabs.set(key,{dataset:{tab:key},attributes:{},classes:new Set(),setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(name,on){const b=tabs.get(key);if(on)b.classes.add(name);else b.classes.delete(name);}},click(){this.onclick?.();}});
  offers.clear();uploads.clear();assetUploads.clear();for(const key of ['header','footer','signature','stamp'])assetUploads.set(key,{dataset:{image:key},files:[]});
  const keys=[...html.matchAll(/data-product-photo="([^"]+)"/g)].map(m=>decode(m[1]));
  for(const key of keys){const values={};for(const field of ['offer','evidence','verified','photoVerified','response'])values[field]={dataset:{offerKey:key,offerField:field},value:field==='response'?'NEEDS REVIEW':'',checked:false,type:['verified','photoVerified'].includes(field)?'checkbox':'text',closest:()=>row};const status={textContent:''};const row={querySelector:selector=>selector==='[data-photo-status]'?status:values[selector.match(/data-offer-field="([^"]+)"/)?.[1]]};offers.set(key,values);uploads.set(key,{dataset:{productPhoto:key},files:[],closest:()=>row});}
 }
 let html='';Object.defineProperty(dialog,'innerHTML',{get:()=>html,set:v=>{html=v;parse(v);}});
 dialog.querySelectorAll=selector=>selector==='[data-tab]'?[...tabs.values()]:selector==='[data-image]'?[...assetUploads.values()]:selector==='[data-product-photo]'?[...uploads.values()]:[];
 dialog.querySelector=selector=>tabs.get(selector.match(/data-tab="([^"]+)"/)?.[1]);
 const document={getElementById:node,body:{append(){}},createElement:tag=>tag==='a'?{click(){downloads.push({name:this.download,data:blobs.get(this.href)});}}:dialog,querySelectorAll:selector=>selector.includes('data-offer-field')?[...offers.values()].flatMap(Object.values):[]};
 class BrowserURL extends URL{static createObjectURL(data){const id='blob:'+blobs.size;blobs.set(id,data);return id;}static revokeObjectURL(){}}
 const report=data=>{calls.push({kind:'verification',data});return {ready:false,status:'DRAFT_BLOCKED_NOT_FOR_UPLOAD',blockers:['Review pending']};};
 const renderer=kind=>async data=>{calls.push({kind,data});return new Blob(['fixture-draft']);};
 const context=vm.createContext({document,window:{},navigator:{clipboard:{writeText:async text=>{copied=text;}}},location:{origin:'https://tenderscope-healthcare.netlify.app'},URL:BrowserURL,Blob,crypto:webcrypto,Uint8Array,PDFDocument,PDFTextField,structuredClone,fetch:async()=>new Response(master),setTimeout(){},pdfjs:{GlobalWorkerOptions:{},getDocument(){return {promise:Promise.resolve({numPages:1,async destroy(){},async getPage(){return {getViewport:()=>({width:400,height:600}),render:()=>({promise:Promise.resolve(),cancel(){}}),getTextContent:async()=>({items:[]})};}})};}},verifiedItems:items=>items,complianceDocx:renderer('compliance'),compliancePdf:renderer('pdf'),fillAnnexures:renderer('overlay'),atcAcceptanceDocx:renderer('atc'),editableAnnexureDocx:renderer('annexure'),documentVerification:report,buildDocumentInstructions,publicDocumentAIUrl,buildAnnexureTemplate});
 vm.runInContext(source,context);
 const options=(overrides={})=>({userId:'member-a',bid:{id:'bid-a',bid_number:'GEM/2026/B/TEST',title:'Synthetic bid',buyer:'Synthetic buyer',source_url:'https://bidplus.gem.gov.in/showbidDocument/123'},items:[{item_key:'one',source_hash:'hash-a',name:'Test product',specification:'Full buyer specification',quantity:2}],documents:[{id:'doc-a',content_hash:'hash-a',version_no:1,kind:'ATC',official_url:'https://bidplus.gem.gov.in/a.pdf'}],...overrides});
 return {node,dialog,calls,downloads,offers,uploads,assetUploads,options,tab:key=>tabs.get(key),open:o=>context.window.TenderScopeDocs.open(o),clear:()=>context.window.TenderScopeDocs.clear(),click:id=>node(id).onclick(),copied:()=>copied};
}
const image=()=>({size:100,type:'image/png',arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer});
function completeProfile(ui){ui.node('studio_company').value='Private Fixture Company';ui.node('studio_signatory').value='Private Signatory';ui.node('studio_place').value='Fixture City';ui.node('studio_licences').value='Private licence 42';}

test('actual instruction handlers use supported kinds and exclude private profile by default and from all URLs',async()=>{
 const ui=harness();await ui.open(ui.options({tab:'annexure'}));completeProfile(ui);
 assert.equal(ui.node('studioAIKind').value,'atc');
 assert.doesNotMatch(decodeURIComponent(ui.node('studioOpenAI').href),/Private Fixture|Private licence|Private Signatory/);
 await ui.click('studioCopyInstructions');assert.match(ui.copied(),/Requested output: ATC_ACCEPTANCE/);assert.doesNotMatch(ui.copied(),/Private Fixture Company|Private licence 42/);
 ui.node('studioIncludeProfile').checked=true;await ui.click('studioDownloadInstructions');assert.match(await ui.downloads.at(-1).data.text(),/Private licence 42/);
 assert.doesNotMatch(decodeURIComponent(ui.node('studioOpenAI').href),/Private licence 42/);
});

test('photo proof and offer evidence survive reads; changing the offered model invalidates both proofs',async()=>{
 const ui=harness();await ui.open(ui.options());completeProfile(ui);
 const upload=ui.uploads.get('one');upload.files=[image()];await upload.onchange();
 const row=ui.offers.get('one');row.offer.value='Verified OEM / SKU / pack';row.evidence.value='Catalogue page 5';row.response.value='Yes';row.verified.checked=true;row.photoVerified.checked=true;
 await ui.click('studioDocx');const data=ui.calls.at(-1).data;assert.equal(data.offers.one.photo.bytes[0],137);assert.equal(data.offers.one.photoVerified,true);assert.equal(data.offers.one.verified,true);assert.equal(data.profile.place,'Fixture City');assert.equal(data.profile.licences,'Private licence 42');assert.equal(data.review.rendered,undefined);assert.equal(data.review.executionAuthorized,undefined);
 ui.dialog.oninput({target:row.offer});assert.equal(row.verified.checked,false);assert.equal(row.photoVerified.checked,false);
 await ui.click('studioDocx');assert.equal(ui.calls.at(-1).data.offers.one.photoVerified,false);
});

test('account switch and source hash change discard private images and offers, including late upload completion',async()=>{
 const ui=harness();await ui.open(ui.options());completeProfile(ui);let finish;
 const upload=ui.uploads.get('one');upload.files=[{...image(),arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})}];const pending=upload.onchange();
 await ui.open(ui.options({userId:'member-b'}));finish(new Uint8Array([137,80]).buffer);await pending;completeProfile(ui);await ui.click('studioDocx');assert.equal(ui.calls.at(-1).data.offers.one.photo,undefined);
 const next=ui.uploads.get('one');next.files=[image()];await next.onchange();ui.offers.get('one').offer.value='Private offer';
 await ui.open(ui.options({userId:'member-b',items:[{...ui.options().items[0],source_hash:'new-hash'}]}));completeProfile(ui);await ui.click('studioDocx');assert.equal(ui.calls.at(-1).data.offers.one.photo,undefined);assert.equal(ui.calls.at(-1).data.offers.one.offer,'');
});

test('ATC and annexure handlers keep exact content and source orientation and never assert rendered release',async()=>{
 const ui=harness();await ui.open(ui.options({tab:'annexure'}));completeProfile(ui);
 ui.node('studio_atcText').value='1. Exact buyer wording.\n2. Keep 45 days until amended.';ui.node('studio_atcSource').value='Official ATC pages 1–2';ui.node('studioATCVerified').checked=true;ui.node('studioAcceptance').checked=true;
 await ui.click('studioATCWord');const atc=ui.calls.at(-1).data;assert.equal(atc.clauses[0].text,ui.node('studio_atcText').value);assert.equal(atc.review.sourceVerified,true);assert.equal(atc.review.rendered,undefined);assert.equal(atc.review.executionAuthorized,undefined);
 ui.node('studio_annexureTitle').value='Annexure XII';ui.node('studio_annexureOrientation').value='landscape';ui.node('studio_annexureSource').value='Original page 12';ui.node('studio_annexureText').value='Exact undertaking for {{company}}';ui.node('studio_annexureTable').value='Column A\tColumn B\nFirst\tSecond';
 await ui.click('studioAnnexureWord');const annexure=ui.calls.at(-1).data;assert.equal(annexure.template.orientation,'landscape');assert.equal(annexure.template.blocks.at(-1).rows[1].cells[1].text,'Second');assert.equal(annexure.review.rendered,undefined);assert.equal(annexure.review.executionAuthorized,undefined);
 ui.dialog.oninput({target:{id:'studio_atcText'}});assert.equal(ui.node('studioATCVerified').checked,false);assert.equal(ui.node('studioAcceptance').checked,false);
});

test('image-only ATC page extraction is withheld instead of inventing source wording',async()=>{
 const ui=harness();await ui.open(ui.options());const pdf=await PDFDocument.create();pdf.addPage([400,600]);const bytes=await pdf.save();ui.node('studioPdf').files=[{name:'official-atc.pdf',arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}];await ui.node('studioPdf').onchange();ui.node('studio_atcPages').value='1';await ui.click('studioExtractATC');assert.match(ui.node('studioStatus').textContent,/no extractable text/);assert.equal(ui.node('studio_atcText').value,'');assert.equal(ui.node('studioATCVerified').checked,false);
});


test('tab selection exposes the active panel and expands the AI brief only for overview',async()=>{
 const ui=harness();await ui.open(ui.options());assert.equal(ui.node('studioAIBrief').open,false);assert.equal(ui.tab('profile').attributes['aria-pressed'],'true');assert.equal(ui.tab('profile').classes.has('active'),true);assert.equal(ui.node('studio_profile').hidden,false);
 ui.tab('overview').click();assert.equal(ui.node('studioAIBrief').open,true);assert.equal(ui.tab('overview').attributes['aria-pressed'],'true');assert.equal(ui.tab('profile').attributes['aria-pressed'],'false');assert.equal(ui.node('studio_overview').hidden,false);
 await ui.click('studioCopyInstructions');assert.match(ui.copied(),/Requested output: COMPLIANCE_SHEET/);
 ui.tab('annexure').click();assert.equal(ui.node('studioAIBrief').open,false);assert.equal(ui.node('studio_annexure').hidden,false);assert.equal(ui.tab('annexure').attributes['aria-controls'],'studio_annexure');assert.equal(ui.tab('overview').classes.has('active'),false);
});
