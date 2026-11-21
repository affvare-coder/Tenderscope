import test from 'node:test';
import assert from 'node:assert/strict';
import {readPage,mergePages,collectReview} from '../ops/representation/evidence.mjs';
import {catalogueCandidate} from '../oem-catalogue.mjs';
test('filing clock needs explicit publication wording in the representation clause',()=>{
 const clause='Use the Representation window in Seller dashboard within 4 days of bid publication.';
 assert.equal(readPage(3,[clause]).window.hours,96);
 assert.equal(readPage(3,['Time allowed for technical clarification: 2 Days']).window,null);
 assert.equal(collectReview([readPage(3,[clause]),readPage(8,[clause.replace('4 days','72 hours')])]).filing_hours,null);
});
test('capture product quantity, buyer text and source location, preserve unreadable page gaps',()=>{
 const p=readPage(2,['Diagnostic Audiometer ( 1 pieces )','Technical Specifications','Number of channels  1, 2']);
 assert.equal(p.products[0].quantity,'1');assert.match(p.section.text,/Number of channels  1, 2/);
 const empty=readPage(3,[],true);assert.equal(empty.needs_image_review,true);
 assert.equal(mergePages([p],[p,empty]).length,2);
 assert.equal(collectReview([p],4).review_limited,true);
});
test('photo-backed OEM candidate requires the exact linked PDF version, row and unresolved-issue check',()=>{
 const row={number:7,item_number:'7',specification:'Ibuprofen 400 mg Tab',specification_verified:true,spec_url:'https://mkp.gem.gov.in/spec.pdf',spec_sha:'688842681d3e4536b55a10753fb22e1512b7be1f850c01b3c4d77f7d7d9726dc'};
 assert.match(catalogueCandidate(row).offer,/400 mg/);
 for(const change of [{spec_sha:'changed'},{source_question:'confirm pack'},{spec_url:null},{specification_verified:false},{specification:'Ibuprofen 200 mg Tab'}])assert.equal(catalogueCandidate({...row,...change}),null);
});

import {officialAttachmentKind,annotationLabel} from '../ops/representation/attachment-roles.mjs';
import {specificationTable} from '../ops/representation/specification-table.mjs';
test('keep both GeM document roles when identical View File anchors occur on adjacent rows',()=>{
 const t=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
 const tokens=[t('Specification Document',20,60),t('View File',120,60),t('BOQ Detail Document',20,44),t('View File',120,44)];
 assert.equal(annotationLabel(tokens,[120,57,150,68]),'Specification Document');
 assert.equal(annotationLabel(tokens,[120,41,150,52]),'BOQ Detail Document');
 const base='https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/';
 assert.equal(officialAttachmentKind(base+'BoqDocument/atc.PDF?download=1'),'specification');
 assert.equal(officialAttachmentKind(base+'BoqLineItemsDocument/spec.csv'),'boq_csv');
 assert.equal(officialAttachmentKind('https://bidplus.gem.gov.in/other.pdf'),null);
 assert.equal(officialAttachmentKind('https://mkp.gem.gov.in.example.com/OrderItem/BoqDocument/a.pdf'),null);
 const rows=specificationTable([t('S No.',10,80),t('Item Name',70,80),t('Technical Specifications',170,80),t('Quantity',310,80),t('1',10,65),t('Monitor',70,65),t('Two channels',175,65),t('1',310,65),t('independent',174,54),t('2',10,42),t('Cable',70,42),t('2 m',175,42)]);
 assert.deepEqual(rows,[{n:'1',name:'Monitor',wording:'Two channels\nindependent'},{n:'2',name:'Cable',wording:'2 m'}]);
});
