// Unsaved work lives only in this page's memory and is cleared on account change.
export function createBidDrafts() {
 let owner=null;const drafts=new Map();
 return {
  setOwner(userId){if(owner!==userId){owner=userId;drafts.clear();}},
  capture(bid,values){if(owner)drafts.set(bid,{stage:values.stage,note:values.note});},
  display(row){return {...row,...drafts.get(row.bid_number)};},
  drop(bid){drafts.delete(bid);},
  has(bid){return drafts.has(bid);},
  acknowledge(bid,sent){const current=drafts.get(bid);if(current&&current.stage===sent.stage&&current.note===sent.note)drafts.delete(bid);},
  get size(){return drafts.size;}
 };
}
