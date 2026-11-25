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

import {compareSchedule} from '../ops/source-review/schedule-pdf.mjs';
const columns=['Item Number','Item Title','Item Description','Item Quantity','Unit of Measure','Consignee ID','Delivery Period (In number of days)'];
const glyph=(str,x,y,width=str.length*5)=>({str,transform:[1,0,0,1,x,y],width});
test('native technical schedule preserves split words and rejects quantity or missing text',()=>{
 const records=[columns,['1','ECG Electrodes','ECG Electrodes','2','Nos','Receiver A','15']];
 const header=['TECH SPECS: EQUIPMENT','Ser No','Items','Qty','A/U'].map((v,i)=>glyph(v,i*30,150));
 const body=[glyph('1',10,120),glyph('ECG E',60,120,25),glyph('lectrodes',85.1,120),glyph('2',240,120),glyph('Nos',290,120)];
 const result=compareSchedule([...header,...body],records);
 assert.equal(result[0].specification,'ECG Electrodes');
 assert.equal(result[0].delivery_days,'15');
 assert.equal(compareSchedule([...header,...body.slice(0,-1)],records),null);
 assert.equal(compareSchedule([...header,...body],[columns,[...records[1].slice(0,3),'3',...records[1].slice(4)]]),null);
});
test('printed CSV specification keeps buyer decimal points and flags conflicts',()=>{
 const longHeader=['Item','Number','Item Title','Item Description','Item','Quantity','Unit of','Measure','Consignee ID','Delivery Period (In','number of days)'];
 const positions=[8,8,60,155,255,255,305,305,360,420,420];
 const header=longHeader.map((v,i)=>glyph(v,positions[i],150));
 const row=['1','Film','Size 6.5x8.5','1','Nos','A','15'];
 const body=row.map((v,i)=>glyph(v,[8,60,155,255,305,360,420][i],120));
 const csv=[...row];csv[2]='Size 65x85';
 const result=compareSchedule([...header,...body],[columns,csv]);
 assert.equal(result[0].specification,'Size 6.5x8.5');
 assert.match(result[0].question,/different wording/);
 assert.equal(compareSchedule([...header,...body],[columns,row])[0].question,null);
});
test('centred PDF column headings can have left-aligned data cells',()=>{
 const heading=['Item','Number','Item Title','Item Description','Item','Quantity','Unit of','Measure','Consignee ID','Delivery Period (In','number of days)'];
 const labels=[51,42,153,313,460,450,511,507,578,690,695];
 const row=['1','Buyer item','Exact wording','10','Nos','Receiver A','20'];
 const tokens=heading.map((s,i)=>glyph(s,labels[i],570)).concat(row.map((s,i)=>glyph(s,[42,91,270,446,505,560,728][i],547)));
 const result=compareSchedule(tokens,[columns,row]);assert.equal(result[0].specification,'Exact wording');
});
