import {test} from 'node:test';import assert from 'node:assert/strict';
const node=()=>({connect(other){return other;},disconnect(){}});
function context(){return {currentTime:0,destination:node(),createMediaStreamSource:node,createGain:()=>({...node(),gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}}}),createDynamicsCompressor:()=>({...node(),threshold:{},knee:{},ratio:{},attack:{},release:{}}),close:async()=>{}};}
const stream=()=>{const track={stops:0,stop(){this.stops++;},addEventListener(){}};return {track,getTracks:()=>[track]};};
test('stops a stream arriving after cancellation',async()=>{
 const {createSessionManager}=await import('../../src/scripts/features/audio/sessions.js');let resolve;
 const m=createSessionManager({getStream:()=>new Promise(r=>resolve=r),createContext:context});
 const pending=m.start(1,'stream',150);await m.stop(1);const late=stream();resolve(late);
 assert.equal((await pending).state,'inactive');assert.equal(late.track.stops,1);assert.deepEqual(m.snapshot(),{});
});
test('two tab sessions have independent gains and cleanup',async()=>{
 const {createSessionManager}=await import('../../src/scripts/features/audio/sessions.js');const streams=[];
 const m=createSessionManager({getStream:async()=>{const s=stream();streams.push(s);return s;},createContext:context});
 await m.start(1,'one',150);await m.start(2,'two',500);await m.setPercent(1,200);
 assert.equal(m.snapshot()[1].percent,200);assert.equal(m.snapshot()[2].percent,500);
 await m.stop(1);assert.equal(streams[0].track.stops,1);assert.equal(streams[1].track.stops,0);
 await m.stop(2);assert.deepEqual(m.snapshot(),{});
});
test('context failure stops every acquired track',async()=>{
 const {createSessionManager}=await import('../../src/scripts/features/audio/sessions.js');const s=stream();
 const m=createSessionManager({getStream:async()=>s,createContext:()=>{throw new Error('context failed');}});
 await assert.rejects(m.start(1,'one',150),/context failed/);assert.equal(s.track.stops,1);
});
