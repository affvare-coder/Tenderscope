// GeM identifies these two attachments by the row carrying the View File link.
// The OrderItem directory called BoqDocument holds the specification PDF.
export function officialAttachmentKind(url, label='') {
 let u;
 try {u=new URL(url);} catch {return null;}
 if(u.protocol!=='https:' || !/(^|\.)gem\.gov\.in$/i.test(u.hostname) || u.username || u.password || u.port)return null;
 const path=u.pathname.toLowerCase();
 if(/\/orderitem\/boqdocument\/|\/specificationdocument\//.test(path)&&path.endsWith('.pdf'))return 'specification';
 if(/\/boqlineitemsdocument\//.test(path)&&path.endsWith('.csv'))return 'boq_csv';
 if(/^Specification Document$|^View Specification$/i.test(label.trim()) && !path.endsWith('.csv'))return 'specification';
 if(/^BOQ Detail Document$/i.test(label.trim()) && !path.endsWith('.pdf'))return 'boq_csv';
 return null;
}

// PDF coordinates are in user space. Use only labels on the actual link row.
export function annotationLabel(tokens,rect) {
 if(!Array.isArray(rect)||rect.length!==4)return '';
 const bottom=Math.min(rect[1],rect[3]),top=Math.max(rect[1],rect[3]);
 const text=tokens.filter(t=>t.str && t.transform?.[4]<Math.max(rect[0],rect[2])
   && t.transform[5]>=bottom-2 && t.transform[5]<=top+2)
   .sort((a,b)=>a.transform[4]-b.transform[4]).map(t=>t.str).join(' ').replace(/\s+/g,' ');
 return text.match(/\b(Specification Document|BOQ Detail Document|View Specification)\b/i)?.[1]||'';
}
