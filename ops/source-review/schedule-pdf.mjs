// Match a native, single-page specification schedule to every original CSV row.
// Extra text, omitted rows, scanned pages and unrecognised column layouts stay pending.
const flat=s=>String(s??'').replace(/\s+/g,' ').trim();
const normalizedCell=s=>flat(s).replace(/\s+/g,'');
function joinCell(tokens){
 let value='',last=null;
 for(const token of tokens){
  const sameLine=last && Math.abs(last.transform[5]-token.transform[5])<1;
  const adjacent=sameLine && Number.isFinite(last.width) && Math.abs(token.transform[4]-last.transform[4]-last.width)<0.8;
  value+=(last&&!adjacent?' ':'')+token.str;
  last=token;
 }
 return flat(value);
}
export function compareSchedule(tokens,records) {
 if(records.length<2 || records.length>501)return null;
 const cols=records[0].map(v=>flat(v).toLowerCase());
 const required=['item number','item title','item description','item quantity','unit of measure','consignee id','delivery period (in number of days)'];
 if(cols.length!==required.length||!required.every((k,i)=>k===cols[i]))return null;
 const data=tokens.filter(t=>t.str?.trim() && t.transform?.length===6);
 const pos=data.findIndex(t=>flat(t.str)==='1' && data.some(h=>h.transform[5]>t.transform[5] && /^(Quantity|Qty)$/i.test(flat(h.str))));
 if(pos<1)return null;
 const head=data.slice(0,pos).map(t=>flat(t.str)).join(' ');
 const seven=/^Item Number Item Title Item Description Item Quantity Unit of Measure Consignee ID Delivery Period \(In number of days\)$/i.test(head);
 const four=/^(?:TECH SPECS?: [A-Za-z ()/-]+ )?Ser No Items Qty A\/U$/i.test(head);
 if(!seven&&!four)return null;
 const rows=records.slice(1);const entries=[];let cursor=pos;
 const starts=seven?['Item Title','Item Description','Quantity','Unit of','Consignee ID','Delivery Period (In'].map(k=>data.slice(0,pos).find(t=>flat(t.str)===k)?.transform[4]):[];
 if(starts.some(x=>!Number.isFinite(x)))return null;
 const left=data[pos].transform[4];
 // Printed spreadsheets sometimes centre the column labels while left-aligning cells.
 // Use the first complete record to anchor these columns. The numerical and
 // delivery fields must still reproduce the independently fetched CSV exactly.
 const first=data.slice(pos,pos+7);
 if(seven && first.length===7 && first.every((t,i)=>!i||t.transform[4]>first[i-1].transform[4])
    && [3,4,5,6].every(i=>flat(first[i].str)===flat(records[1][i]))){
  const x=first.map(t=>t.transform[4]);
  for(let i=0;i<6;i++)starts[i]=x[i+1]-Math.min(12,(x[i+1]-x[i])/5);
 }
 for(const [i,r] of rows.entries()){
  if(r.length!==7||r[0].trim()!==String(i+1)||data[cursor]?.str.trim()!==r[0].trim()||Math.abs(data[cursor].transform[4]-left)>13)return null;
  const begin=cursor;cursor++;
  // The serial is the leftmost column. Every token must be assigned, in order.
  while(cursor<data.length && !(Math.abs(data[cursor].transform[4]-left)<=13 && /^\d+$/.test(flat(data[cursor].str)) && flat(data[cursor].str)===String(i+2) && data[cursor].transform[5]<data[begin].transform[5]-3))cursor++;
  const source=data.slice(begin,cursor);
  const expected=seven?r:[r[0],r[1],r[3],r[4]];
  if(four&&flat(r[1])!==flat(r[2]))return null;
  let actual=[];
  if(seven){
   const cells=Array.from({length:6},()=>[]);
   for(const token of source.slice(1)){
    const col=starts.findLastIndex(x=>token.transform[4]>=x-3);
    if(col<0)return null;
    cells[col].push(token);
   }
   actual=[r[0],...cells.map(joinCell)];
   if(actual.some(v=>!v)||[3,4,5,6].some(j=>flat(actual[j])!==flat(r[j])))return null;
  }else{
   let take=0;
   for(const cell of expected){
    const goal=normalizedCell(cell);if(!goal)return null;
    const words=[];let joined='';
    while(take<source.length&&joined.length<goal.length){words.push(source[take]);joined+=normalizedCell(source[take++].str);}
    const value=joinCell(words);if(value!==flat(cell))return null;
    actual.push(value);
   }
   if(take!==source.length)return null;
  }
  const wording=actual[seven?2:1];
  const question=seven&&(flat(actual[1])!==flat(r[1]) || flat(wording)!==flat(r[2]))?
   'The buyer PDF and BOQ use different wording for this item. Please confirm which specification applies.':null;
  entries.push({n:String(i+1),name:r[1],quantity:Number(flat(r[3]).replaceAll(',','')),unit:r[4],specification:wording,nomenclature:actual[1],consignee:r[5],delivery_days:r[6],question,page:1});
 }
 return cursor===data.length?entries:null;
}
