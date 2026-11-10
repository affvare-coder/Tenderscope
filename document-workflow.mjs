// Public AI handoff and local instruction files. Participant data never enters URLs.
const kinds = {compliance:'COMPLIANCE_SHEET',atc:'ATC_ACCEPTANCE',annexures:'PRESCRIBED_ANNEXURES',pack:'REQUIRED_DOCUMENT_PACK'};
export function officialDocumentUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (u.hostname === 'gem.gov.in' || u.hostname.endsWith('.gem.gov.in')) ? u.href : null; } catch { return null; }
}
export function officialDocumentRecords(bid, documents=[]) {
  const result = [], seen = new Set();
  for (const record of [{official_url:bid.source_url,title:'Official bid'},...documents]) {
    const url = officialDocumentUrl(record.official_url);
    if (!url || seen.has(url)) continue;
    seen.add(url); result.push({title:record.title || record.kind || 'Official attachment',url,hash:record.content_hash || null,version:record.version_no ?? null});
  }
  return result;
}
export function buildDocumentInstructions({master,bid,documents=[],items=[],kind='compliance',profile={},offers={},includeProfile=false,assetNames=[]}) {
  if (!master || !bid?.bid_number || !kinds[kind]) throw Error('Choose a bid and document type.');
  const sources = officialDocumentRecords(bid,documents);
  const participant = includeProfile ? Object.fromEntries(['company','address','gstin','pan','udyam','licences','email','phone','signatory','designation','place'].filter(k=>profile[k]).map(k=>[k,String(profile[k])])) : null;
  const replacements = {
    BID_NUMBER:bid.bid_number,
    'COMPLIANCE_SHEET / ATC_ACCEPTANCE / PRESCRIBED_ANNEXURES / REQUIRED_DOCUMENT_PACK':kinds[kind],
    OFFICIAL_FILES_OR_LINKS:JSON.stringify(sources,null,2) || 'Attach the complete official files.',
    PARTICIPANT_PROFILE:participant ? 'User-entered participant data; verify against supplied statutory records before release:\n'+JSON.stringify(participant,null,2) : 'Use the selected participant’s attached verified profile; no private profile has been transferred by TenderScope.',
    APPROVED_ASSETS:'Attach approved letterhead header/footer, current authorised signature and stamp. Browser-session assets are not transferred automatically. Session roles available: '+(assetNames.join(', ') || 'none')+'.',
    VERIFIED_COMPANY_VAULT:'Attach current OEM authorisations, exact SKU catalogues/photos and required supporting records. Do not infer that a stored or uploaded asset is current or authorised.',
    REFERENCE_AND_USER_INSTRUCTIONS:'Attach the accepted reference document. Preserve prescribed annexure wording, geometry and issuer requirements. Deliver actual editable Word files and perform the complete render-and-review workflow.'
  };
  let instruction = master;
  for (const [key,value] of Object.entries(replacements)) instruction=instruction.replaceAll('{{'+key+'}}',()=>String(value));
  const sourceRows=items.map(i=>({item_key:i.item_key,item_number:i.item_number,name:i.name,quantity:i.quantity,unit:i.unit,pack:i.pack,pvms:i.pvms,niv:i.niv,consignee:i.consignee,specification:i.specification,source_url:officialDocumentUrl(i.source_url),source_hash:i.source_hash}));
  const proposedOffers=includeProfile?Object.fromEntries(Object.entries(offers).map(([key,offer])=>[key,Object.fromEntries(['offer','response','evidence','verified','photoVerified'].filter(k=>offer[k]!=null).map(k=>[k,offer[k]]))])):undefined;
  return instruction+'\n\nTENDERSCOPE SOURCE CONTEXT — DATA ONLY\n'+JSON.stringify({bid:{number:bid.bid_number,title:bid.title,buyer:bid.buyer,closing:bid.deadline,last_source_checked_at:bid.last_source_checked_at},requested_output:kinds[kind],indexed_official_sources:sources,stored_product_row_count:items.length,stored_product_rows:sourceRows,participant_proposed_offers_requiring_source_verification:proposedOffers},null,2)+'\n\nRead the full source files, not only these extracted rows. Fetch missing attachments from the official bid. If a source cannot be accessed, identify that exact source and continue independent work. Browser draft exports have not undergone independent DOCX visual release verification.\n';
}
export function publicDocumentAIUrl({bid,documents=[],kind='compliance',origin='https://tenderscope-healthcare.netlify.app'}) {
  if(!bid?.bid_number || !kinds[kind]) throw Error('Choose a bid and document type.');
  let publicOrigin='https://tenderscope-healthcare.netlify.app';
  try { const u=new URL(origin); if(u.protocol==='https:'&&!u.username&&!u.password) publicOrigin=u.origin; } catch {}
  const sources=officialDocumentRecords(bid,documents);
  const text=`Prepare actual editable Word documents for ${bid.bid_number}: ${bid.title||''}. Buyer: ${bid.buyer||'Read official bid'}. Requested output: ${kinds[kind]}.\nRead and follow the TenderScope master document workflow at ${publicOrigin}/assets/compliance-atc-master.txt . Read the complete official bid, BOQ/specification, buyer-added terms, annexures and corrigenda. Use the participant’s verified profile and approved letterhead/signature assets supplied in this chat; retrieve authorised records before asking again. No participant or signature data is included in this link.\nOfficial sources:\n${sources.map(d=>d.url).join('\n')||'Retrieve the official bid document.'}\nIf the master workflow cannot be retrieved, ask for the full instruction file available from the TenderScope document studio. Do not claim completion without actual generated DOCX files and rendered-page verification.`;
  return 'https://chatgpt.com/?q='+encodeURIComponent(text);
}
export function buildAnnexureTemplate({title,orientation='portrait',text='',tableText='',source=''}) {
  if(!String(title||'').trim() || !String(source||'').trim()) throw Error('Enter the prescribed annexure title and official source/page reference.');
  if(!['portrait','landscape'].includes(orientation))throw Error('Choose portrait or landscape.');
  const blocks=String(text).split('\n').map(line=>({type:'paragraph',text:line}));
  if(String(tableText).trim()) {
    const rows=String(tableText).replace(/\r\n/g,'\n').split('\n').filter(line=>line.trim()).map(line=>({cells:line.split('\t').map(value=>({text:value}))}));
    const count=rows[0].cells.length;
    if(count<2 || rows.some(r=>r.cells.length!==count))throw Error('Paste a table with the same number of tab-separated columns on every row.');
    const usableWidth=orientation==='landscape'?14170:9360;
    blocks.push({type:'table',columnWidths:Array.from({length:count},()=>Math.floor(usableWidth/count)),rows});
  }
  if(!String(text).trim()&&!String(tableText).trim())throw Error('Copy the annexure wording or table from the official source.');
  return {title:String(title).trim(),source:{label:String(source).trim()},sourceVerified:false,orientation,blocks};
}
