// GeM draws each left cell followed by its complete right cell. Read the
// original cell runs, including wrapped values, and require a known format.
const fields=[
 ['bidder',/Minimum Average Annual Turnover of the bidder/i,/^[\d,.]+\s*(?:Lakh|Lac|Crore|INR|Rupees)/i],
 ['oem',/OEM Average (?:Annual )?Turnover/i,/^[\d,.]+\s*(?:Lakh|Lac|Crore|INR|Rupees)/i],
 ['turnover_method',/Turnover eligibility criteria/i,/^(?:GeM verified turnover|To be verified by the buyer)/i],
 ['mse',/MSE Relaxation for Years of Experience/i,/^(?:No|Yes(?:\s*\|?\s*(?:Complete|Partial).*)?)$/i],
 ['startup',/Startup Relaxation for Years of Experience/i,/^(?:No|Yes(?:\s*\|?\s*(?:Complete|Partial).*)?)$/i],
 ['ra',/Bid to RA enabled/i,/^(?:Yes|No)$/i],
 ['h1',/^RA Qualification Rule$/i,/^H1\s*[-–—]\s*Highest Priced Bid Elimination[.]?$/i],
 ['evaluation',/Evaluation Method/i,/^(?:item|group|schedule|total)\b.*evaluation$/i],
 ['emd',/EMD Amount/i,/^(?:₹|INR|Rs\.?\s*)?[\d,]+(?:\.\d+)?$/i],
 ['epbg',/ePBG Percentage/i,/^\d+(?:\.\d+)?\s*%?$/i],
 ['mii',/MII Purchase Preference/i,/^(Yes|No)$/i],
 ['category',/Item Category/i,/^.{2,4000}$/s],
 ['total',/Total Quantity/i,/^\d[\d,]*(?:\.\d+)?$/]
];
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();

function readDepositRequirements(tokens, page) {
 const facts={};
 const text=tokens.filter(t=>t.str?.trim() && Number.isFinite(t.transform?.[4]) && t.transform[5]>30);
 for(const title of text){
  const section=title.str.trim().match(/(?:^|\/)\s*(EMD|ePBG) Detail$/i)?.[1];
  if(!section)continue;
  const y=title.transform[5];
  const below=text.filter(t=>t.transform[5]<y-3&&t.transform[5]>=y-36);
  const rowY=Math.max(...below.map(t=>t.transform[5]));
  const row=below.filter(t=>rowY-t.transform[5]<=3).sort((a,b)=>a.transform[4]-b.transform[4]);
  const quote=row.map(t=>t.str.trim()).join(' ').match(/(?:^|\/)\s*Required\s+(Yes|No)$/i)?.[1];
  if(!quote)continue;
  const key=section.toLowerCase();
  const fieldSection=key==='emd'?'EMD Detail / Required':'ePBG Detail / Required';
  if(!Object.hasOwn(facts,key))facts[key]={value:quote,quote,page,section:fieldSection};
  else if(facts[key]?.quote.toLowerCase()!==quote.toLowerCase())facts[key]=null;
 }
 return facts;
}

function readBidFieldCandidates(tokens,page){
 const clean=tokens.filter(t=>t.str?.trim() && Number.isFinite(t.transform?.[4])&&t.transform[5]>30);
 const anchor=clean.findIndex(t=>/\/\s*(?:Bid End Date\/Time|Evaluation Method|Bid to RA enabled|RA Qualification Rule|Total Quantity|EMD Amount)\s*$/i.test(t.str));
 const found={}, conflicts=new Set(); if(anchor<0)return found;
 const first=clean.slice(anchor+1,anchor+5).find(t=>t.transform[4]>clean[anchor].transform[4]+12 && /[a-z\d]/i.test(t.str) && !t.str.match(/[\u0900-\u097f]/));
 const right=first?.transform[4];
 if(!right||right<230||right>345){
  // A labelled RA field without a readable table cell is unresolved.
  for(const token of clean){
   if(/\/\s*Bid to RA enabled\s*$/i.test(token.str))found.ra=null;
   if(/\/\s*RA Qualification Rule\s*$/i.test(token.str))found.h1=null;
  }
  return found;
 }
 let left=[],value=[];
 function finish(){
  const label=norm(left.map(t=>t.str).join(' ').replace(/[^A-Za-z0-9() /-]/g,' ').replace(/\s*\/\s*/g,' '));
  // Footer overlays and the first-page bid number are drawn after the table.
  const base=value[0]?.transform[5];
  const cell=[];
  for(const t of value){
   if(base!==undefined && Math.abs(t.transform[5]-base)>140 || (cell.length && t.transform[5]>cell.at(-1).transform[5]+5))break;
   cell.push(t);
  }
  const quote=cell.map(t=>t.str.trim()).join(' ').trim();
  for(const [key,re,valid] of fields){
   const match=label.match(re);if(!match)continue;
   if(Object.hasOwn(found,key) && found[key]?.quote!==quote)conflicts.add(key);
   if(!valid.test(quote)||quote.length>4000){
    if(key==='ra'||key==='h1')found[key]=null;
    continue;
   }
   // Include the scope (experience alone vs experience and turnover).
   const section=label.slice(match.index).trim();
   found[key]={value:quote,page,quote,section};
  }
 }
 for(const token of clean){
  if(token.transform[4]<right-5){if(value.length){finish();left=[];value=[];}left.push(token);}
  else value.push(token);
 }
 finish();
 for(const key of conflicts)found[key]=null;
 return found;
}

// Check the controlling RA flag and qualification cell together even when
// the bid header spans pages. Ambiguous cells resolve to no published fact.
export function readParentBidFields(pages){
 const found={}, deposits={};
 function merge(target, candidates){
  for(const [key,candidate] of Object.entries(candidates)){
   if(Object.hasOwn(target,key) && target[key]?.quote!==candidate?.quote)target[key]=null;
   else if(!Object.hasOwn(target,key))target[key]=candidate;
  }
 }
 for(const {page,tokens} of pages){
  merge(found, readBidFieldCandidates(tokens,page));
  merge(deposits, readDepositRequirements(tokens,page));
 }
 for(const [key, requirement] of Object.entries(deposits)){
  if(!requirement || (requirement.quote.toLowerCase()==='no' && found[key] && /[1-9]/.test(found[key].quote))){
   delete found[key];
  }else if(!Object.hasOwn(found,key) || requirement.quote.toLowerCase()==='no' && found[key]){
   found[key]=requirement;
  }
 }
 for(const key of Object.keys(found))if(!found[key])delete found[key];
 if(found.ra?.value.toLowerCase()!=='yes')delete found.h1;
 return found;
}

export function readBidFields(tokens,page){
 return readParentBidFields([{page,tokens}]);
}

// These rules describe the wording of the parent bid only. Linked ATCs have
// their own page numbers and hashes and are reviewed as separate documents.
const buyerClauseRules = [
  {
    key: 'exemption', section: 'Trader / reseller EMD exemption',
    relevant: s => /\b(?:traders?|resellers?)\b/i.test(s) && /\b(?:EMD|earnest money deposit)\b/i.test(s) && /\bexempt/i.test(s),
    match: /^(?:(?:the|all) )?(?:traders?|resellers?)(?:\s*(?:\/|and|or)\s*(?:traders?|resellers?))?\s+(?:are|is|shall be|will be)\s+(?:(?:not eligible|ineligible) for|excluded from)\s+(?:the )?(?:EMD exemption|exemption from (?:the )?EMD)[.!]?$/i,
  },
  {
    key: 'precedence', section: 'Specification precedence',
    relevant: s => /\b(?:ATC|additional terms and conditions)\b/i.test(s) && /\b(?:specifications?|parameters?)\b/i.test(s) && /\b(?:supersed|overrid|prevail|preceden)/i.test(s),
    match: /^(?:(?:the )?(?:technical )?specifications? (?:mentioned|stated|specified|given) in (?:the )?)?(?:the )?(?:ATC|additional terms and conditions)(?: specifications?)? (?:shall |will |must )?(?:supersedes?|overrides?|prevails? over|takes? precedence over) (?:the )?(?:(?:GeM|product|bid|category|technical) )*specifications?(?: (?:selected|stated|specified|given) in (?:the )?(?:GeM |product |category )?bid)?[.!]?$/i,
  },
  {
    key: 'undertaking', section: 'Integrity Pact',
    relevant: s => /\bintegrity pact\b/i.test(s) && /\b(?:mandatory|required|compulsory|optional|submit\w*|submission|applicable|disqualif\w*|waiv\w*|exempt\w*|must|shall|not)\b/i.test(s),
    match: /^(?:(?:(?:the|a|signed|duly signed) )*integrity pact (?:is (?:mandatory|required|compulsory)|(?:shall|must) be (?:submitted|signed))|(?:(?:the|all) )?bidders? (?:shall|must) (?:submit|sign) (?:a |the )?(?:duly signed |signed )?integrity pact|non[- ]submission of (?:the )?integrity pact (?:shall|will) (?:lead to|result in) disqualification(?: of (?:the )?bidder)?)(?: on (?:non[- ]judicial )?(?:(?:₹|Rs\.?|INR)\s*[\d,]+(?:\/-)? )?stamp paper)?[.!]?$/i,
  },
];

const atcHeading = /^(?:(?:[\p{Script=Devanagari}\s]+)?\/\s*)?Buyer Added Bid Specific Terms and Conditions$/iu;
const disclaimerHeading = /^(?:(?:[\p{Script=Devanagari}\s]+)?\/\s*)?Disclaimer$/iu;
const specHeading = /^(?:(?:[\p{Script=Devanagari}\s]+)?\/\s*)?(?:Technical Specifications|Additional Specification Parameters)$/iu;
const consigneeHeading = /^(?:(?:[\p{Script=Devanagari}\s]+)?\/\s*)?Consignees\/Reporting Officer and Quantity$/iu;

function embeddedClauses(pages) {
  const atc = [], specifications = [];
  let inAtc = false, inSpecifications = false, atcCount = 0, atcClosed = false;
  let reachedDisclaimer = false;
  for (const {page, tokens} of pages) {
    const atcTokens = [], specTokens = [];
    for (const token of tokens) {
      const word = token.str?.trim();
      if (!word) continue;
      if (atcHeading.test(word)) {
        atcCount++;
        inAtc = true;
      } else if (disclaimerHeading.test(word)) {
        atcClosed ||= inAtc;
        inAtc = false;
        reachedDisclaimer = true;
        break;
      } else if (inAtc) atcTokens.push(token);
      if (specHeading.test(word)) inSpecifications = !inAtc;
      else if (atcHeading.test(word) || consigneeHeading.test(word)) inSpecifications = false;
      else if (inSpecifications) specTokens.push(token);
    }
    if (atcTokens.length) atc.push({page, tokens: atcTokens, specification: false});
    if (specTokens.length) specifications.push({page, tokens: specTokens, specification: true});
    if (reachedDisclaimer) break;
  }
  // Do not derive buyer-specific flags from an ambiguous or partial section.
  if (!reachedDisclaimer || atcCount>1 || (atcCount===1 && !atcClosed)) return [];
  return [...specifications, ...atc];
}

function clauseParagraphs(tokens, specification) {
  const paragraphs = [];
  let words = [], lastY;
  for (const token of tokens) {
    const word = token.str?.trim();
    if (!word || /^\d+\s*\/\s*\d+$/.test(word)) continue;
    if (specification && /^(?:\/\s*)?Overall Specifications$/i.test(word)) {
      if(words.length)paragraphs.push(words.join(' '));
      words=[];
      continue;
    }
    const y = token.transform?.[5];
    if (y < 30) continue;
    if (words.length && (y > lastY + 5 || lastY - y > 22 || /^\d+[.)]\s+/.test(word))) {
      paragraphs.push(words.join(' '));
      words = [];
    }
    words.push(word);
    lastY = y;
  }
  if (words.length) paragraphs.push(words.join(' '));
  return paragraphs;
}

export function readParentClauseEvidence(pages) {
  const found = {}, unresolved = new Set();
  if (pages.some((entry, index) => index && entry.page!==pages[index-1].page+1)) return found;
  for (const {page, tokens, specification} of embeddedClauses(pages)) {
    for (const paragraph of clauseParagraphs(tokens, specification)) {
      // Keep decimal points, abbreviations, and conditionals inside their clause.
      const qualified = /\b(?:for example|as an example|illustrative|hypothetical|does not apply|do not apply|except (?:as|for|where)|subject to|provided that|unless|following (?:clauses?|terms?) (?:are|is) (?:waived|inapplicable))\b/i.test(paragraph);
      const statements = paragraph.split(/(?<=[.!?])(?<!\bRs\.)(?<!\bNo\.)\s+(?=[A-Z(\d])/u);
      for (const source of statements) {
        const quote = source.trim();
        const wording = quote.replace(/^(?:\d+[.)]|\([a-z0-9]+\))\s*/i, '').replace(/\s+/g, ' ');
        for (const rule of buyerClauseRules) {
          if (specification && rule.key!=='precedence') continue;
          if (!rule.relevant(wording)) continue;
          if (qualified || quote.length > 480 || !rule.match.test(wording) || (found[rule.key] && found[rule.key].value.toLowerCase() !== wording.toLowerCase())) {
            unresolved.add(rule.key);
          } else {
            found[rule.key] ??= {value: wording, quote, page, section: rule.section};
          }
        }
      }
    }
  }
  for (const key of unresolved) delete found[key];
  return found;
}
