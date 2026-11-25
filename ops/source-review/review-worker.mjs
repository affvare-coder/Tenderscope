import {reviewSchedulePair,sourceReviewTransport} from './linked-schedule.mjs';
import {claimSourceReview,finishSourceReview,recordPairHeader} from './batch-worker.mjs';
import {readParentBidFields,readParentClauseEvidence} from './eligibility.mjs';
import {catalogueProof} from './catalogue.mjs';
import {officialScheduleCount} from './official-count.mjs';
import {documentKind,isBidAttachment,officialDocumentUrl} from './documents.mjs';

export async function inspectParent(bytes,bid,pdfjs,workerModule){
 if(workerModule)globalThis.pdfjsWorker=workerModule;
 const pdf=await pdfjs.getDocument({data:bytes,disableFontFace:true,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false}).promise;
 const pages=[],links=new Set();
 try{
  // Larger bids keep their existing resumable extraction. Header facts can still be used.
  const complete=pdf.numPages<=16;
  for(let page=1;page<=(complete?pdf.numPages:Math.min(4,pdf.numPages));page++){
   const p=await pdf.getPage(page);
   const tokens=(await p.getTextContent()).items.filter(t=>t.str?.trim());
   const pageText=tokens.map(t=>t.str).join(' ');
   if(page===1&&!pageText.toUpperCase().match(/GEM\/\d{4}\/B\/\d+/g)?.includes(bid))throw Error('source_identity_mismatch');
   for(const a of await p.getAnnotations({intent:'display'})){
    const u=a.url||a.unsafeUrl;if(!u)continue;
    if(isBidAttachment(u)||/uploaded|attach|specification|showcorr|corrigendum|\.pdf(?:$|[?#])/i.test(u))links.add(u);
   }
   pages.push({page,tokens,unreadable:pageText.length<80});
   p.cleanup();
  }
  const fields=readParentBidFields(pages.slice(0,5));
  if(complete && !pages.some(p=>p.unreadable))Object.assign(fields,readParentClauseEvidence(pages));
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

export async function loadSourceReview(job,pdfjs,workerModule,transportOptions){
 const {fetchDocument,verifyLifecycle}=sourceReviewTransport(transportOptions);
 try{
  if(job.paired)return await reviewSchedulePair(job,pdfjs,workerModule,{fetchDocument,verifyLifecycle});
  const file=await fetchDocument(job.url,{maxBytes:7000000,timeoutMs:10000});
  const data=job.kind==='boq'?{count:officialScheduleCount(file.bytes)}:await inspectParent(file.bytes,job.bid,pdfjs,workerModule);
  if(data.proof){
   const lifecycle=await verifyLifecycle(job,job.url,'source-review',6500);
   if(lifecycle)data.lifecycle=lifecycle;
   else data.proof=null;
  }
  return {...data,sha:file.content_hash};
 }catch(error){return {error:String(error.message).slice(0,job.paired?120:160)};}
}

export async function scheduledSourceReview(db,pdfjs,workerModule,spare=false){
 const job=await claimSourceReview(db,spare);
 if(!job)return null;
 const data=await loadSourceReview(job,pdfjs,workerModule);
 // Retain the existing header-publishing route for the single-job scheduler.
 await recordPairHeader(db,job,data);
 const result=await finishSourceReview(db,job,data);
 return job.paired?{status:'linked_schedule_review',bid:job.bid,result}:{status:'source_review',result};
}
