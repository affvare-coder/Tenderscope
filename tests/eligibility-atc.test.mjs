import test from 'node:test';
import assert from 'node:assert/strict';
import { readBidFields, readParentBidFields, readParentClauseEvidence } from '../ops/source-review/eligibility.mjs';

const token = (str, x = 60, y = 690) => ({str, transform: [1, 0, 0, 1, x, y]});
const page = (number, ...lines) => ({page: number, tokens: lines.map((line, i) => token(line, 60, 690 - i * 14))});
const atc = '/Buyer Added Bid Specific Terms and Conditions';
const disclaimer = '/Disclaimer';

// Source wording from the archived PDF evidence for GEM/2026/B/8270018.
const exclusion = 'Traders /Resellers are not eligible for EMD exemption.';
const precedence = 'The specifications mentioned in the ATC will Supersede the specifications selected in the product bid.';
const pact = 'Non-submission of Integrity Pact will lead to disqualification of bidder.';

test('buyer terms retain the source page and complete original wording', () => {
  const facts = readParentClauseEvidence([
    page(6, '/Additional Specification Parameters', 'Overall Specifications', precedence, '/Consignees/Reporting Officer and Quantity'),
    page(7), page(8), page(9), page(10, atc), page(11, exclusion, pact, disclaimer),
  ]);
  assert.deepEqual(facts.exemption, { value: exclusion, quote: exclusion, page: 11, section: 'Trader / reseller EMD exemption' });
  assert.equal(facts.precedence.quote, precedence);
  assert.equal(facts.precedence.page, 6);
  assert.equal(facts.undertaking.quote, pact);
  assert.equal(facts.undertaking.page, 11);
});

test('wrapped clauses preserve stamp-paper amount and exact wording', () => {
  const facts = readParentClauseEvidence([page(3, atc, 'Bidders must submit a signed Integrity Pact on', 'non-judicial Rs. 100 stamp paper.', disclaimer)]);
  assert.equal(facts.undertaking.quote, 'Bidders must submit a signed Integrity Pact on non-judicial Rs. 100 stamp paper.');
});

test('negated, reverse-direction, optional, qualified or reference-only terms stay unverified', () => {
  for (const wording of [
    'ATC shall not supersede the GeM specifications.',
    'The GeM specifications prevail over the ATC.',
    'Please refer to the specifications in the ATC.',
    'The ATC overrides the bid specifications only where a waiver is granted.',
    'Traders are not excluded from EMD exemption.',
    'Traders are not eligible for purchase preference. EMD exemption is available to all.',
    'Integrity Pact is not required on stamp paper.',
    'If selected, bidders may submit the Integrity Pact.',
    'Will bidders be required to submit the Integrity Pact?',
    'See attached ATC for Integrity Pact and EMD terms.',
    'The following clauses do not apply. ' + exclusion,
    'For example. ' + precedence,
    pact + ' Except for specifically exempt bidders.',
  ]) assert.deepEqual(readParentClauseEvidence([page(1, atc, wording, disclaimer)]), {}, wording);
});

test('later contrary wording prevents a flag; unrelated terms survive the conflict', () => {
  const facts = readParentClauseEvidence([
    page(3, atc, precedence, exclusion, pact),
    page(4, 'Traders are eligible for EMD exemption.', 'Integrity Pact is optional.', disclaimer),
  ]);
  assert.deepEqual(Object.keys(facts), ['precedence']);
  assert.deepEqual(readParentClauseEvidence([page(1, atc, 'The product specifications prevail over the ATC.'), page(2, precedence, disclaimer)]), {});
});

test('HTML/PDF disclaimer examples cannot create buyer-specific obligations', () => {
  assert.deepEqual(readParentClauseEvidence([page(9, atc, disclaimer, exclusion), page(10, atc, pact)]), {});
});

test('unscoped, incomplete or skipped terms pages cannot supply flags', () => {
  assert.deepEqual(readParentClauseEvidence([page(2, pact), page(3, atc, disclaimer)]), {});
  assert.deepEqual(readParentClauseEvidence([page(2, atc, exclusion)]), {});
  assert.deepEqual(readParentClauseEvidence([page(2, atc, exclusion), page(4, disclaimer)]), {});
  assert.equal(readParentClauseEvidence([page(2, 'क्रेता /Buyer Added Bid Specific Terms and Conditions', exclusion, 'अस्वीकरण /Disclaimer')]).exemption.quote, exclusion);
});

test('H1 requires a complete qualification rule in its labelled table cell', () => {
  const header = [token('/Bid to RA enabled', 130), token('Yes', 276), token('/RA Qualification Rule', 130, 650)];
  const quote = 'H1-Highest Priced Bid Elimination';
  assert.deepEqual(readBidFields([...header, token(quote, 276, 650)], 2).h1,
    {value: quote, quote, page: 2, section: 'RA Qualification Rule'});
  for (const text of [quote + ' (subject to approval)', 'No H1 elimination', 'H1', 'Not applicable']) {
    assert.equal(readBidFields([...header, token(text, 276, 650)], 2).h1, undefined, text);
  }
  assert.equal(readBidFields([token(quote)], 2).h1, undefined);
  assert.equal(readBidFields([header[0], token('No', 276), header[2], token(quote, 276, 650)], 2).h1, undefined);
  const conflicting = [...header, token(quote, 276, 650), token('/RA Qualification Rule', 130, 600), token('No elimination', 276, 600)];
  assert.equal(readBidFields(conflicting, 2).h1, undefined);
});

test('H1 supports split GeM header pages and withholds the rule when either cell conflicts', () => {
  const yes = {page:1, tokens:[token('/Bid to RA enabled',130),token('Yes',276)]};
  const priced = {page:2, tokens:[token('/RA Qualification Rule',130),token('H1-Highest Priced Bid Elimination',276)]};
  assert.equal(readParentBidFields([yes,priced]).h1.page,2);
  assert.equal(readParentBidFields([yes,priced,{page:3,tokens:[token('/RA Qualification Rule',130),token('Not applicable',276)]}]).h1,undefined);
  assert.equal(readParentBidFields([yes,priced,{page:3,tokens:[token('/Bid to RA enabled',130),token('No',276)]}]).h1,undefined);
  assert.equal(readParentBidFields([yes,priced,{page:3,tokens:[token('/Bid to RA enabled',130)]}]).h1,undefined);
  assert.equal(readParentBidFields([yes,{page:2,tokens:[token('Example /RA Qualification Rule',130),priced.tokens[1]]}]).h1,undefined);
});
