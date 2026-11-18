import test from 'node:test';
import assert from 'node:assert/strict';
import {BID_AI_ACTIONS,BID_AI_SECONDARY_ACTIONS,buildBidActionPrompt,publicBidActionAIUrl,officialDocumentRecords} from '../document-workflow.mjs';
const bid={bid_number:'GEM/2026/B/8261632',title:'Dental materials',buyer:'Indian Army',source_url:'https://bidplus.gem.gov.in/showbidDocument/10153146',deadline:'2026-11-21T14:30:00Z',last_source_checked_at:'2026-11-16T12:00:00Z'};
const docs=[{title:'Buyer ATC',official_url:'https://fulfilment.gem.gov.in/contract/slafds?fileDownloadPath=a.pdf',content_hash:'abc'},{title:'Untrusted',official_url:'https://evil.example/file.pdf'},{title:'Duplicate',official_url:bid.source_url}];
test('four primary tasks retain the existing focused document and review workflows',()=>{
  assert.deepEqual(BID_AI_ACTIONS.map(a=>a.id),['oem','suppliers','documents','review']);
  assert.deepEqual(BID_AI_SECONDARY_ACTIONS.map(a=>a.id),['compliance','atc','restrictions','clarification','representation']);
});
test('each task uses official GeM links without disclosing participant information',()=>{
  for(const a of [...BID_AI_ACTIONS,...BID_AI_SECONDARY_ACTIONS]){
    const url=publicBidActionAIUrl({bid,documents:docs,items:[],action:a.id});
    assert.match(url,/^https:\/\/chatgpt\.com\/\?q=/);
    const prompt=new URL(url).searchParams.get('q');
    assert.ok(prompt.includes(bid.bid_number));
    assert.ok(prompt.includes('https://bidplus.gem.gov.in/showbidDocument/'));
    assert.ok(prompt.includes('https://fulfilment.gem.gov.in/'));
    assert.ok(!prompt.includes('evil.example'));
    assert.ok(!prompt.includes('affixhealthcare2013@gmail.com'));
    assert.ok(!prompt.includes('Company is Affix Healthcare'));
    assert.ok(prompt.includes('current'));
  }
});
test('restrictive-clause audit considers legitimate buyer justifications and evidence',()=>{
 const p=buildBidActionPrompt({bid,documents:docs,action:'restrictions'});
 assert.match(p,/buyer justification/i);
 assert.match(p,/source file, section\/page/i);
 assert.match(p,/never assert illegality/i);
});
test('representation requires basis and avoids unsupported legal assertions',()=>{
 const p=buildBidActionPrompt({bid,documents:docs,action:'representation'});
 assert.match(p,/If evidence is insufficient/);
 assert.match(p,/respectful/);
 assert.match(p,/current authoritative government/);
 assert.match(p,/Never invent bidder name/);
});
test('fails closed for invalid tasks and missing bid',()=>{
 assert.throws(()=>buildBidActionPrompt({bid,action:'forged'}));
 assert.throws(()=>buildBidActionPrompt({bid:{},action:'compliance'}));
});
test('whitelists official hosts and deduplicates source documents',()=>{
 const r=officialDocumentRecords(bid,docs);
 assert.equal(r.length,2);
 assert.ok(r.every(d=>d.url.startsWith('https://')));
});

test('supplier workflow verifies published business contacts and only drafts communications',()=>{
 const p=buildBidActionPrompt({bid,documents:docs,action:'suppliers'});
 assert.match(p,/WhatsApp only when the company explicitly publishes it/);
 assert.match(p,/verified intended business recipient/);
 assert.match(p,/Do not send an email/);
 assert.match(p,/applicable licences\/certifications/);
 assert.match(p,/Do not make an unsupported compliance declaration/);
});
test('combined documents require exact source forms and evidence before Yes',()=>{
 const p=buildBidActionPrompt({bid,documents:docs,action:'documents'});
 assert.match(p,/each buyer-prescribed annexure actually required/);
 assert.match(p,/never mark Yes solely because a product appears similar/);
 assert.match(p,/Do not assume any company/);
 assert.match(p,/Do not provide unconditional acceptance where an unresolved conflict/);
 assert.match(p,/rendered-page verification/);
});
test('combined review chooses the supported response instead of inventing objections',()=>{
 const p=buildBidActionPrompt({bid,documents:docs,action:'review'});
 assert.match(p,/Choose the supported response/);
 assert.match(p,/no supported objection was found/);
 assert.match(p,/buyer justification/);
 assert.match(p,/If evidence is insufficient/);
 assert.match(p,/current authoritative government/);
});
