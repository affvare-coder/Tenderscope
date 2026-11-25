import {readParentBidFields,readParentClauseEvidence} from './eligibility.mjs';
import {csvRows} from './products.mjs';
import {annotationLabel} from './attachment-roles.mjs';
import {fetchOfficialDocument} from './documents.mjs';
import {officialScheduleCount} from './official-count.mjs';
import {compareSchedule} from './schedule-pdf.mjs';
import {createGemClient} from './gem.mjs';
const clean=s=>s.replace(/\s+/g,' ').trim();
const key=s=>clean(s).toLowerCase();
const geom=t=>t.transform[5];
const pdfOptions=data=>({data,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true});

export async function checkParent(pdf,job,rows,pdfjs,facts={}) {
 if(pdf.numPages>24)return null;
 const all=[],sections=[],consignees=[],names=[],files=[],pages=[],textPages=[];
 for(let pg=1;pg<=pdf.numPages;pg++){
  const p=await pdf.getPage(pg);
  const ts=(await p.getTextContent()).items.filter(t=>t.str?.trim());
  if(!ts.length)return null;
  const strings=ts.map(t=>t.str.trim());const raw=strings.join(' ');
  if(pg===1&&!raw.toUpperCase().match(/GEM\/\d{4}\/B\/\d+/g)?.includes(job.bid))return null;
  textPages.push({page:pg,tokens:ts,unreadable:raw.length<80});
  for(const t of ts){
   const s=t.str.trim(),ref={s,pg,y:geom(t),x:t.transform[4]};
   if(/^\/Technical Specifications$/i.test(s))sections.push(ref);
   if(/^\/Consignees\/Reporting Officer and Quantity$/i.test(s))consignees.push(ref);
   if(rows.some(r=>key(s)===key(r.name)))names.push(ref);
   if(!/^\d+\s*\/\s*\d+$/.test(s))all.push(ref);
  }
  for(const a of await p.getAnnotations({intent:'display'})){
   const url=a.url||a.unsafeUrl;if(!url)continue;
   const label=annotationLabel(ts,a.rect);
   if(url===job.url || url===job.csv)files.push({url,label,pg,y:(a.rect[1]+a.rect[3])/2});
   else if(/uploaded_documents|buyer_documents|fileDownloadPath|showcorr|\.pdf([?#]|$)/i.test(url))return null;
  }
  pages.push(p);p.cleanup();
 }
 const {category,total,...header}=readParentBidFields(textPages.slice(0,5));
 Object.assign(facts,header);
 if(!textPages.some(p=>p.unreadable))Object.assign(facts,readParentClauseEvidence(textPages));
 if(sections.length!==rows.length || consignees.length!==rows.length || files.length!==2*rows.length)return null;
 const before=(a,b)=>a.pg<b.pg||a.pg===b.pg&&a.y>b.y;
 for(const [i,start] of sections.entries()){
  const stop=consignees[i];
  if(!before(start,stop)||i>0&&!before(consignees[i-1],start))return null;
  const header=names.filter(n=>before(n,start)).at(-1);
  if(!header||key(header.s)!==key(rows[i].name)||i>0&&!before(consignees[i-1],header))return null;
  const links=files.filter(f=>before(start,f)&&before(f,stop));
  if(!links.some(f=>f.url===job.csv&&/^BOQ Detail Document$/i.test(f.label))||!links.some(f=>f.url===job.url&&/^Specification Document$/i.test(f.label)))return null;
  const body=all.filter(t=>before(start,t)&&before(t,stop)&&t.y>30).map(t=>t.s).join(' ');
  // Only the standard reference-only section can be exhausted by these two files.
  if(clean(body)!=='Specification Document View File BOQ Detail Document View File Advisory-Please refer attached BOQ document for detailed consignee list and delivery period.')return null;
  rows[i].parent_page=start.pg;
 }
 // The parent independently assigns each quoted quantity and delivery period to a consignee.
 for(const [index,section] of consignees.entries()){
  const end=names.find(t=>before(section,t)) || all.find(t=>before(section,t)&&/Buyer Added Bid Specific Terms and Conditions$/i.test(t.s));
  if(!end)return null;
  const table=all.filter(t=>before(section,t)&&before(t,end)&&t.y>30);
  const serials=table.filter(t=>t.x<85 && /^\d+$/.test(t.s));
  if(serials.length!==1 || serials[0].s!=='1')return null;
  const values=table.filter(t=>t.pg===serials[0].pg && Math.abs(t.y-serials[0].y)<2).sort((a,b)=>a.x-b.x);
  if(values.length!==5 || !values[1].s || !values[2].s || Number(values[3].s)!==rows[index].quantity || values[4].s!==rows[index].delivery_days)return null;
  rows[index].consignee_location=values[2].s;
 }
 const start=all.filter(t=>/\/Buyer Added Bid Specific Terms and Conditions$/i.test(t.s));
 const stop=all.filter(t=>/^\/Disclaimer$/i.test(t.s));
 if(start.length!==1||stop.length!==1||!before(start[0],stop[0]))return null;
 const terms=all.filter(t=>before(start[0],t)&&before(t,stop[0])&&t.y>30 && !(t.pg===stop[0].pg&&Math.abs(t.y-stop[0].y)<3));
 if(terms.some(t=>/[\u0000-\u0008\ufffd]/.test(t.s)))return null;
 const common=clean(terms.map(t=>t.s).join(' '));
 if(common.length>15000 || !common.length || /as per (?:the )?(?:attached|annexure)|buyer uploaded|click here|as per drawing|as per sample/i.test(common))return null;
 const opNames=['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintFormXObjectBegin'];
 for(const pg of pages.slice(Math.max(0,sections[0].pg-1))){
  const ops=await pg.getOperatorList();if(ops.fnArray.some(op=>opNames.some(k=>pdfjs.OPS[k]===op)))return null;pg.cleanup();
 }
 return {common,atc_page:start[0].pg};
}

export function sourceReviewTransport({fetchImpl=fetch,withFetch=fn=>fn()}={}){
 const transport=signal=>(url,options={})=>fetchImpl(url,{
  ...options,signal:signal&&options.signal?AbortSignal.any([signal,options.signal]):signal||options.signal,
 });
 return {
  fetchDocument:(url,options)=>withFetch(signal=>fetchOfficialDocument(url,{...options,fetchImpl:transport(signal)})),
  async verifyLifecycle(job,url,lane,timeoutMs){
   try{
    return await withFetch(async signal=>{
     const gem=createGemClient({maxAttempts:1,requestTimeoutMs:timeoutMs,maxPagesPerLane:1,fetchImpl:transport(signal)});
     const {rows}=await gem.getPage({kind:'bid',status:'ongoing_bids',id:lane,term:job.bid},1);
     const listing=rows.find(r=>r.bid_number===job.bid&&r.bid_pdf_url===url&&Date.parse(r.closes_at)===Date.parse(job.deadline));
     if(listing&&Date.parse(listing.closes_at)>Date.now()&&await gem.hasNoPublicCorrigendum(listing.gem_id)){
      return {deadline:listing.closes_at,bid:listing.bid_number,corrigendum:'none',checked_at:new Date().toISOString()};
     }
     return null;
    });
   }catch{return null;}
  },
 };
}

export async function reviewSchedulePair(job,pdfjs,workerModule,{fetchDocument,verifyLifecycle}=sourceReviewTransport()){
 if(workerModule)globalThis.pdfjsWorker=workerModule;
 const documents=await Promise.allSettled([job.url,job.csv].map(url=>fetchDocument(url,{maxBytes:2500000,timeoutMs:8000})));
 const failed=documents.find(result=>result.status==='rejected');
 if(failed)throw failed.reason;
 const [spec,csv]=documents.map(result=>result.value);
 if(spec.content_hash!==job.sha||csv.content_hash!==job.csv_sha)return {error:'source_version_changed'};
 const n=officialScheduleCount(csv.bytes);if(!n)return {error:'official_count_unresolved'};
 const records=csvRows(new TextDecoder('utf-8',{fatal:true}).decode(csv.bytes));
 const pdf=await pdfjs.getDocument(pdfOptions(spec.bytes)).promise;
 let rows;
 try{
  if(pdf.numPages!==1)return {error:'multi_page_specification_pending'};
  const page=await pdf.getPage(1);const ops=await page.getOperatorList();
  if(ops.fnArray.some(x=>['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintFormXObjectBegin'].some(k=>pdfjs.OPS[k]===x)))return {error:'image_review_required'};
  rows=compareSchedule((await page.getTextContent()).items,records);
 }finally{await pdf.destroy();}
 if(!rows||n!==rows.length)return {error:'schedule_layout_or_cells_unresolved'};
 const data={sha:job.sha,csv:job.csv,csv_sha:job.csv_sha,rows,n,parent_sha:job.parent_sha};
 
 const main=await fetchDocument(job.parent,{maxBytes:4000000,timeoutMs:8000});
 if(main.content_hash!==job.parent_sha)return {error:'parent_version_changed'};
 const parent=await pdfjs.getDocument(pdfOptions(main.bytes)).promise;
 let proof;const facts={};try{proof=await checkParent(parent,job,rows,pdfjs,facts);}finally{await parent.destroy();}
 data.facts=facts;
 if(!proof||job.extra_files||rows.some(r=>r.question))return data;
 const lifecycle=await verifyLifecycle(job,job.parent,'linked-schedule',5500);
 if(lifecycle)data.proof={...proof,deadline:lifecycle.deadline,checked_at:lifecycle.checked_at};
 return data;
}
