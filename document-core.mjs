import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,Header,Footer,ImageRun,PageNumber,WidthType} from 'docx';
export function verifiedItems(items,documents){return items.filter(i=>i.is_current!==false&&i.source_hash&&documents.some(d=>d.official_url===i.source_url&&d.content_hash===i.source_hash&&d.availability==='available'));}
export function validateProfile(profile){if(!profile.company?.trim()||!profile.signatory?.trim())throw Error('Enter the company name and authorised signatory.');}
export function complianceRows(items,offers={}){if(!items.length)throw Error('Verified product rows are not available yet. Upload and verify the official BOQ first.');return items.map(i=>({...i,offer:offers[i.item_key]?.offer||'',response:offers[i.item_key]?.response||'NEEDS REVIEW',evidence:offers[i.item_key]?.evidence||''}));}
const text=v=>String(v??'Not specified');
function image(data,width,height){return new ImageRun({data:data.bytes,type:data.type,transformation:{width,height}});}
export async function complianceDocx({bid,profile,items,offers,images={}}){
 validateProfile(profile);const rows=complianceRows(items,offers);
 const p=(v,bold=false)=>new Paragraph({children:[new TextRun({text:text(v),bold,size:18})],spacing:{after:80}});
 const header=images.header?new Header({children:[new Paragraph({children:[image(images.header,640,70)]})]}):new Header({children:[p(profile.company,true),p([profile.address,profile.email,profile.phone].filter(Boolean).join(' | '))]});
 const footerParts=[];if(images.signature)footerParts.push(image(images.signature,100,40));if(images.stamp)footerParts.push(image(images.stamp,65,65));
 const footer=new Footer({children:[new Paragraph({children:footerParts}),p(`${profile.signatory} | ${profile.designation||'Authorised signatory'}`),...(images.footer?[new Paragraph({children:[image(images.footer,640,32)]})]:[]),new Paragraph({children:[new TextRun({text:`${bid.bid_number} | Page `,size:16}),new TextRun({children:[PageNumber.CURRENT],size:16}),new TextRun({text:' of ',size:16}),new TextRun({children:[PageNumber.TOTAL_PAGES],size:16})]})]});
 const headings=['Item / quantity','Buyer specification','Offered OEM / product / pack','Response','Evidence'];
 const table=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({tableHeader:true,children:headings.map(h=>new TableCell({children:[p(h,true)]}))}),...rows.map(i=>new TableRow({cantSplit:false,children:[`${i.item_number||''}. ${i.name}\nQty: ${i.quantity??'Not specified'} ${i.unit||''}\nPack: ${i.pack||'Not specified'}\nPVMS/NIV: ${i.pvms||i.niv||'Not specified'}`,i.specification||'Not specified in extracted source',i.offer||'NOT SELECTED',i.response,i.evidence||'NEEDS REVIEW'].map(c=>new TableCell({children:String(c).split('\n').map(v=>p(v))}))}))]});
 const doc=new Document({creator:'TenderScope',title:`${bid.bid_number} Technical Offer`,sections:[{properties:{page:{size:{width:16838,height:11906},margin:{top:1600,bottom:1500,left:650,right:650}}},headers:{default:header},footers:{default:footer},children:[p(bid.bid_number,true),p(`To: ${bid.buyer||'Buyer'}`),p(bid.title,true),p('Draft technical offer. Responses and product claims require participant verification.'),table,...rows.map(i=>p(`Source ${i.item_number||''}: ${i.source_url} | SHA-256 ${i.source_hash}`))]}]});
 return Packer.toBlob(doc);
}
function wrap(font,value,size,width){const out=[];for(const line of String(value).split('\n')){let current='';for(const word of line.split(/\s+/)){const next=current?current+' '+word:word;if(current&&font.widthOfTextAtSize(next,size)>width){out.push(current);current=word;}else current=next;}out.push(current);}return out;}
export async function compliancePdf({bid,profile,items,offers,images={},fontBytes}){
 validateProfile(profile);const rows=complianceRows(items,offers),doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});let page,y;
 const put=(v,size=10)=>{for(const line of wrap(font,text(v),size,500)){if(y<125)newPage();page.drawText(line,{x:45,y,size,font});y-=size+5;}};
 const newPage=()=>{page=doc.addPage([595.28,841.89]);y=740;};newPage();
 for(const i of rows){put(`${i.item_number||''}. ${i.name}`,12);put(`Qty: ${i.quantity??'Not specified'} ${i.unit||''} | Pack: ${i.pack||'Not specified'} | PVMS/NIV: ${i.pvms||i.niv||'Not specified'}`);put('Buyer specification: '+(i.specification||'Not specified in extracted source'));put('Offer: '+(i.offer||'NOT SELECTED'));put('Response: '+i.response+' | Evidence: '+(i.evidence||'NEEDS REVIEW'));put('Source: '+i.source_url,8);put('SHA-256: '+i.source_hash,7);y-=15;}
 for(const [index,p] of doc.getPages().entries()){
  if(images.header){const im=await doc[images.header.type==='png'?'embedPng':'embedJpg'](images.header.bytes);p.drawImage(im,{x:40,y:765,width:515,height:60});}else p.drawText(profile.company,{x:45,y:800,size:16,font});
  p.drawText(bid.bid_number,{x:45,y:752,size:9,font});p.drawText(`DRAFT - Review required | Page ${index+1} of ${doc.getPageCount()}`,{x:45,y:22,size:8,font});
  p.drawText(profile.signatory,{x:45,y:80,size:10,font});
  for(const [key,x,width,height] of [['signature',45,95,32],['stamp',420,55,55],['footer',45,500,25]])if(images[key]){const im=await doc[images[key].type==='png'?'embedPng':'embedJpg'](images[key].bytes);p.drawImage(im,{x,y:key==='footer'?35:90,width,height});}
 }
 return doc.save();
}
export function resolveBinding(field,profile,bid){const value=field.binding==='bid_number'?bid.bid_number:field.binding==='date'?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata'}).format(new Date()):field.binding==='custom'?field.value:profile[field.binding];if(!value?.trim())throw Error(`Missing participant value: ${field.binding}`);return value;}
export async function fillAnnexures({bytes,fields,profile,bid,images={},fontBytes,pages}){
 validateProfile(profile);if(!fields.length)throw Error('Map the annexure fields before exporting.');
 const doc=await PDFDocument.load(bytes);if(doc.getPages().some(p=>p.getRotation().angle!==0))throw Error('Rotated source pages require normalization before field mapping.');
 doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});
 for(const f of fields){
  const page=doc.getPage(f.page-1);if(!page)throw Error('Invalid annexure page.');
  if(f.formName){doc.getForm().getTextField(f.formName).setText(resolveBinding(f,profile,bid));continue;}
  if(!Number.isFinite(f.width??.35)||(f.width??.35)<=0||(f.width??.35)>1||!Number.isFinite(f.size??10)||(f.size??10)<6||(f.size??10)>24)throw Error('Invalid field size.');
  const {width,height}=page.getSize(),x=f.x*width,y=(1-f.y)*height,w=(f.width||.35)*width,h=f.height||16;
  if(!Number.isFinite(h)||h<=0||h>150||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x+w>width||y+h>height)throw Error('A mapped field is outside the page.');
  if(['signature','stamp','header','footer'].includes(f.binding)){const data=images[f.binding];if(!data)throw Error(`Upload the ${f.binding} image.`);const img=await doc[data.type==='png'?'embedPng':'embedJpg'](data.bytes);page.drawImage(img,{x,y,width:w,height:h});}
  else{const value=resolveBinding(f,profile,bid),size=f.size||10;if(font.widthOfTextAtSize(value,size)>w)throw Error(`Value does not fit: ${f.binding}. Increase its width or reduce font size.`);page.drawText(value,{x,y,size,font,color:rgb(0,0,.15)});}
 }
 doc.getForm().updateFieldAppearances(font);doc.getForm().flatten();
 if(pages?.length){if(new Set(pages).size!==pages.length||pages.some(p=>!Number.isInteger(p)||p<1||p>doc.getPageCount()))throw Error('Invalid annexure page selection.');const out=await PDFDocument.create();for(const page of await out.copyPages(doc,pages.map(n=>n-1)))out.addPage(page);return out.save();}
 return doc.save();
}
