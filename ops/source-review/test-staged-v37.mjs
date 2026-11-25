// Run against an isolated copy of the v37 bundle with the staging overlay applied.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.argv[2];
if (!root) throw new Error('Usage: node ops/source-review/test-staged-v37.mjs <local v37 worker root>');
const load = name => import(pathToFileURL(resolve(root, 'worker', name)).href);
const [{RULES}, {classify}, {checkExpiry}, {parsePdfBytes}] = await Promise.all([
  load('rules.mjs'), load('gem.mjs'), load('retention.mjs'), load('documents.mjs'),
]);

const bid = {bid_number:'GEM/2026/B/1000000', title:'SCH 1', items:['SCH 1']};
assert.equal(classify(bid, RULES).status, 'pending_verification');
assert.equal(classify({...bid, items:['SCH 1', 'Dental mirror']}, RULES).category, 'Dental');

const old = {...bid, id:'fixture', deadline:'2026-11-01T12:00:00Z', check_day:2};
const source = {...bid, source_url:'https://bidplus.gem.gov.in/showbidDocument/1000000',
  closes_at:'2026-11-05T12:00:00Z', official_listing_verified:true};
for (const [row, outcome] of [[source,'extended'], [null,'missing'], [{...source, official_listing_verified:false},'failed']]) {
  const receipts = [], reentered = [];
  const db = {rpc(name, args) {
    if (name === 'expiry_checks_due') return [old];
    assert.equal(name,'record_expiry_check');
    receipts.push(args);
  }};
  const result = await checkExpiry({db, gem:{fetchBid:async () => row}, ingest: async current => reentered.push(current)});
  assert.equal(result[0].outcome, outcome);
  assert.equal(receipts[0].p_outcome, outcome);
  assert.equal(reentered.length, outcome === 'extended' ? 1 : 0);
  if (outcome === 'extended') assert.equal(reentered[0].closes_at, source.closes_at);
  else assert.equal(receipts[0].p_observed_deadline, null);
}

const token = (str,x,y) => ({str,transform:[1,0,0,1,x,y],width:str.length*3});
async function ordinaryHeader(ra) {
  const pages = [
    [token('/Bid to RA enabled',115,660), token(ra,270,660)],
    [token('/RA Qualification Rule',95,660), token('H1 - Highest Priced Bid Elimination',270,660)],
  ];
  const pdfjs = {getDocument: () => ({promise: Promise.resolve({numPages:2,
    getPage: n => ({getTextContent: async () => ({items:pages[n-1]}), getAnnotations: async () => [], cleanup() {}}),
    destroy() {},
  })})};
  return (await parsePdfBytes(new Uint8Array(), {pdfjs})).header_facts;
}
assert.equal((await ordinaryHeader('Yes')).h1.page, 2);
assert.equal((await ordinaryHeader('No')).h1, undefined);
console.log('Staged v37 verified generic discovery, late extension handling and cross-page RA evidence.');
