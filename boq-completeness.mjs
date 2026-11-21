import {isAnonymousScheduleLabel} from './product-quality.mjs';

// Pure completeness logic: no database schema changes, caches or writes.
// Never derive official expected count from already-extracted rows or bulk quantity.
const clean=v=>String(v??'').trim();
const unknown=v=>!clean(v)||/^(?:-|n\/?a|unknown|not specified|not extracted|pending|processing|tbd|see attachment)$/i.test(clean(v));
const officialUrl=v=>{
 try{
  const u=new URL(v);
  return u.protocol==='https:'&&(u.hostname==='gem.gov.in'||u.hostname.endsWith('.gem.gov.in'))&&!u.username&&!u.password;
 }catch{return false;}
};
const fingerprint=(url,hash)=>clean(url)+'\u0000'+clean(hash);
const validQty=v=>v!==null&&v!==undefined&&clean(v)!==''&&Number.isFinite(Number(v))&&Number(v)>0;
const countInt=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=100000;
// GeM references to an ATC/annexure are pointers to the specification, not
// the complete mandatory technical parameters.
const referenceOnly=v=>/^(?:as\s+per|refer\s+to|see)\s+(?:the\s+)?(?:specification|specifications|technical\s+specification|atc|buyer\s+added\s+terms?|annexure|attached\s+document)\b/i.test(clean(v));

// N must come from an independent original GeM bid/schedule count or BOQ count,
// with a verifiable source-page reference and an available matching file hash.
export function attachmentNotes(item){
 if(!item.spec_url)return [];
 return [
  item.buyer_condition && 'Buyer compliance condition: '+item.buyer_condition,
  item.source_question && 'Buyer clarification needed: '+item.source_question,
  Number.isInteger(item.spec_page) && 'Buyer specification, page '+item.spec_page+', row '+item.item_number
 ].filter(Boolean);
}

export function verifiedExpectedCount(evidence,documents=[]){
 if(!evidence||!countInt(evidence.count)||evidence.verified!==true
    ||!['official_bid_pdf','official_boq_csv'].includes(evidence.source_type)
    ||unknown(evidence.source_location)||!officialUrl(evidence.source_url)
    ||!clean(evidence.source_hash))return null;
 return documents.some(d=>d.availability==='available'&&d.official_url===evidence.source_url
  &&d.content_hash===evidence.source_hash&&officialUrl(d.official_url))?evidence.count:null;
}

// Matching a file hash proves source provenance, not that its specification text
// has been copied completely. Complete additionally requires an independently
// confirmed full-spec comparison for every verified row.
export function assessBoqCompleteness({items=[],documents=[],expectedCountEvidence=null}={}){
 const expected=verifiedExpectedCount(expectedCountEvidence,documents);
 const available=new Set(documents.filter(d=>d?.availability==='available'
  &&officialUrl(d.official_url)&&clean(d.content_hash)).map(d=>fingerprint(d.official_url,d.content_hash)));
 const seen=new Set(),issues=[],verified=[];
 let incomplete=0,anonymous=0,sourceMismatch=0,duplicate=0,specsUnconfirmed=0;
 for(const item of items){
  if(!item||item.is_current===false)continue;
  const key=clean(item.item_key)||clean(item.item_number);
  if(!key||seen.has(key)){duplicate++;incomplete++;continue;}
  seen.add(key);
  if(unknown(item.name)||isAnonymousScheduleLabel(item.name)){anonymous++;incomplete++;continue;}
  if(!officialUrl(item.source_url)||!clean(item.source_hash)||!available.has(fingerprint(item.source_url,item.source_hash))){
   sourceMismatch++;incomplete++;continue;
  }
  if(!validQty(item.quantity)||unknown(item.unit)||unknown(item.specification)||referenceOnly(item.specification)){incomplete++;continue;}
  // SHA-proven document association is not a full-text/specification proof.
  // No legacy row gets counted in K without an independent parameter check.
  if(item.source_question || (item.specification_verified!==true&&item.specs_verified!==true)){
   specsUnconfirmed++;incomplete++;continue;
  }
  verified.push(item);
 }
 const count=verified.length;
 const pendingReview=expectedCountEvidence?.full_review_pending===true;
 const complete=expected!==null&&count===expected&&incomplete===0&&specsUnconfirmed===0&&!pendingReview;
 if(pendingReview && count===expected)issues.push('The full attachment set still needs final reconciliation');
 const state=complete?'Complete':count===0?'Unverified':expected===null?'Extracted':'Partial';
 if(expected===null)issues.push('Official expected item count has not been independently verified');
 if(anonymous)issues.push(anonymous+' anonymous schedule label(s) lack product identity');
 if(sourceMismatch)issues.push(sourceMismatch+' row(s) do not match an available official document SHA');
 if(incomplete)issues.push(incomplete+' current row(s) are missing a valid identity, quantity, unit, specification or source');
 if(duplicate)issues.push(duplicate+' duplicate or missing item keys');
 if(specsUnconfirmed)issues.push(specsUnconfirmed+' row(s) have not had every specification parameter compared to the official source');
 if(expected!==null&&count!==expected)issues.push('Official count '+expected+' differs from '+count+' verified row(s)');
 const label=state==='Complete'?'Complete · '+count+' of '+expected:
   state==='Partial'?'Partial · '+count+' of '+expected+' items verified':
   state==='Extracted'?'Extracted · '+count+' verified item(s); total count pending':
   'Unverified · 0 of '+(expected??'?')+' items';
 return {state,expected_item_count:expected,verified_item_count:count,
  total_current_rows:items.filter(i=>i&&i.is_current!==false).length,
  specification_confirmed_count:count,ready:complete,issues,items:verified,label};
}
