import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ctx=vm.createContext({URL,Intl,Date,Map});
vm.runInContext(app.slice(0,app.indexOf('async function load('))+
  app.slice(app.indexOf('function sourceLink('),app.indexOf('function card(t)'))+
  app.slice(app.indexOf('function docPanel('),app.indexOf('function publicChange('))+
  '\nconst AUTH={session:null};this.show=bidderChecks;this.docs=docPanel;this.state=AUTH;',ctx);
const review={source_url:'https://buyer.edu.in/bid.pdf',source_sha256:'a'.repeat(64),reviewed_at:'2026-11-20T10:00:00Z',
  facts:{emd:{value:'₹1,50,000',quote:'150000',page:2,section:'EMD'},exemption:{value:'Traders excluded',quote:'Traders <excluded>',page:11,section:'ATC 19(1)'}}};
test('reviewed and unresolved fields keep their evidence and scope on card and detail',()=>{
  assert.match(ctx.show(review,true),/₹1,50,000/);
  assert.match(ctx.show(review,true),/OEM turnover <b>Unverified/);
  const html=ctx.show(review);
  assert.match(html,/bid.pdf#page=11/);assert.match(html,/Traders &lt;excluded&gt;/);
  assert.doesNotMatch(html,/verified complete/i);
  assert.doesNotMatch(ctx.show({...review,facts:null}),/₹1,50,000/);
  assert.doesNotMatch(ctx.show({...review,source_url:'https://buyer.edu.in.invalid.example/b.pdf'}),/href=/);
});
test('guests can open official sources and member downloads remain distinct',()=>{
  const doc={kind:'bid',official_url:'https://bidplus.gem.gov.in/showbidDocument/10001'};
  assert.match(ctx.docs([doc]),/Open official bid PDF/);
  assert.doesNotMatch(ctx.docs([doc]),/data-action="download"|Log in/);
  ctx.state.session={};assert.match(ctx.docs([doc]),/Download a copy/);
  assert.doesNotMatch(ctx.docs([{...doc,availability:'removed'}]),/href=/);
});
