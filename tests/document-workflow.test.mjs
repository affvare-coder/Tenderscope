import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDocumentInstructions,publicDocumentAIUrl,buildAnnexureTemplate} from '../document-workflow.mjs';
const master=readFileSync(new URL('../assets/compliance-atc-master.txt',import.meta.url),'utf8');
const bid={bid_number:'GEM/2026/B/TEST',title:'Fixture bid',buyer:'Fixture buyer',source_url:'https://bidplus.gem.gov.in/showbidDocument/123'};
test('public AI URL has official sources and scope, never participant fields or arbitrary URLs',()=>{
 const url=publicDocumentAIUrl({bid,kind:'atc',profile:{gstin:'PRIVATE-ID',signature:'PRIVATE-SIGNATURE'},documents:[{official_url:'https://evil.test/?private=1'},{official_url:'https://mkp.gem.gov.in/test.pdf'}]});
 const q=new URL(url).searchParams.get('q'); assert.match(q,/ATC_ACCEPTANCE/);assert.match(q,/compliance-atc-master.txt/);assert.match(q,/mkp.gem.gov.in/);assert.doesNotMatch(q,/PRIVATE|evil.test/);
});
test('complete instruction file includes all repeated BOQ rows and profile only by explicit choice',()=>{
 const items=Array.from({length:105},(_,i)=>({item_key:String(i),name:'Repeated item',specification:'Exact requirement '+i,quantity:i+1,source_url:bid.source_url,source_hash:'fixture'}));
 const args={master,bid,items,profile:{company:'PRIVATE COMPANY',gstin:'PRIVATE GST',password:'NEVER INCLUDE'}};
 const publicBrief=buildDocumentInstructions(args);assert.doesNotMatch(publicBrief,/PRIVATE COMPANY|PRIVATE GST|NEVER INCLUDE/);assert.match(publicBrief,/Exact requirement 104/);assert.match(publicBrief,/"stored_product_row_count": 105/);assert.doesNotMatch(publicBrief,/\{\{BID_NUMBER\}\}/);
 const privateBrief=buildDocumentInstructions({...args,includeProfile:true});assert.match(privateBrief,/PRIVATE COMPANY/);assert.doesNotMatch(privateBrief,/NEVER INCLUDE/);
});
test('editable source builder preserves source wording, blanks and table cells, defaults unverified',()=>{
 const t=buildAnnexureTemplate({title:'Annexure X',orientation:'landscape',text:'Exact wording\n\nName: {{company}}',tableText:'Item\tQuantity\nA\t2',source:'ATC p7'});
 assert.equal(t.orientation,'landscape');assert.equal(t.sourceVerified,false);assert.equal(t.blocks[1].text,'');assert.equal(t.blocks[2].text,'Name: {{company}}');assert.equal(t.blocks[3].rows[1].cells[1].text,'2');
 assert.throws(()=>buildAnnexureTemplate({title:'X',source:'p1',tableText:'A\tB\nC'}),/same number/);
});
