import test from 'node:test';
import assert from 'node:assert/strict';
import {createBidDrafts} from '../commercial-drafts.mjs';
const bid={bid_number:'GEM/2026/B/8181571',stage:'watching',note:'Server note',title:'Medicine'};
test('refreshing the register preserves unsaved stage and notes while accepting fresh bid facts',()=>{
 const drafts=createBidDrafts();drafts.setOwner('member-a');drafts.capture(bid.bid_number,{stage:'preparing',note:'Ask OEM for authorisation'});
 const refreshed=drafts.display({...bid,title:'Latest official title'});
 assert.equal(refreshed.note,'Ask OEM for authorisation');assert.equal(refreshed.stage,'preparing');assert.equal(refreshed.title,'Latest official title');
});
test('an earlier save response does not discard edits typed while it was pending',()=>{
 const drafts=createBidDrafts();drafts.setOwner('member-a');const sent={stage:'preparing',note:'Version one'};
 drafts.capture(bid.bid_number,sent);drafts.capture(bid.bid_number,{...sent,note:'Newer unsaved edit'});drafts.acknowledge(bid.bid_number,sent);
 assert.equal(drafts.display(bid).note,'Newer unsaved edit');assert.equal(drafts.size,1);
 drafts.acknowledge(bid.bid_number,{stage:'preparing',note:'Newer unsaved edit'});assert.equal(drafts.size,0);
});
test('another account and logout cannot see the previous account drafts',()=>{
 const drafts=createBidDrafts();drafts.setOwner('member-a');drafts.capture(bid.bid_number,{stage:'submitted',note:'Private A note'});
 drafts.setOwner('member-a');assert.equal(drafts.size,1);
 drafts.setOwner('member-b');assert.equal(drafts.size,0);assert.equal(drafts.display(bid).note,'Server note');
 drafts.capture(bid.bid_number,{stage:'submitted',note:'Private B note'});drafts.setOwner(null);assert.equal(drafts.size,0);
 drafts.capture(bid.bid_number,{stage:'watching',note:'No guest draft'});assert.equal(drafts.size,0);
});
test('removing one saved bid clears only its own draft',()=>{
 const drafts=createBidDrafts();drafts.setOwner('member-a');drafts.capture(bid.bid_number,{stage:'preparing',note:'First'});drafts.capture('GEM/2026/B/8181302',{stage:'watching',note:'Second'});drafts.drop(bid.bid_number);assert.equal(drafts.size,1);assert.equal(drafts.display(bid).note,'Server note');
});
