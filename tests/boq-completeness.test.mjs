import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBoqCompleteness,verifiedExpectedCount} from '../boq-completeness.mjs';
import {documentVerification} from '../document-core.mjs';

const url='https://mkp.gem.gov.in/uploaded_documents/boq.csv',hash='official-sha';
const docs=[{official_url:url,content_hash:hash,availability:'available'}];
const evidence=n=>({count:n,verified:true,source_type:'official_boq_csv',source_location:'BOQ CSV line schedule count',source_url:url,source_hash:hash});
const row=n=>({item_key:String(n),item_number:String(n),name:'Product '+n,quantity:2,unit:'packs',specification:'Active constituent 2 mg; pack of 10',specification_verified:true,source_url:url,source_hash:hash,is_current:true});

test('official 10 schedules, 2 verified rows => Partial 2 of 10, never Complete',()=>{
 const v=assessBoqCompleteness({items:[row(1),row(2)],documents:docs,expectedCountEvidence:evidence(10)});
 assert.equal(v.state,'Partial');assert.equal(v.verified_item_count,2);assert.equal(v.expected_item_count,10);assert.equal(v.ready,false);
 assert.match(v.label,/2 of 10/);assert.match(v.issues.join(' '),/differs/);
});

test('empty BOQ is Unverified; official missing count is not guessed from K',()=>{
 const zero=assessBoqCompleteness({items:[],documents:docs,expectedCountEvidence:evidence(5)});
 assert.equal(zero.state,'Unverified');assert.match(zero.label,/0 of 5/);
 const unknown=assessBoqCompleteness({items:[row(1)],documents:docs});
 assert.equal(unknown.state,'Extracted');assert.equal(unknown.expected_item_count,null);assert.match(unknown.label,/total count pending/);
});

test('Complete only when independent official count, hashes, units, quantities and full specification comparisons all pass',()=>{
 const v=assessBoqCompleteness({items:[row(1),row(2)],documents:docs,expectedCountEvidence:evidence(2)});
 assert.equal(v.state,'Complete');assert.equal(v.ready,true);assert.equal(v.specification_confirmed_count,2);
 const notCompared=assessBoqCompleteness({items:[{...row(1),specification_verified:false},row(2)],documents:docs,expectedCountEvidence:evidence(2)});
 assert.equal(notCompared.state,'Partial');assert.equal(notCompared.verified_item_count,1);assert.equal(notCompared.ready,false);
});

test('SCH 1, missing spec/quantity/unit and stale hash are excluded from K',()=>{
 const items=[row(1),{...row(2),name:'S C H - 2'},{...row(3),specification:'Not extracted'},
  {...row(4),quantity:null},{...row(5),unit:'Unknown'},{...row(6),source_hash:'stale'}];
 const v=assessBoqCompleteness({items,documents:docs,expectedCountEvidence:evidence(6)});
 assert.equal(v.state,'Partial');assert.equal(v.verified_item_count,1);assert.equal(v.ready,false);
 assert.match(v.issues.join(' '),/anonymous/);assert.match(v.issues.join(' '),/SHA/);
});

test('duplicate item keys, previously extracted old rows, and overcount cannot pass',()=>{
 const items=[row(1),{...row(1)},row(2),{...row(3),is_current:false}];
 const v=assessBoqCompleteness({items,documents:docs,expectedCountEvidence:evidence(2)});
 assert.equal(v.verified_item_count,2);assert.equal(v.state,'Partial');assert.ok(v.issues.some(s=>/duplicate/.test(s)));
 assert.equal(assessBoqCompleteness({items:[row(1),row(2),row(3)],documents:docs,expectedCountEvidence:evidence(2)}).ready,false);
});

test('fabricated, non-GeM or hash-stale expected counts cannot make Complete',()=>{
 for(const candidate of [
  {...evidence(1),source_hash:'wrong'},
  {...evidence(1),source_url:'https://evil.example/a'},
  {...evidence(1),verified:false},
  {...evidence(1),source_location:''},
  {...evidence(1),count:1.2},
  {...evidence(1),source_type:'extracted_item_rows'}
 ]){
  assert.equal(verifiedExpectedCount(candidate,docs),null);
  assert.equal(assessBoqCompleteness({items:[row(1)],documents:docs,expectedCountEvidence:candidate}).state,'Extracted');
 }
});

test('final compliance sign-off is blocked even with all review flags and verified offer, unless the bid is Complete',()=>{
 const item=row(1);
 const profile={company:'Fixture Bidder',signatory:'Authorised Officer'};
 const offers={'1':{offer:'Exact product',verified:true,evidence:'Manufacturer catalogue p1',response:'Yes',photoRequired:false}};
 const review={confirmed:true,sourceVerified:true,rendered:true,executionAuthorized:true};
 const base={bid:{bid_number:'GEM/2026/B/12345'},profile,items:[item],sourceItems:[item],documents:docs,offers,review};
 const pending=documentVerification({...base,expectedCountEvidence:evidence(2)});
 assert.equal(pending.ready,false);assert.match(pending.blockers.join(' '),/BOQ reconciliation/);
 const unknown=documentVerification(base);assert.equal(unknown.ready,false);
 const okay=documentVerification({...base,expectedCountEvidence:evidence(1)});
 assert.equal(okay.ready,true);assert.equal(okay.boq.state,'Complete');
});

test('legacy current rows without independent parameter review never count as verified K',()=>{
 const noProof={...row(1),specification_verified:undefined};
 const v=assessBoqCompleteness({items:[noProof],documents:docs,expectedCountEvidence:evidence(1)});
 assert.equal(v.state,'Unverified');assert.equal(v.verified_item_count,0);assert.equal(v.ready,false);
});
test('ATC-only references are not full buyer specifications even when mistakenly flagged',()=>{
 const rowWithPointer={...row(1),specification:'As per the Specification attached in the ATC'};
 const v=assessBoqCompleteness({items:[rowWithPointer],documents:docs,expectedCountEvidence:evidence(1)});
 assert.equal(v.state,'Unverified');assert.equal(v.verified_item_count,0);
});
