import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(){
 const documentEvents={},windowEvents={},requests=[],intervals=[];
 const state={loading:false,lastLoadedAt:new Date(Date.now()-6*60000).toISOString()};
 const document={hidden:false,addEventListener:(name,callback)=>documentEvents[name]=callback};
 const ctx=vm.createContext({Date,S:state,time:Date.parse,document,window:{addEventListener:(name,callback)=>windowEvents[name]=callback},sessionToken:async()=>{},load:options=>{requests.push(options);state.loading=true;},setInterval:(callback,ms)=>intervals.push({callback,ms})});
 vm.runInContext(source.slice(source.indexOf('const REGISTER_REFRESH_MS'),source.indexOf('// The supported Auth client')),ctx);
 return {state,document,documentEvents,windowEvents,requests,intervals};
}
test('returning to an old register fetches fresh rows once without interrupting a running request',()=>{
 const r=setup();r.windowEvents.focus();r.documentEvents.visibilitychange();
 assert.equal(r.requests.length,1);assert.equal(r.requests[0].quiet,true);
 r.state.loading=false;r.state.lastLoadedAt=new Date().toISOString();r.windowEvents.focus();assert.equal(r.requests.length,1);
});
test('background tabs do not poll and the visible refresh interval checks stale data',()=>{
 const r=setup();assert.equal(r.intervals[0].ms,60000);
 r.document.hidden=true;r.intervals[0].callback();assert.equal(r.requests.length,0);
 r.document.hidden=false;r.intervals[0].callback();assert.equal(r.requests.length,1);
});
