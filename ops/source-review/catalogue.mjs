// Restrict positive certification to the standard single-item, single-consignee GeM
// category form. Other layouts retain their ordinary extraction and review status.
const text=t=>t.str.trim();
const normalized=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const heading=/^(.+?)\s*\(\s*(\d[\d,]*(?:\.\d+)?)\s+(pieces?|units?|sets?|kits?|pairs?|packs?|bottles?|numbers?)\s*\)\s*$/i;
const generic=/^(?:s\s*c\s*h(?:ed(?:ule)?)?|boq|item|title)[\s._:#–—-]*(?:\d+|[ivxlcdm]+)[.:]?$/i;
const pointer=/\b(?:see|refer(?:red)? to|as per|per)\s+(?:the\s+)?(?:attached|annexure|attachment|enclosed|uploaded)|\b(?:view file|view specification|buyer uploaded ATC document|technical specifications? attached|specifications? as attached)\b/i;
const financialConflict=/\b(?:bidder|OEM)\s+turn\s*over\s*:/i;
const footer=s=>/^\d+\s*\/\s*\d+$/.test(s);
function inRegion(t,page,start,end){
 return (page>start.page||page===start.page&&t.transform[5]<start.y-2) &&
        (page<end.page||page===end.page&&t.transform[5]>end.y+2);
}
export function catalogueProof(pages,fields,links){
 if(links.length||!fields.category||!fields.total||pages.some(p=>p.unreadable))return null;
 const types=fields.category.quote.match(/\(Q[1-4]\)/gi);
 if(types?.length!==1 || !/\(Q[1-4]\)\s*$/i.test(fields.category.quote))return null;
 const category=fields.category.quote.replace(/\s*\(Q[1-4]\)\s*$/i,'');
 const all=pages.flatMap(p=>p.tokens.map(t=>({s:text(t),page:p.page,y:t.transform[5],x:t.transform[4]})));
 const headings=all.filter(t=>heading.test(t.s));
 const consignee=all.filter(t=>/\/Consignees\/Reporting Officer and Quantity$/i.test(t.s));
 const technical=all.filter(t=>/\/Technical Specifications$/i.test(t.s));
 const disclaimer=all.filter(t=>/^\/Disclaimer$/i.test(t.s));
 if(headings.length!==1||consignee.length!==1||technical.length!==1||disclaimer.length!==1)return null;
 const start=headings[0], stop=consignee[0], end=disclaimer[0], [,name,num,unit]=start.s.match(heading);
 const quantity=Number(num.replaceAll(',',''));
 if(normalized(name)!==normalized(category)||generic.test(normalized(name))||!quantity||quantity!==Number(fields.total.quote.replaceAll(',','')))return null;
 if(!inRegion({transform:[0,0,0,0,0,technical[0].y]},technical[0].page,start,stop))return null;
 // Require each recognized GeM matrix and read its rows in PDF cell order.
 // Header and value runs sometimes occur in different paint order across pages.
 const parts=[], qualifying=pages.filter(p=>p.page>=start.page&&p.page<=end.page);
 if(!qualifying.length||qualifying.some(p=>p.images))return null;
 let matrixCount=0, parameterCount=0;
 for(const p of qualifying){
  const section=p.tokens.filter(t=>inRegion(t,p.page,start,stop)&&!footer(text(t)));
  const prefix=section.filter(t=>p.page<technical[0].page || p.page===technical[0].page && t.transform[5]>technical[0].y+3);
  if(prefix.some(t=>/[\u0000-\u0008\ufffd]/.test(text(t))))return null;
  if(prefix.length)parts.push(prefix.map(text).join(' '));
  const header=section.find(t=>/^\(Allowed Values\)$/i.test(text(t)));
  if(!header&&section.some(t=>p.page>technical[0].page && /[a-z\d]/i.test(t.str)))return null;
  if(header){
   const before=section.filter(t=>t.transform[5]>=header.transform[5]-4 && !prefix.includes(t)).map(text);
   const english=before.filter(s=>!(/[\u0900-\u097f]/.test(s) && !/[A-Za-z]{2}/.test(s))).map(s=>s.replace(/[^A-Za-z]+/g,' ').trim()).filter(Boolean).join(' ');
   if(english.replace(/\b(?:Technical|Specifications?|As|per|GeM|Category|Name|Bid|Requirement|Allowed|Values)\b/gi,'').trim())return null;
   if(!section.some(t=>/\/Bid Requirement$/i.test(text(t))))return null;
   const body=section.filter(t=>t.transform[5]<header.transform[5]-4);
   if(!body.length)return null;
   const valueCol=body.find(t=>t.transform[4]>275)?.transform[4];
   if(!valueCol || valueCol>355 || !body.some(t=>t.transform[4]>90 && t.transform[4]<valueCol-15))return null;
   // Each new requirement is painted before its answer. Require every pair.
   let label=[],value=[],group=[],labelY;
   const finish=()=>{if(!label.length||!value.length)return false;parts.push([...group,...label].join(' ')+' — '+value.join(' '));parameterCount++;group=[];label=[];value=[];return true;};
   for(const t of body){
    const x=t.transform[4],s=text(t);
    if(/[\u0000-\u0008\ufffd]/.test(s)||pointer.test(s))return null;
    if(x>=valueCol-3){
     if(!value.length && (!label.length || Math.abs(t.transform[5]-labelY)>4))return null;
     value.push(s);
    }
    else {
     if(value.length&&!finish())return null;
     if(x<90)group.push(s);else {if(!label.length)labelY=t.transform[5];label.push(s);}
    }
   }
   if(!finish())return null;
   matrixCount++;
  }

 }
 if(!matrixCount||!parameterCount||parts.join(' ').length>18000)return null;
 const delivery=pages[stop.page-1].tokens.filter(t=>t.transform[5]<stop.y-4);
 const qtyHead=delivery.find(t=>/^\/Quantity$/i.test(text(t)));
 const addrHead=delivery.find(t=>/^\/Address$/i.test(text(t)));
 if(!qtyHead||!addrHead)return null;
 const serial=delivery.filter(t=>t.transform[4]<70&&t.transform[5]<qtyHead.transform[5]-14&&/^\d+$/.test(text(t)));
 if(serial.length!==1||text(serial[0])!=='1')return null;
 const row=delivery.filter(t=>Math.abs(t.transform[5]-serial[0].transform[5])<3);
 const address=row.filter(t=>t.transform[4]>=addrHead.transform[4]-15 && t.transform[4]<qtyHead.transform[4]-35).map(text).join(' ').trim();
 if(!/[\p{L}\p{N}]/u.test(address) || /^(?:n\/?a|nil|unknown|not specified)$/i.test(address))return null;
 const qty=row.filter(t=>Math.abs(t.transform[4]-qtyHead.transform[4])<35&&/^[\d,]+(?:\.\d+)?$/.test(text(t)));
 if(qty.length!==1||Number(text(qty[0]).replaceAll(',',''))!==quantity)return null;
 const terms=all.filter(t=>inRegion({transform:[0,0,0,0,0,t.y]},t.page,{page:stop.page,y:serial[0].transform[5]},end) && !footer(t.s));
 const clauseText=terms.map(t=>t.s).join(' ');
 // Custom text, external technical references and incomplete language require review.
 if(pointer.test(clauseText)||financialConflict.test(clauseText)||/buyer added text based atc|as per atc|additional specification parameters|see attached|as per drawing/i.test(all.map(t=>t.s).join(' ')))return null;
 // Include buyer-specific conditions in full. A second location or a second
 // delivery table prevents assigning the same delivery terms to another row.
 const atc=terms.findIndex(t=>/\/Buyer Added Bid Specific Terms and Conditions$/i.test(t.s));
 const special=terms.findIndex(t=>/^Special terms and conditions/i.test(t.s));
 const from=[atc,special].filter(i=>i>=0).sort((a,b)=>a-b)[0];
 if(from===undefined&&terms.some(t=>/[A-Za-z]/.test(t.s)))return null;
 const conditionTokens=from===undefined?[]:terms.slice(from);
 // Ignore only the unreadable Hindi half of an identified bilingual heading.
 const translatedHeading=t=>conditionTokens.some(h=>h.page===t.page && Math.abs(t.y-h.y)<4 && h.x>t.x && /^\/(?:Buyer Added Bid Specific Terms and Conditions|Disclaimer)$/.test(h.s));
 if(conditionTokens.some(t=>/[\u0000-\u0008\ufffd]/.test(t.s)&&!translatedHeading(t)))return null;
 const conditions=conditionTokens.filter(t=>!/[\u0000-\u0008\ufffd]/.test(t.s)).map(t=>t.s).join(' ');
 if(conditions.length>22000)return null;
 return {name,quantity,unit,spec_page:technical[0].page,specification:parts.join('\n')+(conditions?'\n'+conditions:''),count_location:'Item Category, page '+fields.category.page,
  row_location:'Item heading, page '+start.page+'; single consignee, page '+stop.page,
  spec_location:'Technical Specifications, pages '+technical[0].page+'–'+stop.page+'; conditions through page '+end.page};
}
