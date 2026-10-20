import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePopupCommand,parseOptionsCommand} from '../../src/scripts/features/shared/protocol.js';
import {installWorker} from '../../src/scripts/features/worker.js';

test('AI start and stop require the extension popup and an explicit target tab',()=>{
  const origin='chrome-extension://abc/';
  for(const type of ['AI_START','AI_STOP']) {
    const message={channel:'crossz-worker',type,tabId:3};
    assert.deepEqual(parsePopupCommand(message,{id:'abc',url:origin+'popup.html'},origin),{type,tabId:3});
    assert.equal(parsePopupCommand(message,{id:'abc',url:'https://www.youtube.com/watch?v=1'},origin),null);
    assert.equal(parseOptionsCommand(message,{id:'abc',url:origin+'options.html'},origin),null);
    assert.equal(parsePopupCommand({...message,tabId:null},{id:'abc',url:origin+'popup.html'},origin),null);
  }
});

test('worker routes AI commands to the selected YouTube frame and reflects actual content state',async()=>{
  let listener,wrongSite=false;
  const requests=[];
  let ai={state:'inactive',inputWidth:null,inputHeight:null,outputWidth:null,outputHeight:null,fps:0,scale:null,error:null};
  const api={runtime:{getURL:path=>'chrome-extension://abc/'+path,onMessage:{addListener:value=>listener=value}},
    tabs:{get:async()=>({url:wrongSite?'https://example.com/':'https://www.youtube.com/watch?v=1'}),sendMessage:async(tabId,message,options)=>{
      requests.push({tabId,message,options});
      if(message.type==='AI_START')ai={state:'active',inputWidth:1920,inputHeight:1080,outputWidth:3840,outputHeight:2160,fps:27,scale:2,error:null};
      if(message.type==='AI_STOP')ai={...ai,state:'inactive',fps:0};
      return {ok:true,data:ai};
    }},storage:{local:{get:async()=>({})}}};
  installWorker(api);
  const send=type=>new Promise(resolve=>listener({channel:'crossz-worker',type,tabId:3},{id:'abc',url:'chrome-extension://abc/popup.html'},resolve));
  const active=await send('AI_START');
  assert.equal(active.ok,true);assert.equal(active.data.ai.state,'active');assert.equal(active.data.ai.outputHeight,2160);
  assert.deepEqual(requests[0],{tabId:3,message:{channel:'crossz-ai-content',type:'AI_START'},options:{frameId:0}});
  assert.equal((await send('AI_STOP')).data.ai.state,'inactive');
  wrongSite=true;requests.length=0;
  assert.equal((await send('AI_START')).ok,false);assert.equal(requests.length,0);
});
