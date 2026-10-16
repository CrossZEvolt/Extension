import {test} from 'node:test';import assert from 'node:assert/strict';
test('worker rejects page commands and exposes only preferences update to options',async()=>{
 const {installWorker}=await import('../../src/scripts/features/worker.js');let listener,captures=0,adValue=true;const values={};
 const api={runtime:{getURL:p=>'chrome-extension://abc/'+p,onMessage:{addListener:f=>listener=f}},tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=1'})},storage:{local:{get:async key=>({[key]:values[key]}),set:async v=>Object.assign(values,v)}}};
 installWorker(api,{audio:{snapshot:async()=>({state:'inactive',percent:100}),setGain:async()=>{captures++;}},setAdEnabled:async enabled=>{adValue=enabled;}});
 const send=(m,url)=>new Promise(resolve=>listener({channel:'crossz-worker',tabId:1,...m},{id:'abc',url},resolve));
 assert.equal((await send({type:'AUDIO_SET_GAIN',payload:{percent:500}},'https://www.youtube.com/')).ok,false);
 assert.equal((await send({type:'AUDIO_SET_GAIN',payload:{percent:500}},'chrome-extension://abc/options.html')).ok,false);
 assert.equal(captures,0);
 assert.equal((await send({type:'AD_SET_ENABLED',payload:{enabled:false}},'chrome-extension://abc/options.html')).ok,true);
 assert.equal(adValue,false);
});
