// Independent record check on the original GeM CSV bytes. The product parser
// can discard a row, so its output array is never the official denominator.
export function officialScheduleCount(bytes) {
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 const field=/(?:"((?:[^"]|"")*)"|([^"\r\n,]*))(,|\r\n|\r|\n|$)/gy;
 let offset=0, cells=[], columns=null, numberIndex=-1, count=0;
 while(offset<text.length) {
  field.lastIndex=offset;
  const match=field.exec(text);
  if(!match || field.lastIndex<=offset)return null;
  offset=field.lastIndex;
  cells.push((match[1]??match[2]).replaceAll('""','"').trim());
  if(match[3]===',')continue;
  if(cells.some(Boolean)){
   if(!columns){
    columns=cells.map(v=>v.toLowerCase().replace(/[^a-z0-9]/g,''));
    numberIndex=columns.findIndex(v=>['itemnumber','serialno','srno'].includes(v));
    if(numberIndex<0||!columns.includes('itemtitle')||!columns.includes('itemquantity'))return null;
   }else{
    if(cells.length!==columns.length || cells[numberIndex]!==String(count+1))return null;
    count++;
   }
  }
  cells=[];
 }
 return count>0 && !cells.length?count:null;
}
