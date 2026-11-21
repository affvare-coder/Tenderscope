// Only evidence present on the supplied GeM page is surfaced. Filing and eligibility are bidder decisions.
const rules = [
  [/only one distributor authori[sz]ation per OEM is allowed/i, 'Dealer authorization', 'Will the buyer accept independently authorised dealers of the same OEM?'],
  [/traders are excluded from the purview of this policy/i, 'Trader EMD exemption', 'Check the EMD payable if participating as a trader.'],
  [/(?:affidavit|integrity pact|undertaking) on (?:non[- ]judicial )?stamp paper[^.]{0,45}/i, 'Prescribed undertaking', 'Confirm the instrument, denomination, signatory and submission stage.'],
  [/acceptance to replace drugs if not consumed within the shelf life/i, 'Unused stock replacement', 'Please specify the return notice period, remaining shelf life and responsibility for freight.'],
  [/(?:ATC|additional terms and conditions) (?:shall |will )?(?:supersede|prevail over)[^.]{0,85}/i, 'Specification precedence', 'Please identify the controlling requirement where the documents differ.'],
  [/WHO GMP Certification Number\s+Mandatory/i, 'Manufacturer certification', 'Please clarify whether this certificate is required for every line and which equivalent evidence is admissible.']
];
export const currentParser='gem-representation-review-v1';
export function readPage(page, lines, attachment=false) {
  const original=lines.join('\n').trim();
  const text=original.replace(/\s+/g,' ').trim();
  const findings=[];
  for(const [pattern,title,question] of rules){
    const m=pattern.exec(text);
    if(m) findings.push({page,title,quote:m[0],question});
  }
  const window=text.match(/representation window.{0,185}?within\s+(\d{1,2})\s+(days?|hours?)\s+(?:of|from)\s+(?:the\s+)?bid publication/i);
  let windowHours=null;
  if(window){const h=Number(window[1])*(/^day/i.test(window[2])?24:1);if(h>0&&h<=720)windowHours=h;}
  const numeric=(re)=>{const m=re.exec(text);if(!m)return null;const amount=Number(m[1].replaceAll(',',''));return Number.isFinite(amount)&&amount>=0?{amount,page,quote:m[0]}:null;};
  const value=numeric(/\bEstimated Bid Value\s*(?:\(\s*(?:INR|Rs\.?)\s*\))?\s*[:₹]?\s*([\d][\d,]*(?:\.\d+)?)(?!\d)/i);
  const emd=numeric(/\bEMD Amount\s*[:₹]?\s*([\d][\d,]*(?:\.\d+)?)(?!\d)/i);
  const category=/technical specifications?|bid requirement\s*\(allowed values\)|specification name/i.test(text);
  return {page,findings,window:windowHours?{hours:windowHours,page,quote:window[0]}:null,value,emd,
    section:original&&(attachment||category)?{page,text:original.slice(0,10000),truncated:original.length>10000}:null,
    needs_image_review:text.length<35};
}
export function mergePages(previous=[], incoming=[]) {
  return [...new Map([...previous,...incoming].map(p=>[p.page,p])).values()].sort((a,b)=>a.page-b.page);
}
export function pdfLines(tokens){
  const lines=[]; let line='',lastY=null;
  for(const t of tokens){
    if(typeof t.str!=='string')continue;
    const y=t.transform?.[5];
    if(lastY!==null&&Math.abs(y-lastY)>3&&line){lines.push(line);line='';}
    line+=(line&&!/\s$/.test(line)&&!/^\s/.test(t.str)?' ':'')+t.str;lastY=y;
    if(t.hasEOL&&line){lines.push(line);line='';lastY=null;}
  }
  if(line) lines.push(line);
  return lines;
}
