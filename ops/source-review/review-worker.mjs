import {reviewSchedulePair} from './linked-schedule.mjs';
import {createGemClient} from './gem.mjs';
import {readBidFields} from './eligibility.mjs';
import {catalogueProof} from './catalogue.mjs';
import {officialScheduleCount} from './official-count.mjs';
import {documentKind,fetchOfficialDocument,isBidAttachment,officialDocumentUrl} from './documents.mjs';

export async function inspectParent(bytes,bid,pdfjs,workerModule){
 if(workerModule)globalThis.pdfjsWorker=workerModule;
 const pdf=await pdfjs.getDocument({data:bytes,disableFontFace:true,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false}).promise;
 const fields={},conflicts=new Set(),pages=[],links=new Set();
 try{
  // Larger bids keep their existing resumable extraction. Header facts can still be used.
  const complete=pdf.numPages<=16;
  for(let page=1;page<=(complete?pdf.numPages:Math.min(4,pdf.numPages));page++){
   const p=await pdf.getPage(page);
   const tokens=(await p.getTextContent()).items.filter(t=>t.str?.trim());
   const pageText=tokens.map(t=>t.str).join(' ');
   if(page===1&&!pageText.toUpperCase().match(/GEM\/\d{4}\/B\/\d+/g)?.includes(bid))throw Error('source_identity_mismatch');
   if(page<=5)for(const [key,f] of Object.entries(readBidFields(tokens,page))){
    if(fields[key]&&fields[key].value!==f.value)conflicts.add(key);else fields[key]=f;
   }
   for(const a of await p.getAnnotations({intent:'display'})){
    const u=a.url||a.unsafeUrl;if(!u)continue;
    if(isBidAttachment(u)||/uploaded|attach|specification|showcorr|corrigendum|\.pdf(?:$|[?#])/i.test(u))links.add(u);
   }
   // Exemption and purchase preference are separate provisions.
   for(const [key,re] of [
    ['undertaking',/[^.!?]{0,65}integrity pact[^.!?]{0,160}stamp paper[^.!?]{0,70}/i],
    ['precedence',/(?:ATC|additional terms and conditions)[^.!?]{0,70}(?:supersede|prevail over)[^.!?]{0,100}(?:specifications?|parameters)[^.!?]{0,70}/i],
    ['exemption',/[^.!?]{0,65}(?:traders?|resellers?)[^.!?]{0,65}(?:not eligible|ineligible|excluded)[^.!?]{0,95}(?:EMD exemption|exemption from EMD)[^.!?]{0,35}/i]
   ]){
    const match=re.exec(pageText);if(match&&!fields[key])fields[key]={value:match[0].trim(),quote:match[0].trim(),page,section:'Buyer wording'};
   }
   pages.push({page,tokens,unreadable:pageText.length<80});
   p.cleanup();
  }
  for(const key of conflicts)delete fields[key];
  let proof=complete?catalogueProof(pages,fields,[...links]):null;
  if(proof){
   // A drawing or scanned region can add mandatory parameters absent from text.
   for(const pg of pages){
    const p=await pdf.getPage(pg.page);
    const op=await p.getOperatorList();
    const imageTypes=['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintImageXObjectRepeat','paintFormXObjectBegin'];
    // Standard GeM letterhead images on the cover do not attest technical content there.
    if((pg.page!==1||pg.tokens.some(t=>/\/Technical Specifications/i.test(t.str)))&&op.fnArray.some(x=>imageTypes.some(k=>pdfjs.OPS[k]===x)))proof=null;
    p.cleanup();if(!proof)break;
   }
  }
  const {category,total,...facts}=fields;
  return {facts,proof,complete,links:[...links].filter(u=>officialDocumentUrl(u)&&isBidAttachment(u)).map(url=>({url,kind:documentKind(url)}))};
 }finally{await pdf.destroy();}
}

export async function scheduledSourceReview(db,pdfjs,workerModule,spare=false){
 const pair=await db.rpc('claim_bid_source_pair',{p_spare:spare});
 if(pair){
  let data;try{data=await reviewSchedulePair(pair,pdfjs,workerModule);}catch(e){data={error:String(e.message).slice(0,120)};}
  if(data.facts && Object.keys(data.facts).length)await db.rpc('record_bid_header_evidence',{p_id:pair.id,p_url:pair.parent,p_sha:pair.parent_sha,p_facts:data.facts});
  const outcome=await db.rpc('finish_bid_source_pair',{p_id:pair.id,p_url:pair.url,p_token:pair.token,p_data:data});
  return {status:'linked_schedule_review',bid:pair.bid,result:outcome};
 }
 const catalogue=await db.rpc('claim_catalogue_source',{p_spare:spare});
 const job=catalogue || (!spare && await db.rpc('claim_bid_source_review'));
 if(!job)return null;
 const args={p_id:job.id,p_url:job.url,p_token:job.token};
 let outcome;
 try {
  const file=await fetchOfficialDocument(job.url,{maxBytes:7000000,timeoutMs:10000});
  const data=job.kind==='boq'?{count:officialScheduleCount(file.bytes)}:await inspectParent(file.bytes,job.bid,pdfjs,workerModule);
  if(data.proof){
   try{
    const gem=createGemClient({maxAttempts:1,requestTimeoutMs:6500,maxPagesPerLane:1});
    const {rows}=await gem.getPage({kind:'bid',status:'ongoing_bids',id:'source-review',term:job.bid},1);
    const listing=rows.find(r=>r.bid_number===job.bid && r.bid_pdf_url===job.url && Date.parse(r.closes_at)===Date.parse(job.deadline));
    if(!listing || Date.parse(listing.closes_at)<=Date.now() || !await gem.hasNoPublicCorrigendum(listing.gem_id))data.proof=null;
    else data.lifecycle={deadline:listing.closes_at,bid:listing.bid_number,corrigendum:'none',checked_at:new Date().toISOString()};
   }catch{data.proof=null;}
  }
  outcome={...data,sha:file.content_hash};
 }catch(error){outcome={error:String(error.message).slice(0,160)};}
 return {status:'source_review',result:await db.rpc('finish_bid_source_review',{...args,p_data:outcome})};
}
