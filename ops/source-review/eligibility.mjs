// GeM draws each left cell followed by its complete right cell. Read the
// original cell runs, including wrapped values, and require a known format.
const fields=[
 ['bidder',/Minimum Average Annual Turnover of the bidder/i,/^[\d,.]+\s*(?:Lakh|Lac|Crore|INR|Rupees)/i],
 ['oem',/OEM Average (?:Annual )?Turnover/i,/^[\d,.]+\s*(?:Lakh|Lac|Crore|INR|Rupees)/i],
 ['turnover_method',/Turnover eligibility criteria/i,/^(?:GeM verified turnover|To be verified by the buyer)/i],
 ['mse',/MSE Relaxation for Years of Experience/i,/^(?:No|Yes(?:\s*\|?\s*(?:Complete|Partial).*)?)$/i],
 ['startup',/Startup Relaxation for Years of Experience/i,/^(?:No|Yes(?:\s*\|?\s*(?:Complete|Partial).*)?)$/i],
 ['ra',/Bid to RA enabled/i,/^(?:Yes|No)$/i],
 ['evaluation',/Evaluation Method/i,/^(?:item|group|schedule|total)\b.*evaluation$/i],
 ['emd',/EMD Amount/i,/^(?:₹|INR|Rs\.?\s*)?[\d,]+(?:\.\d+)?$/i],
 ['epbg',/ePBG Percentage/i,/^\d+(?:\.\d+)?\s*%?$/i],
 ['mii',/MII Purchase Preference/i,/^(Yes|No)$/i],
 ['category',/Item Category/i,/^.{2,4000}$/s],
 ['total',/Total Quantity/i,/^\d[\d,]*(?:\.\d+)?$/]
];
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
export function readBidFields(tokens,page){
 const clean=tokens.filter(t=>t.str?.trim() && Number.isFinite(t.transform?.[4])&&t.transform[5]>30);
 const anchor=clean.findIndex(t=>/\/\s*(?:Bid End Date\/Time|Evaluation Method|Bid to RA enabled|Total Quantity|EMD Amount)\s*$/i.test(t.str));
 const found={}; if(anchor<0)return found;
 const first=clean.slice(anchor+1,anchor+5).find(t=>t.transform[4]>clean[anchor].transform[4]+12 && /[a-z\d]/i.test(t.str) && !t.str.match(/[\u0900-\u097f]/));
 if(!first)return found;
 const right=first.transform[4];if(right<230||right>345)return found;
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
   const match=label.match(re);if(!match||!valid.test(quote)||quote.length>4000)continue;
   // Include the scope (experience alone vs experience and turnover).
   const section=label.slice(match.index).trim();
   found[key]={value:quote,page,quote,section};
  }
 }
 for(const token of clean){
  if(token.transform[4]<right-5){if(value.length){finish();left=[];value=[];}left.push(token);}
  else value.push(token);
 }
 finish();return found;
}
