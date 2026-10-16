import {test} from 'node:test';import assert from 'node:assert/strict';
test('worker restart uses existing offscreen audio without recapturing',async()=>{
 const {createAudioCoordinator}=await import('../../src/scripts/features/audio/coordinator.js');let captures=0;
 const states={7:{state:'active',percent:200}};
 const api={runtime:{getURL:p=>'chrome-extension://abc/'+p,getContexts:async()=>[{}],sendMessage:async m=>{if(m.type==='SET')states[m.tabId].percent=m.percent;return {ok:true,data:m.type==='STATUS'?{...states}:states[m.tabId]};}},tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=1'})},tabCapture:{getMediaStreamId:async()=>{captures++;return 'stream';}},offscreen:{createDocument:async()=>{},closeDocument:async()=>{}}};
 const c=createAudioCoordinator(api);await c.setGain(7,500);assert.equal(captures,0);assert.equal((await c.snapshot(7)).percent,500);
});

test('cancels pending capture and duplicate starts without recapturing',async()=>{
 const {createAudioCoordinator}=await import('../../src/scripts/features/audio/coordinator.js');
 let created=false,captures=0,resolveId,signal;const entered=new Promise(r=>signal=r);
 const api={runtime:{getURL:p=>'chrome-extension://abc/'+p,getContexts:async()=>created?[{}]:[],sendMessage:async m=>({ok:true,data:m.type==='STATUS'?{}:{state:'inactive',percent:100}})},tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=1'})},tabCapture:{getMediaStreamId:()=>{captures++;signal();return new Promise(r=>resolveId=r);}},offscreen:{createDocument:async()=>{created=true;},closeDocument:async()=>{created=false;}}};
 const c=createAudioCoordinator(api);const first=c.setGain(1,150),second=c.setGain(1,500);await entered;await c.stop(1);resolveId('unused');
 assert.equal((await first).state,'inactive');assert.equal((await second).state,'inactive');assert.equal(captures,1);assert.equal(created,false);
});
