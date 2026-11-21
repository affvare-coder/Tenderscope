// Extract candidate cells only when the PDF has explicit serial, item and
// specification columns. A row is published only after a separate BOQ match.
export function specificationTable(tokens) {
 const bands=[];
 for(const t of tokens){
  if(!t.str?.trim() || !t.transform)continue;
  const [x,y]=t.transform.slice(4,6);
  let line=bands.find(line=>Math.abs(line.y-y)<=2);
  if(!line){line={y,cells:[]};bands.push(line);}
  line.cells.push({x,text:t.str.trim()});
 }
 bands.sort((a,b)=>b.y-a.y);
 for(const line of bands)line.cells.sort((a,b)=>a.x-b.x);
 const rows=[];let columns=null,current=null,prevY=null;
 const finish=()=>{if(current?.name && current?.wording && current.wording.length<=6000)rows.push(current);current=null;};
 for(const line of bands){
  const cells=line.cells;
  const serial=cells.find(c=>/^(?:s\.?\s*(?:no|n)|sr\.?\s*no|ser(?:ial)?\s*no|item\s*(?:no|number))\.?$/i.test(c.text));
  const name=cells.find(c=>/^(?:item(?:\s+(?:name|title|description))?|nomenclature|product name)$/i.test(c.text));
  const spec=cells.find(c=>/^(?:(?:technical|buyer)\s+)?specifications?(?: required)?$/i.test(c.text));
  if(serial&&name&&spec){finish();columns={serial:serial.x,name:name.x,spec:spec.x,next:cells.find(c=>c.x>spec.x)?.x??Infinity};prevY=line.y;continue;}
  if(!columns)continue;
  if(prevY-line.y>36 || /^(?:page \d|appendix|signature|total\b)/i.test(cells[0].text)){finish();columns=null;continue;}
  const no=cells.find(c=>Math.abs(c.x-columns.serial)<11&&/^\d+\.?$/.test(c.text));
  const word=(left,right)=>cells.filter(c=>c.x>=left-8 && c.x<right-8).map(c=>c.text).join(' ');
  if(no){finish();current={n:no.text.replace(/\.$/,''),name:'',wording:''};}
  if(current){
   const label=word(columns.name,columns.spec),value=word(columns.spec,columns.next);
   if(!no&&!value&&!label){finish();columns=null;continue;}
   if(label)current.name+=(current.name?' ':'')+label;
   if(value)current.wording+=(current.wording?'\n':'')+value;
  }
  prevY=line.y;
 }
 finish();return rows;
}
