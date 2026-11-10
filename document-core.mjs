import {PDFDocument,rgb} from 'pdf-lib';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,Header,Footer,ImageRun,PageNumber,WidthType,AlignmentType,VerticalAlign,PageOrientation,BorderStyle} from 'docx';

const DRAFT='DRAFT / BLOCKED — NOT FOR UPLOAD';
const A4={width:11906,height:16838};
const text=v=>String(v??'');
const clean=v=>text(v).trim();
export function verifiedItems(items,documents){return items.filter(i=>i.is_current!==false&&i.source_hash&&documents.some(d=>d.official_url===i.source_url&&d.content_hash===i.source_hash&&d.availability==='available'));}
export function validateProfile(profile){if(!clean(profile.company)||!clean(profile.signatory))throw Error('Enter the company name and authorised signatory.');}
export function complianceRows(items,offers={}){
 if(!items.length)throw Error('Verified product rows are not available yet. Upload and verify the official BOQ first.');
 return items.map(i=>{const o=offers[i.item_key]||{};const requested=clean(o.response)||'NEEDS REVIEW';const supported=o.verified===true&&clean(o.offer)&&clean(o.evidence);return {...i,offer:clean(o.offer),response:/^yes$/i.test(requested)&&!supported?'NEEDS REVIEW':requested,evidence:clean(o.evidence),photo:o.photo,offerVerified:supported,photoVerified:o.photoVerified===true,photoRequired:o.photoRequired!==false};});
}
function rowBlockers(i){const b=[];if(!clean(i.name))b.push('Missing buyer item name');if(!clean(i.specification))b.push('Missing full buyer specification');if(i.quantity==null)b.push('Missing buyer quantity');if(!clean(i.source_url)||!clean(i.source_hash))b.push('Current official item provenance missing');if(!clean(i.offer))b.push('Offered OEM, product and pack not selected');if(!i.offerVerified)b.push('Offer evidence not verified');if(!/^yes$/i.test(i.response))b.push('Compliance response requires review');if(i.photoRequired&&(!i.photo||!i.photoVerified))b.push('Matching approved product photograph not verified');return b;}
function release(review={},blockers=[]){return review.confirmed===true&&review.sourceVerified===true&&review.rendered===true&&review.executionAuthorized===true&&!blockers.length&&!(review.blockers||[]).length;}
export function documentVerification({bid,profile,items=[],offers={},images={},review={}}){
 const rows=items.length?complianceRows(items,offers):[];const blockers=[...(review.blockers||[])];if(!rows.length)blockers.push('Verified buyer item rows are unavailable');if(!clean(profile?.company)||!clean(profile?.signatory))blockers.push('Participant company and authorised signatory required');
 const itemChecks=rows.map(i=>({item_key:i.item_key,item_number:i.item_number,name:i.name,source_url:i.source_url,source_hash:i.source_hash,response:i.response,blockers:rowBlockers(i)}));
 for(const i of itemChecks)for(const b of i.blockers)blockers.push(`${i.item_number||i.item_key}: ${b}`);
 if(review.sourceVerified!==true)blockers.push('Complete current official source record has not been confirmed');if(review.confirmed!==true)blockers.push('Participant content review is pending');if(review.rendered!==true)blockers.push('Every final DOCX page has not been rendered and inspected');if(review.executionAuthorized!==true)blockers.push('Execution has not been authorised');
 const ready=release(review,blockers);return {bid_number:bid.bid_number,status:ready?'PREPARED_REVIEWED':'DRAFT_BLOCKED_NOT_FOR_UPLOAD',item_count:rows.length,ready,signature_applied:ready&&Boolean(images.signature),stamp_applied:ready&&Boolean(images.stamp),blockers:[...new Set(blockers)],items:itemChecks,limitations:['Local generation does not automatically inspect rendered DOCX pages.','An inserted signature image is not a digital signature or proof of execution.']};
}
function imageSize(data){
 const b=new Uint8Array(data.bytes);if(data.width>0&&data.height>0)return [data.width,data.height];
 if(data.type==='png'&&b.length>24&&b[0]===137&&b[1]===80){const d=new DataView(b.buffer,b.byteOffset,b.byteLength);return [d.getUint32(16),d.getUint32(20)];}
 if(data.type==='jpg'&&b[0]===255&&b[1]===216){let p=2;while(p+8<b.length){if(b[p]!==255){p++;continue;}const marker=b[p+1],n=(b[p+2]<<8)+b[p+3];if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [(b[p+7]<<8)+b[p+8],(b[p+5]<<8)+b[p+6]];if(n<2)break;p+=n+2;}}
 throw Error('Image dimensions could not be verified. Use an intact PNG or JPEG.');
}
function fitImage(data,maxWidth,maxHeight){if(!data?.bytes||!['png','jpg'].includes(data.type))throw Error('An approved PNG or JPEG image is required.');const [w,h]=imageSize(data),s=Math.min(maxWidth/w,maxHeight/h);return {width:Math.max(1,Math.round(w*s)),height:Math.max(1,Math.round(h*s))};}
function image(data,width,height){return new ImageRun({data:data.bytes,type:data.type,transformation:fitImage(data,width,height)});}
function p(v,bold=false,options={}){return new Paragraph({children:[new TextRun({text:text(v),bold,size:20,color:'000000'})],spacing:{after:80,line:240},...options});}
function lines(v,bold=false){return text(v).split('\n').map(s=>p(s,bold));}
function identity(profile){return [['GSTIN',profile.gstin],['PAN',profile.pan],['Udyam',profile.udyam],['Licence',profile.licence||profile.license||profile.licences]].filter(([,v])=>clean(v)).map(([k,v])=>`${k}: ${v}`).join(' | ');}
function profileDetails(profile){const detail=[];if(clean(profile.address))detail.push(...lines('Registered address: '+profile.address));const contact=[['Email',profile.email],['Phone',profile.phone]].filter(([,v])=>clean(v)).map(([k,v])=>`${k}: ${v}`).join(' | ');if(contact)detail.push(p(contact));if(identity(profile))detail.push(...lines(identity(profile)));return detail;}
function pageParts({bid,profile,images={},ready=false,branding=true}){
 const header=[];if(branding){if(images.header)header.push(new Paragraph({children:[image(images.header,680,68)],spacing:{after:20}}));else header.push(p(profile.company,true));}
 header.push(p(bid.bid_number,true));if(!ready)header.push(p(DRAFT,true));
 const foot=[];if(branding&&images.footer)foot.push(new Paragraph({children:[image(images.footer,680,32)],spacing:{after:20}}));
 foot.push(new Paragraph({children:[new TextRun({text:`${!ready?DRAFT+' | ':''}${bid.bid_number} | Page `,size:16}),new TextRun({children:[PageNumber.CURRENT],size:16}),new TextRun({text:' of ',size:16}),new TextRun({children:[PageNumber.TOTAL_PAGES],size:16})],spacing:{after:0}}));
 return {headers:{default:new Header({children:header})},footers:{default:new Footer({children:foot})}};
}
function closing(profile,images,ready){if(!ready)return [p(`For ${profile.company} — ${profile.signatory}, ${profile.designation||'Authorised signatory'}`)];const children=[p('For '+profile.company,true)];const runs=[];if(images.signature)runs.push(image(images.signature,120,45));if(images.stamp)runs.push(image(images.stamp,65,65));if(runs.length)children.push(new Paragraph({children:runs,spacing:{before:80,after:60}}));children.push(p(profile.signatory),p(profile.designation||'Authorised signatory'));return children;}
function ordinarySection(args,children,ready){return {properties:{page:{size:{...A4,orientation:PageOrientation.PORTRAIT},margin:{top:2000,bottom:1250,left:720,right:720,header:280,footer:280}}},...pageParts({...args,ready}),children:[...profileDetails(args.profile),...children]};}
function packDoc(bid,title,sections){return Packer.toBlob(new Document({creator:'TenderScope',title:`${bid.bid_number} ${title}`,styles:{default:{document:{run:{font:'Arial',size:20,color:'000000'},paragraph:{spacing:{after:80,line:240}}}}},sections}));}
const border={style:BorderStyle.SINGLE,size:4,color:'D9D9D9'};
function cell(children,width,header=false){return new TableCell({width:{size:width,type:WidthType.DXA},margins:{top:90,bottom:90,left:90,right:90},verticalAlign:VerticalAlign.CENTER,shading:header?{fill:'E8EDF2'}:undefined,borders:{top:border,bottom:border,left:border,right:border},children});}
function specFragments(value){let rest=text(value);const parts=[];while(rest.length>1000){let cut=rest.lastIndexOf(' ',1000);if(cut<500)cut=1000;else cut++;parts.push(rest.slice(0,cut));rest=rest.slice(cut);}parts.push(rest);return parts;}
export async function complianceDocx({bid,profile,items,offers={},images={},review={}}){
 validateProfile(profile);const rows=complianceRows(items,offers),verification=documentVerification({bid,profile,items,offers,images,review}),ready=verification.ready;
 const displayRows=rows.flatMap(i=>specFragments(i.specification).map((specification,index)=>({...i,specification,continuation:index>0})));
 const widths=[1800,2850,2400,1600,1000],headings=['Item and quantity','Exact buyer specification','Offered OEM product and pack','Product photograph','Status'];
 const table=new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:widths,rows:[new TableRow({tableHeader:true,children:headings.map((h,j)=>cell([p(h,true)],widths[j],true))}),...displayRows.map(i=>new TableRow({cantSplit:true,children:[
 cell(lines(`${i.continuation?'Continued item ':''}${i.item_number||''}. ${i.name}\nQuantity: ${i.quantity??'Not specified'} ${i.unit||''}${i.pack?'\nPack: '+i.pack:''}${i.pvms||i.niv?'\nPVMS/NIV: '+(i.pvms||i.niv):''}${i.consignee?'\nConsignee: '+i.consignee:''}`),widths[0]),
 cell(lines(i.specification||'Source specification pending'),widths[1]),cell(lines(i.offer||'Offer selection pending'),widths[2]),
 cell(i.photo&&i.photoVerified?[new Paragraph({children:[image(i.photo,90,88)],alignment:AlignmentType.CENTER})]:[p('Photo review pending')],widths[3]),cell([p(i.response,true)],widths[4])]}))]});
 const intro=[p('To,'),p('The Competent Authority',true),...lines([bid.buyer,bid.buyer_address].filter(Boolean).join('\n')),p(`Subject: Technical offer for ${bid.title||bid.bid_number}`,true),p('We submit the following item-wise technical offer against the buyer requirements.'),table,...closing(profile,images,ready)];
 return packDoc(bid,'Technical Offer',[ordinarySection({bid,profile,images},intro,ready)]);
}
export async function atcAcceptanceDocx({bid,profile,clauses=[],amendments=[],acceptanceAuthorized=false,images={},review={}}){
 validateProfile(profile);if(!clauses.length||clauses.some(c=>!clean(typeof c==='string'?c:c.text)))throw Error('Complete verbatim buyer ATC clauses are required.');
 const blockers=[...(review.blockers||[])];if(!acceptanceAuthorized)blockers.push('Unconditional acceptance is not authorised');const ready=release(review,blockers),content=[p('To,'),p('The Competent Authority',true),p(bid.buyer||''),p(`Subject: Buyer added terms and conditions for ${bid.bid_number}`,true)];
 const effective=clauses.map(c=>({id:typeof c==='string'?null:c.id,text:typeof c==='string'?c:c.text}));
 for(const a of amendments)if(a.replacementText){
  if(!clean(a.originalClause))throw Error('Identify the clause replaced by each corrigendum.');
  const selector=clean(a.originalClause),matches=effective.map((c,i)=>({c,i})).filter(({c})=>c.id===selector||c.text===selector||c.text.startsWith(selector+'. ')||c.text.startsWith(selector+') '));
  if(matches.length!==1)throw Error('The amended clause must match exactly one supplied original clause.');effective[matches[0].i].text=a.replacementText;
 }
 for(const a of amendments)if(!a.replacementText&&(!clean(a.originalText)||!clean(a.amendmentText)||effective.filter(c=>c.text===a.originalText).length!==1))throw Error('A partial amendment requires exact original and amendment text matching one supplied clause.');
 for(const clause of effective){const partials=amendments.filter(a=>!a.replacementText&&a.originalText===clause.text);if(partials.length)content.push(p('Original provision',true));content.push(...lines(clause.text));for(const a of partials)content.push(p('Applicable amendment'+(a.source?' — '+a.source:''),true),...lines(a.amendmentText));}
 if(acceptanceAuthorized)content.push(p(`We hereby accept all the terms and conditions of GeM Bid No. ${bid.bid_number}, including the Buyer Added Terms and Conditions and applicable corrigenda, without reservation.`));else content.push(p('Participant acceptance is pending review.'));
 content.push(...closing(profile,images,ready));return packDoc(bid,'ATC Acceptance',[ordinarySection({bid,profile,images},content,ready)]);
}
function boundText(value,profile,bid){const result=text(value).replace(/\{\{([^{}]+)\}\}/g,(_,binding)=>resolveBinding({binding:binding.trim()},profile,bid));if(result.includes('{{')||result.includes('}}'))throw Error('Unresolved participant template placeholder.');return result;}
export async function editableAnnexureDocx({bid,profile,template,images={},review={}}){
 validateProfile(profile);if(!template?.title||!Array.isArray(template.blocks)||!template.blocks.length)throw Error('An explicitly mapped editable annexure template is required.');
 const blockers=[...(review.blockers||[])];if(template.sourceVerified!==true)blockers.push('Prescribed source template has not been verified');const ready=release(review,blockers),children=[];
 if(template.includeTitle!==false)children.push(p(boundText(template.title,profile,bid),true));
 for(const block of template.blocks){
  if(block.type==='paragraph'){children.push(...lines(boundText(block.text,profile,bid),Boolean(block.bold)));continue;}
  if(block.type==='pageBreak'){children.push(new Paragraph({pageBreakBefore:true,children:[]}));continue;}
  if(block.type!=='table'||!Array.isArray(block.rows))throw Error('Unsupported annexure block. Only mapped paragraphs and native tables are supported.');
  const widths=block.columnWidths;if(!Array.isArray(widths)||!widths.length||widths.some(v=>!Number.isFinite(v)||v<=0))throw Error('Prescribed table column widths are required.');
  children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:widths,rows:block.rows.map(row=>new TableRow({tableHeader:Boolean(row.header),cantSplit:row.allowSplit===true?false:true,children:row.cells.map((c,index)=>{const v=c.binding?resolveBinding(c,profile,bid):boundText(c.text,profile,bid);return new TableCell({width:{size:c.width||widths[index]||widths[0],type:WidthType.DXA},columnSpan:c.colSpan,rowSpan:c.rowSpan,verticalAlign:VerticalAlign.CENTER,margins:{top:80,bottom:80,left:80,right:80},borders:{top:border,bottom:border,left:border,right:border},children:lines(v,Boolean(c.bold))});})}))}));
 }
 const landscape=template.orientation==='landscape',width=template.width||A4.width,height=template.height||A4.height;
 const size={width:Math.min(width,height),height:Math.max(width,height),orientation:landscape?PageOrientation.LANDSCAPE:PageOrientation.PORTRAIT};
 const margins={top:900,bottom:900,left:720,right:720,header:250,footer:250,...template.margins};
 return packDoc(bid,template.title,[{properties:{page:{size,margin:margins}},...pageParts({bid,profile,images,ready,branding:template.allowLetterhead===true}),children}]);
}
function wrap(font,value,size,width){const out=[];for(const line of text(value).split('\n')){let current='';for(const word of line.split(/\s+/)){const next=current?current+' '+word:word;if(current&&font.widthOfTextAtSize(next,size)>width){out.push(current);current=word;}else current=next;}out.push(current);}return out;}
export async function compliancePdf({bid,profile,items,offers={},images={},fontBytes,review={}}){
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 validateProfile(profile);const rows=complianceRows(items,offers),ready=documentVerification({bid,profile,items,offers,images,review}).ready,doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});let page,y;
 const newPage=()=>{page=doc.addPage([595.28,841.89]);y=672;};
 const put=(v,size=10)=>{for(const line of wrap(font,v,size,505)){if(y<130)newPage();page.drawText(line,{x:45,y,size,font});y-=size+5;}};
 newPage();if(clean(profile.address))put('Registered address: '+profile.address);const contact=[['Email',profile.email],['Phone',profile.phone]].filter(([,v])=>clean(v)).map(([k,v])=>`${k}: ${v}`).join(' | ');if(contact)put(contact);if(identity(profile))put(identity(profile),9);put('To, The Competent Authority');put(bid.buyer||'');put(`Technical offer for ${bid.title||bid.bid_number}`,12);y-=6;
 for(const i of rows){if(y<260)newPage();put(`${i.item_number||''}. ${i.name}`,12);put(`Quantity: ${i.quantity??'Not specified'} ${i.unit||''}${i.pack?' | Pack: '+i.pack:''}${i.pvms||i.niv?' | PVMS/NIV: '+(i.pvms||i.niv):''}`);if(i.consignee)put('Consignee: '+i.consignee);put('Buyer specification: '+(i.specification||'Source specification pending'));put('Offered OEM product and pack: '+(i.offer||'Offer selection pending'));put('Compliance: '+i.response);
  if(i.photo&&i.photoVerified){const im=await doc[i.photo.type==='png'?'embedPng':'embedJpg'](i.photo.bytes),s=fitImage(i.photo,115,82);if(y<130+s.height)newPage();page.drawImage(im,{x:45,y:y-s.height,width:s.width,height:s.height});y-=s.height+10;}else put('Product photograph review pending');y-=15;
 }
 if(y<220)newPage();put('For '+profile.company);put(profile.signatory);put(profile.designation||'Authorised signatory');
 if(ready){for(const [key,x] of [['signature',45],['stamp',200]])if(images[key]){const im=await doc[images[key].type==='png'?'embedPng':'embedJpg'](images[key].bytes),s=fitImage(images[key],100,50);page.drawImage(im,{x,y:y-s.height,width:s.width,height:s.height});}}
 for(const [index,pg] of doc.getPages().entries()){
  if(images.header){const im=await doc[images.header.type==='png'?'embedPng':'embedJpg'](images.header.bytes),s=fitImage(images.header,505,65);pg.drawImage(im,{x:45,y:765,width:s.width,height:s.height});}else pg.drawText(profile.company,{x:45,y:795,size:15,font});
  pg.drawText(bid.bid_number,{x:45,y:735,size:10,font});if(!ready)pg.drawText(DRAFT,{x:45,y:710,size:10,font});
  if(images.footer){const im=await doc[images.footer.type==='png'?'embedPng':'embedJpg'](images.footer.bytes),s=fitImage(images.footer,505,32);pg.drawImage(im,{x:45,y:50,width:s.width,height:s.height});}
  pg.drawText(`${!ready?'DRAFT / BLOCKED | ':''}${bid.bid_number} | Page ${index+1} of ${doc.getPageCount()}`,{x:45,y:25,size:8,font});
 }
 return doc.save();
}
export function resolveBinding(field,profile,bid){if(!['company','address','gstin','pan','udyam','email','phone','signatory','designation','place','licence','license','licences','bid_number','date','custom'].includes(field.binding))throw Error(`Unknown participant binding: ${field.binding}`);const value=field.binding==='bid_number'?bid.bid_number:field.binding==='date'?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata'}).format(new Date()):field.binding==='custom'?field.value:profile[field.binding];if(!clean(value))throw Error(`Missing participant value: ${field.binding}`);return text(value);}
export async function fillAnnexures({bytes,fields,profile,bid,images={},fontBytes,pages,review={}}){
 const {default:fontkit}=await import('@pdf-lib/fontkit');
 validateProfile(profile);if(!fields.length)throw Error('Map the annexure fields before exporting.');
 const doc=await PDFDocument.load(bytes);if(doc.getPages().some(p=>p.getRotation().angle!==0))throw Error('Rotated source pages require normalization before field mapping.');
 doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});
 for(const f of fields){
  const page=doc.getPage(f.page-1);if(!page)throw Error('Invalid annexure page.');
  if(f.formName){doc.getForm().getTextField(f.formName).setText(resolveBinding(f,profile,bid));continue;}
  if(!Number.isFinite(f.width??.35)||(f.width??.35)<=0||(f.width??.35)>1||!Number.isFinite(f.size??10)||(f.size??10)<6||(f.size??10)>24)throw Error('Invalid field size.');
  const {width,height}=page.getSize(),x=f.x*width,y=(1-f.y)*height,w=(f.width||.35)*width,h=f.height||16;
  if(!Number.isFinite(h)||h<=0||h>150||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x+w>width||y+h>height)throw Error('A mapped field is outside the page.');
  if(['signature','stamp','header','footer'].includes(f.binding)){if(['signature','stamp'].includes(f.binding)&&!release(review))throw Error('Signature and stamp placement requires completed source, content, rendered-page and execution review.');const data=images[f.binding];if(!data)throw Error(`Upload the ${f.binding} image.`);const img=await doc[data.type==='png'?'embedPng':'embedJpg'](data.bytes),s=fitImage(data,w,h);page.drawImage(img,{x,y,width:s.width,height:s.height});}
  else{const value=resolveBinding(f,profile,bid),size=f.size||10;if(font.widthOfTextAtSize(value,size)>w)throw Error(`Value does not fit: ${f.binding}. Increase its width or reduce font size.`);page.drawText(value,{x,y,size,font,color:rgb(0,0,.15)});}
 }
 doc.getForm().updateFieldAppearances(font);doc.getForm().flatten();
 if(!release(review))for(const page of doc.getPages())page.drawText('DRAFT / BLOCKED - NOT FOR UPLOAD',{x:10,y:8,size:8,font,color:rgb(.5,.1,.1)});
 if(pages?.length){if(new Set(pages).size!==pages.length||pages.some(p=>!Number.isInteger(p)||p<1||p>doc.getPageCount()))throw Error('Invalid annexure page selection.');const out=await PDFDocument.create();for(const page of await out.copyPages(doc,pages.map(n=>n-1)))out.addPage(page);return out.save();}
 return doc.save();
}
