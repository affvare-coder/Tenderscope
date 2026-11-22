import test from 'node:test';
import assert from 'node:assert/strict';
import {officialScheduleCount} from '../ops/source-review/official-count.mjs';
import {readBidFields} from '../ops/source-review/eligibility.mjs';
const header='Item Number,Item Title,Item Description,Item Quantity,Unit of Measure\r\n';
const source=s=>new TextEncoder().encode(header+s);
test('count original CSV records with quoted breaks, rejecting gaps and broken records',()=>{
 assert.equal(officialScheduleCount(source('1,"Drug, pack","first\nsecond",12,each\r\n2,Drug,Description,1,piece')),2);
 for(const s of ['1,Drug,D,1,each\n3,Drug,D,1,each','1,"Drug,D,1,each','1,Drug,D,1,each\n1,Drug,D,1,each'])
  assert.equal(officialScheduleCount(source(s)),null);
});
test('commercial fields retain their source page and restrict affirmative flags to explicit wording',()=>{
 const token=(str,x,y)=>({str,transform:[0,0,0,0,x,y]});
 const facts=readBidFields([token('/Bid to RA enabled',130,630),token('No',276,630),
  token('/Evaluation Method',101,580),token('Total value wise evaluation',276,580)],2);
 assert.equal(facts.ra.quote,'No');assert.equal(facts.evaluation.page,2);assert.equal(facts.emd,undefined);
});
