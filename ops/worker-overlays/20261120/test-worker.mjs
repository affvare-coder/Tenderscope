import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Run against the staged private production worker and its current rules.
const [root, rulesPath] = process.argv.slice(2);
if (!root || !rulesPath) throw new Error('Usage: node test-worker.mjs <source root> <rules JSON>');
const {parseBoqCsv} = await import(pathToFileURL(resolve(root, 'worker/products.mjs')));
const {classify} = await import(pathToFileURL(resolve(root, 'worker/gem.mjs')));
const rules = JSON.parse(await readFile(rulesPath,'utf8'));
const bid = title => ({bid_number:'GEM/2026/B/1000000',title,items:[title],q2_status:'Q2'});
for (const title of ['PCA PUMP','Emergency Recovery Trolley (V2)','Automated Human Milk Analyzer','Automatic Human Milk Pasteurizer']) {
  assert.equal(classify(bid(title),rules).included,true,title);
}
for (const title of ['industrial milk pasteurizer','warehouse trolley','industrial PCA pump housing','web space and annual maintenance services']) {
  assert.equal(classify(bid(title),rules).included,false,title);
}
const csv = 'Item Number,Item Title,Item Description,Item Quantity,Unit of Measure,Consignee ID\r\n'
  + '1,Test  product," exact,  text\r\nline 2 ",5, Box ,A\r\n'
  + '1,Test  product," exact,  text\r\nline 2 ",3, Box ,B\r\n';
const {items,parser_version} = parseBoqCsv(new TextEncoder().encode(csv),'https://mkp.gem.gov.in/items.csv','test-hash');
assert.equal(parser_version,'gem-boq-csv-v4');
assert.deepEqual(items.map(i=>i.quantity),[5,3]);
assert.notEqual(items[0].item_key,items[1].item_key);
for (const row of items) {
  assert.equal(row.name,'Test  product');
  assert.equal(row.specification,' exact,  text\r\nline 2 ');
  assert.equal(row.unit,' Box ');
}
