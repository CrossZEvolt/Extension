import {test} from 'node:test';import assert from 'node:assert/strict';
test('only the extension popup can issue validated privileged commands',async()=>{
 const {parsePopupCommand}=await import('../../src/scripts/features/shared/protocol.js');
 const msg={channel:'crossz-worker',type:'AUDIO_SET_GAIN',tabId:1,payload:{percent:500}},origin='chrome-extension://abc/';
 assert.equal(parsePopupCommand(msg,{id:'abc',url:'https://www.youtube.com/'},origin),null);
 assert.deepEqual(parsePopupCommand(msg,{id:'abc',url:origin+'popup.html'},origin),{type:'AUDIO_SET_GAIN',tabId:1,percent:500});
 for(const percent of [99,501,NaN,'500',101.5]) assert.equal(parsePopupCommand({...msg,payload:{percent}},{id:'abc',url:origin+'popup.html'},origin),null);
});
