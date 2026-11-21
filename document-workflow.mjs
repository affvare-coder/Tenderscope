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
  const sourceRows=items.map(i=>({item_key:i.item_key,item_number:i.item_number,name:i.name,quantity:i.quantity,unit:i.unit,pack:i.pack,pvms:i.pvms,niv:i.niv,consignee:i.consignee,boq_specification:i.boq_specification,specification:i.specification,spec_sha:i.spec_sha,buyer_condition:i.buyer_condition,buyer_nomenclature:i.buyer_nomenclature,source_question:i.source_question,spec_page:i.spec_page,spec_url:officialDocumentUrl(i.spec_url),source_url:officialDocumentUrl(i.source_url),source_hash:i.source_hash}));
  const proposedOffers=includeProfile?Object.fromEntries(Object.entries(offers).map(([key,offer])=>[key,Object.fromEntries(['offer','response','evidence','verified','photoVerified'].filter(k=>offer[k]!=null).map(k=>[k,offer[k]]))])):undefined;
  return instruction+'\n\nTENDERSCOPE SOURCE CONTEXT — DATA ONLY\n'+JSON.stringify({bid:{number:bid.bid_number,title:bid.title,buyer:bid.buyer,closing:bid.deadline,last_source_checked_at:bid.last_source_checked_at},requested_output:kinds[kind],indexed_official_sources:sources,stored_product_row_count:items.length,stored_product_rows:sourceRows,participant_proposed_offers_requiring_source_verification:proposedOffers},null,2)+'\n\nRead the full source files, not only these extracted rows. Fetch missing attachments from the official bid. If a source cannot be accessed, identify that exact source and continue independent work. Browser draft exports have not undergone independent DOCX visual release verification.\n';
}
export function publicDocumentAIUrl({bid,documents=[],kind='compliance',origin='https://tenderscope-healthcare.netlify.app'}) {
  if(!bid?.bid_number || !kinds[kind]) throw Error('Choose a bid and document type.');
  let publicOrigin='https://tenderscope-healthcare.netlify.app';
  try { const u=new URL(origin); if(u.protocol==='https:'&&!u.username&&!u.password) publicOrigin=u.origin; } catch {}
  const sources=officialDocumentRecords(bid,documents);
  const text=`Prepare actual editable Word documents for ${bid.bid_number}: ${bid.title||''}. Buyer: ${bid.buyer||'Read official bid'}. Requested output: ${kinds[kind]}.\nRead and follow the TenderScope master document workflow at ${publicOrigin}/assets/compliance-atc-master.txt . Read the complete official bid, BOQ/specification, buyer-added terms, annexures and corrigenda. Open every View Specification link inside the bid. Reconcile both sources for each row. Research each exact OEM model against the linked PDF and embed its verified catalogue photograph in the corresponding editable Word row. Use the participant’s verified profile and approved letterhead/signature assets supplied in this chat; retrieve authorised records before asking again. No participant or signature data is included in this link.\nOfficial sources:\n${sources.map(d=>d.url).join('\n')||'Retrieve the official bid document.'}\nIf the master workflow cannot be retrieved, ask for the full instruction file available from the TenderScope document studio. Do not claim completion without actual generated DOCX files and rendered-page verification.`;
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


// Bid-first, participant-neutral handoff. Public GeM metadata only: do not put bidder
// profiles, notes, signatures, account details or product selections in URL parameters.
export const BID_AI_ACTIONS=Object.freeze([
  {id:'oem',label:'Find matching OEMs',hint:'Exact products, models, packs and specification evidence'},
  {id:'suppliers',label:'OEM contacts & email',hint:'Verified business contacts and a document-request draft'},
  {id:'documents',label:'Compliance & annexures',hint:'Editable Word files in the buyer’s prescribed format'},
  {id:'review',label:'Clarification & representation',hint:'Check restrictive terms and prepare the supported response'}
]);
// Existing focused prompts remain available without competing with the four main tasks.
export const BID_AI_SECONDARY_ACTIONS=Object.freeze([
  {id:'compliance',label:'Make compliance sheet',hint:'Exact BOQ specs and evidence-supported responses'},
  {id:'atc',label:'Prepare ATC & annexures',hint:'Exact buyer terms and prescribed editable forms'},
  {id:'restrictions',label:'Analyze restrictive clauses',hint:'Evidence, practical impact and buyer justifications'},
  {id:'clarification',label:'Draft clarification',hint:'Clear, specific questions for the buyer'},
  {id:'representation',label:'Draft representation',hint:'Respectful, evidence-backed request for reconsideration'}
]);
const BID_ACTION_GUIDANCE={
  compliance:[
    'Produce actual editable A4 Word compliance sheet(s), not a generic outline; use the master instructions at https://tenderscope-healthcare.netlify.app/assets/compliance-atc-master.txt.',
    'Reconcile every BOQ row and full buyer specification verbatim, exact quantity, unit, pack, source pages and any corrigendum. For each item research eligible OEMs, exact model/SKU, matching catalogue and product photo, evidence and stated deviations. Label missing evidence; never mark Yes solely because a product appears similar.',
    'Only personalise the final output from a participant profile and letterhead actually available in this ChatGPT conversation. Do not assume any company, brand, signatory or authorisation.',
    'Deliver editable DOCX with a rendered-page verification; explain exact missing items/files rather than inventing them.'
  ],
  oem:[
    'Give the item-wise matrix first: exact buyer specification and quantity, proposed OEM/model/SKU, EXACT / PROBABLE / PARTIAL / UNVERIFIED match, parameter-by-parameter evidence, source links, HSN with classification confidence, OEM address and verified Indian contact (phone/email/WhatsApp only if published and confirmed).',
    'Check manufacturer catalogues and authoritative company sources. Compare every mandatory parameter, tolerance, size and pack; a close product is not an exact match. Do not invent contacts, SKUs, HSN, photographs or authorisation. No generic bid summary.'
  ],
  restrictions:[
    'Read the full current bid, BOQ, specification, buyer ATC, corrigenda and any official clarification; extract each potentially restrictive clause verbatim with exact source file, section/page, affected item(s) and operative wording.',
    'Explain the practical competition impact and any legitimate buyer justification. Distinguish safety, interoperability, licensing and genuine performance requirements from potentially avoidable brand lock-in, arbitrary eligibility, excessive samples, disproportionate authorisation or documentation requirements.',
    'Where legally relevant, check CURRENT GeM GTC, GFR, DPIIT Make in India orders, applicable MSE policies and buyer instructions against authoritative official sources. Give the exact applicable clause, document version/date and link; never assert illegality or guaranteed relief without support.',
    'Return a short issue table rated HIGH / MEDIUM / LOW with evidence, missing facts, buyer counterarguments, and whether a neutral clarification or a formal representation is justified. If no supported restrictive condition is established, say so. Do not fabricate objections.'
  ],
  clarification:[
    'Identify ambiguities, missing dimensions, conflicting buyer specifications or corrigenda and material eligibility uncertainty. Quote each exact clause/item with file/page; distinguish a factual clarification from a requested change.',
    'Draft a concise respectful GeM buyer clarification with numbered, answerable questions and proposed objective acceptance criteria or equivalent standards only where technically justified.',
    'Keep bid number and current deadline visible, flag unanswered questions and avoid unsupported legal accusations. Do not presume a bidder company or claim a clarification was submitted.'
  ],
  representation:[
    'Before writing, analyze alleged restrictive clauses from actual current sources, their pages, practical impact, technical alternatives, possible legitimate buyer justifications, tender timeline and current applicable procurement rules. If evidence is insufficient, list it and draft a neutral clarification instead of a baseless allegation.',
    'If a representation is justified, draft a short, persuasive, respectful buyer-addressed representation in official human language: exact clause/schedule, evidence, proportionate reason for reconsideration, objective alternative wording, fair-competition rationale and a specific requested relief. Respect technical safety and buyer discretion.',
    'Check every legal or policy citation against current authoritative government text, quote accurately, and flag uncertainty. Do not allege mala fides, discrimination or violation as an established fact without proof.',
    'Output an editable DOCX representation and plain text preview if source and participant facts permit; otherwise provide a clearly marked draft with blanks. Never invent bidder name, representative signature, evidence, approval, filing or response.'
  ],
  atc:[
    'Prepare an editable Word ATC acceptance and the separate prescribed annexure files actually required by this bid, following https://tenderscope-healthcare.netlify.app/assets/compliance-atc-master.txt.',
    'Reproduce current buyer ATC and annexure language, numbering, tables, orientation and corrigendum amendments faithfully. Map every authorised participant field only from verified records; maintain issuer-only and signature-only blanks.',
    'Do not provide unconditional acceptance where an unresolved conflict/deviation exists. Render and compare each final DOCX page with the original source and report outstanding blockers.'
  ]
};
BID_ACTION_GUIDANCE.suppliers=[
  'Read each official item and full specification before identifying an OEM or authorised supplier. Start with a concise item-wise contact matrix: item, exact model/SKU and pack, match evidence, company/address, verified Indian business phone/email and source link. Include WhatsApp only when the company explicitly publishes it as WhatsApp; do not infer it from a mobile number.',
  'Use manufacturer websites, catalogues and verified company sources. Separate manufacturer, authorised distributor and unverified reseller; name the evidence and date checked for every claimed contact or authorisation. Mark unavailable contacts rather than inventing them or using personal contact data.',
  'Then draft a short supplier email naming this bid, closing date, quantities, specification/pack, delivery location when verified and requested quotation validity. Request only relevant records: catalogue and exact product/pack photographs, OEM authorisation, applicable licences/certifications, MII/local-content evidence and supply lead time. Do not make an unsupported compliance declaration.',
  'Provide the email subject, body and verified intended business recipient for review. Do not send an email, contact a supplier, imply a quotation was received or claim an authorisation exists. Ask only for indispensable missing commercial details.'
];
BID_ACTION_GUIDANCE.documents=[
  'Prepare the bid-required document set: item-wise compliance sheet, ATC acceptance and each buyer-prescribed annexure actually required. First identify the required files from the current official source; do not invent annexures.',
  ...BID_ACTION_GUIDANCE.compliance,
  ...BID_ACTION_GUIDANCE.atc
];
BID_ACTION_GUIDANCE.review=[
  ...BID_ACTION_GUIDANCE.restrictions,
  'Choose the supported response after the evidence review: use clarification for ambiguous or conflicting requirements, representation for a substantiated request to reconsider a condition, or state that no supported objection was found. Do not draft allegations merely to fill a template.',
  'If evidence is insufficient for a representation, draft only a concise clarification with numbered, answerable questions, exact source clauses/pages and any technically justified objective acceptance criteria. Do not imply that a requested change is already allowed.',
  'If a representation is justified, draft a short, respectful buyer-addressed letter identifying the exact condition, evidence, practical impact, buyer counterarguments, proportionate alternative and specific relief. Verify legal citations against current authoritative government text. Do not promise acceptance or allege wrongdoing without proof.',
  'Provide the appropriate editable DOCX and a plain text preview when source and verified participant facts permit; otherwise mark it as a draft with indispensable blanks. Never invent bidder name, signature, approval, filing or buyer response. Do not produce multiple competing letters unless the user requests them.'
];
export function buildBidActionPrompt({bid,documents=[],items=[],action='restrictions'}) {
  if(!bid?.bid_number || !Object.prototype.hasOwnProperty.call(BID_ACTION_GUIDANCE,action))throw Error('Select a valid GeM bid and action.');
  const sources=officialDocumentRecords(bid,documents);
  // Keep links intact and URLs short; the bid itself always provides the entry point.
  const chosen=[];let linkBudget=0;
  for(const source of sources){
    if(chosen.length>=10 || linkBudget+source.url.length>4800)break;
    chosen.push(source);linkBudget+=source.url.length;
  }
  const rows=(Array.isArray(items)?items:[]).slice(0,7).map(i=>
    String(i.item_number||i.item_key||'?')+'. '+String(i.name||'Unnamed row').slice(0,90)
      +' | qty '+String(i.quantity??'unknown')+' '+String(i.unit||'')
      +(i.spec_url&&i.spec_page?' | Buyer PDF p. '+i.spec_page+' (excerpt): '+String(i.specification||'').slice(0,180):'')
      +(i.source_question?' | Clarification: '+String(i.source_question).slice(0,120):'')).join('\n');
  return [
    'You are TenderScope’s neutral Indian GeM healthcare procurement assistant. Work for ANY bidder, not a predetermined supplier.',
    'ACTION: '+([...BID_AI_ACTIONS,...BID_AI_SECONDARY_ACTIONS].find(a=>a.id===action)?.label||action)+'.',
    'Bid: '+bid.bid_number+' | '+String(bid.title||'').slice(0,250),
    'Buyer: '+String(bid.buyer||'Not recorded').slice(0,200),
    'Recorded closing: '+String(bid.deadline||'Unverified')+' | Last recorded GeM source check: '+String(bid.last_source_checked_at||'Not recorded')+'. Recheck current deadline and corrigenda.',
    'OFFICIAL DOCUMENTS (not complete proof of source availability):',
    ...(chosen.length?chosen.map(d=>d.title+': '+d.url):['No official attachment URL indexed. Retrieve the complete official GeM record for this bid.']),
    sources.length>chosen.length?'Additional '+(sources.length-chosen.length)+' indexed official source(s) omitted from this short link; retrieve from the official bid.':'',
    'Cached document-hash-matched item rows: '+items.length+'. These rows may NOT cover the complete BOQ.',
    rows?'First cached item names (orientation only, not complete specs):\n'+rows:'',
    'Open each View Specification / View File link inside the official bid PDF, including linked buyer PDFs and scans. For each BOQ row show the original spreadsheet wording and the verbatim PDF requirements side by side with page and row. Match the OEM, model, variant and pack against the PDF and all applicable buyer terms. Resolve contradictions before any exact match. For a Word pack, research official catalogues and actual model photographs, embed each verified image in the corresponding editable row and document its source. Leave unverified images and offers pending.',
    'TASK RULES:',
    ...BID_ACTION_GUIDANCE[action].map((line,i)=>(i+1)+'. '+line),
    'Start with the concrete requested output, not a long questionnaire. Read every available current official source, retrieve missing BOQ/ATC and corrigenda, show page-linked facts and clearly mark what was not verified.',
    'No private bidder data, uploaded files or images were included in this link. Reuse verified participant assets already supplied within this chat, or ask ONLY for indispensable missing details needed to finalise an authorised document.',
    'Never claim TenderScope submitted a buyer query or representation. The user must review and file it through the appropriate GeM route.'
  ].filter(Boolean).join('\n');
}
export function publicBidActionAIUrl(options){
  return 'https://chatgpt.com/?q='+encodeURIComponent(buildBidActionPrompt(options));
}
