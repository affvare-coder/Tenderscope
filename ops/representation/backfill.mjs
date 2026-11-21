// Read-only reconciliation of the current public feed. No bidder data or service credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {pdfLines,readPage} from './evidence.mjs';
const app=await readFile('app.js','utf8');
const key=app.match(/const KEY = '([^']+)'/)[1], api='https://tenderscope-healthcare.netlify.app/api/public/';
const apiGet=async (path)=>{const res=await fetch(api+path,{headers:{apikey:key},signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('public feed '+res.status);return res.json();};
const official=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)gem\.gov\.in$/.test(u.hostname);}catch{return false;}};
async function download(url){
 for(let n=0;n<4;n++){if(!official(url))throw Error('Unrecognised official URL');
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(18000)});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();url=new URL(r.headers.get('location'),url).href;continue;}
  if(!r.ok){await r.body?.cancel();throw Error('HTTP '+r.status);}
  const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>20*1024*1024)throw Error('Size limit');chunks.push(c);}return Buffer.concat(chunks);
 }throw Error('Redirect limit');
}
const started=Date.now(),jobs=[],seen=new Set();
for(let offset=0;;offset+=40){
 const search=new URLSearchParams({p_view:'published92',p_sort:'newest',p_offset:offset,p_limit:40});
 const {rows,total}=await apiGet('rpc/public_tender_feed?'+search);
 for(const t of rows){if(!seen.has(t.id)&&started-Date.parse(t.published_at)<=72*3600000){jobs.push(t);seen.add(t.id);}}
 if(!rows.length||offset+rows.length>=total)break;
}
let at=0;const result=[];
async function process(t){
 const out={id:t.id,bid:t.bid_number,title:t.title,buyer:t.buyer,published_at:t.published_at,deadline:t.deadline,docs:[]};
 const sources=new Map([[t.source_url,'bid']]);const follow=(url,kind)=>{if(official(url)&&!sources.has(url))sources.set(url,kind);};
 try{for(const d of await apiGet('tender_documents?select=kind,official_url,availability&tender_id=eq.'+t.id))if(d.availability!=='removed')follow(d.official_url,d.kind);}catch(e){out.list_error=e.message;}
 for(const [url,kind] of sources){
  if(out.docs.length>=35){out.additional_sources=sources.size-out.docs.length;break;}
  const d={url,kind};out.docs.push(d);
  try{
   const b=await download(url);d.sha=createHash('sha256').update(b).digest('hex');
   if(/\.csv(?:[?#]|$)/i.test(url)){const text=new TextDecoder('utf-8',{fatal:true}).decode(b);if(!/Item (Title|Description)/i.test(text.slice(0,800)))throw Error('Unrecognised BOQ header');d.csv=text;continue;}
   if(!b.subarray(0,1024).includes('%PDF'))throw Error('Unsupported source format');
   const pdf=await getDocument({data:new Uint8Array(b),disableFontFace:true,isEvalSupported:false,useSystemFonts:false}).promise;
   try{ d.pages=pdf.numPages;d.review=[];let size=0;
    for(let i=1;i<=Math.min(pdf.numPages,180);i++){const p=await pdf.getPage(i);
     const lines=pdfLines((await p.getTextContent()).items);
     if(i===1&&kind==='bid'&&!lines.join(' ').toUpperCase().includes(t.bid_number)){throw Error('Bid identity mismatch');}
     const source=readPage(i,lines,kind!=='bid');
     if(source.section){size+=source.section.text.length;if(size>125000){source.section=null;d.section_limit=true;}}
     d.review.push(source);
     for(const a of await p.getAnnotations()){const u=a.url||a.unsafeUrl;if(u&&/(uploaded_documents|buyer_documents|contract\/slafds|showcorr|bidding-corr)/i.test(u))follow(u,/corrigendum|showcorr|bidding-corr/i.test(u)?'corrigendum':/contract\/slafds/i.test(u)?'atc':/boq/i.test(u)?'boq':'specification');}
     p.cleanup();
    }
   }finally{await pdf.destroy();}
  }catch(e){d.error=String(e.message).slice(0,180);}
 }
 return out;
}
await Promise.all(Array.from({length:4},async()=>{while(at<jobs.length){const t=jobs[at++];result.push(await process(t));if(result.length%20===0)console.log('Bids checked',result.length,'of',jobs.length);}}));
await writeFile('representation-reconciliation.json',JSON.stringify({baseline:new Date(started).toISOString(),requested:jobs.length,result}));
console.log('Audited',result.length,'bids and',result.reduce((n,t)=>n+t.docs.filter(d=>!d.error).length,0),'sources');
