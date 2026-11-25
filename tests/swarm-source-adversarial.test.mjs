import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {assessBoqCompleteness} from '../boq-completeness.mjs';
import {complianceDocx, documentVerification} from '../document-core.mjs';
import {catalogueProof} from '../ops/source-review/catalogue.mjs';
import {officialScheduleCount} from '../ops/source-review/official-count.mjs';
import {compareSchedule} from '../ops/source-review/schedule-pdf.mjs';

const base = 'https://mkp.gem.gov.in/uploaded_documents/';
const csv = base + 'schedule.csv';
const pdf = base + 'specifications.pdf';
const countProof = {count: 2, verified: true, source_type: 'official_boq_csv', source_location: 'CSV serials 1–2', source_url: csv, source_hash: 'csv-1'};
const doc = (official_url, content_hash, availability = 'available') => ({official_url, content_hash, availability});
const docs = [doc(csv, 'csv-1'), doc(pdf, 'pdf-1')];
const item = (number, consignee) => ({item_key: String(number), item_number: String(number), name: 'Dental mirror', quantity: 24,
  unit: 'Nos', specification: 'Front surface, size 5', specification_verified: true, source_url: csv, source_hash: 'csv-1',
  spec_url: pdf, spec_sha: 'pdf-1', spec_page: 1, consignee});
const items = [item(1, 'A'), item(2, 'B')];
const assess = (items, documents = docs, expectedCountEvidence = countProof) => assessBoqCompleteness({items, documents, expectedCountEvidence});

test('linked CSV remains extracted when mandatory PDF is replaced, pending, removed, or missing a digest', () => {
  assert.equal(assess(items).ready, true);
  for (const files of [[docs[0]], [docs[0], doc(pdf, 'pdf-2')], [docs[0], doc(pdf, 'pdf-1', 'pending')], [docs[0], doc(pdf, 'pdf-1', 'removed')]]) {
    const result = assess(items, files);
    assert.equal(result.ready, false);
    assert.equal(result.extracted_item_count, 2);
    assert.equal(result.verified_item_count, 0);
  }
  assert.equal(assess(items.map(row => ({...row, spec_sha: undefined}))).ready, false);
});

test('K=N remains partial when a newly discovered attachment has not been retrieved', () => {
  const result = assess(items, [...docs, doc(base + 'annexure.pdf', null, 'pending')]);
  assert.equal(result.state, 'Partial');
  assert.equal(result.verified_item_count, 2);
  assert.equal(result.ready, false);
  assert.equal(assess(items, [...docs, doc(base + 'annexure.pdf', null, 'removed')]).ready, true);
});

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
async function fetchPack(snapshot) {
  const ctx = vm.createContext({api: async () => structuredClone(snapshot)});
  const start = app.indexOf('async function currentPackSource(');
  const end = app.indexOf('function packHistoryKey(', start);
  vm.runInContext(app.slice(start, end), ctx);
  return ctx.currentPackSource('fixture');
}

test('bid-pack RPC mapping carries certified PDF hash and never promotes un-attested row reviews to Complete', async () => {
  const raw = items.map(({spec_url, spec_sha, spec_page, specification_verified, ...row}) => ({...row, reviewed_specification: true}));
  const snapshot = {version: 'current', bid: {}, items: raw, documents: docs, expected: countProof,
    certified_rows: items.map(row => ({key: row.item_key, spec_url: pdf, spec_sha: row.spec_sha, spec_page: 1}))};
  const pack = await fetchPack(snapshot);
  assert.equal(pack.items[0].spec_sha, 'pdf-1');
  assert.equal(assess(pack.items, pack.documents, pack.expected).ready, true);
  const stale = await fetchPack({...snapshot, documents: [docs[0], doc(pdf, 'pdf-2')]});
  assert.equal(stale.items[0].specification_verified, false);
  assert.equal(assess(stale.items, stale.documents, stale.expected).ready, false);
  const changed = await fetchPack({...snapshot, certified_rows: []});
  assert.equal(assess(changed.items, changed.documents, changed.expected).ready, false);
});

test('a changed specification at the same URL blocks sign-off and keeps Word output a draft', async () => {
  const snapshot = {version: 'current', bid: {bid_number: 'GEM/2026/B/TEST'}, items, documents: docs, expected: countProof,
    certified_rows: items.map(row => ({key: row.item_key, spec_url: pdf, spec_sha: row.spec_sha, spec_page: 1}))};
  const profile = {company:'Test Bidder', signatory:'Test Signatory'};
  const review = {confirmed:true, sourceVerified:true, rendered:true, executionAuthorized:true};
  const offers = Object.fromEntries(items.map(row => [row.item_key, {
    response:'Yes', offer:'Fixture SKU', evidence:'Fixture catalogue', verified:true, photoRequired:false,
  }]));

  const current = await fetchPack(snapshot);
  assert.equal(documentVerification({...current, expectedCountEvidence:current.expected, profile, offers, review}).ready, true);
  const stale = await fetchPack({...snapshot, documents: [docs[0], doc(pdf, 'pdf-2')]});
  const args = {...stale, expectedCountEvidence:stale.expected, profile, offers, review};
  const verification = documentVerification(args);
  assert.equal(verification.ready, false);
  assert.equal(verification.items[0].response, 'NEEDS REVIEW');
  assert.equal(verification.signature_applied, false);
  const bytes = new Uint8Array(await (await complianceDocx(args)).arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [80, 75, 3, 4]);
});

const columns = ['Item Number','Item Title','Item Description','Item Quantity','Unit of Measure','Consignee ID','Delivery Period (In number of days)'];
const glyph = (str, x, y) => ({str, transform:[1,0,0,1,x,y], width: str.length * 4});
const headings = ['Item','Number','Item Title','Item Description','Item','Quantity','Unit of','Measure','Consignee ID','Delivery Period (In','number of days)'];
const headerX = [8,8,60,155,255,255,305,305,360,420,420];
const cellX = [8,60,155,255,305,360,420];
const records = items.map(row => [row.item_number, row.name, row.specification, '24', 'Nos', row.consignee, '15']);
const tokensFor = rows => [...headings.map((s,i) => glyph(s,headerX[i],150)),
  ...rows.flatMap((row,j) => row.map((s,i) => glyph(s,cellX[i],120-20*j)))];

test('repeat BOQ rows retain buyer order and consignee; a swap invalidates even equal quantities', () => {
  const source = new TextEncoder().encode([columns, ...records].map(row => row.map(cell => '"'+cell.replaceAll('"','""')+'"').join(',')).join('\r\n'));
  assert.equal(officialScheduleCount(source), 2);
  const matched = compareSchedule(tokensFor(records), [columns, ...records]);
  assert.deepEqual(matched.map(row => [row.n,row.consignee,row.quantity]), [['1','A',24],['2','B',24]]);
  const switched = records.map((row,i) => row.map((cell,j) => j === 5 ? records[1-i][j] : cell));
  assert.equal(compareSchedule(tokensFor(switched), [columns, ...records]), null);
  assert.equal(compareSchedule([], [columns, ...records]), null);
});

function catalogue(category, {address='Dental Wing', images=false, unreadable=false}={}) {
  const content = [glyph(`${category} ( 24 units )`, 50, 700),
    glyph('/Technical Specifications',50,670), glyph('/Bid Requirement',300,640), glyph('(Allowed Values)',300,630),
    glyph('Mirror size',100,600), glyph('5',300,600), glyph('/Consignees/Reporting Officer and Quantity',50,550),
    glyph('/Address',160,530), glyph('/Quantity',300,530), glyph('1',50,500), glyph('24',300,500),
    glyph('/Buyer Added Bid Specific Terms and Conditions',100,400), glyph('Supply within 15 days.',100,380), glyph('/Disclaimer',100,320)];
  if (address) content.splice(10,0,glyph(address,160,500));
  return catalogueProof([{page:1,tokens:content,images,unreadable}], {category:{quote: category+' (Q3)',page:1}, total:{quote:'24'}}, []);
}

test('catalogue proof requires actual consignee details, a readable native specification, and an identified item', () => {
  assert.equal(catalogue('Dental mirror')?.quantity,24);
  assert.equal(catalogue('Dental mirror', {address:''}), null);
  assert.equal(catalogue('Dental mirror', {images:true}), null);
  assert.equal(catalogue('Dental mirror', {unreadable:true}), null);
  for (const name of ['SCH 1','Schedule Ⅳ','S C H - 2']) assert.equal(catalogue(name), null);
});
