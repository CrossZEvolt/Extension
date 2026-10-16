import {createAudioGraph} from './graph.js';
import {validatePercent,inactiveAudio} from '../shared/protocol.js';

export function createSessionManager({getStream,createContext}) {
  const entries=new Map();
  async function release(entry) {
    try{entry.graph?.dispose();}catch{ /* Already disconnected. */ }
    for(const track of entry.stream?.getTracks() || [])track.stop();
    try{await entry.context?.close();}catch{ /* Already closed. */ }
  }
  async function stop(tabId) {
    const entry=entries.get(tabId);entries.delete(tabId);
    if(entry)await release(entry);
    return inactiveAudio();
  }
  async function setPercent(tabId,percent) {
    validatePercent(percent);
    if(percent===100)return stop(tabId);
    let entry=entries.get(tabId);
    if(entry?.state==='starting')await entry.ready;
    entry=entries.get(tabId);
    if(!entry?.graph)throw new Error('Tab chưa bật khuếch đại.');
    entry.graph.setPercent(percent);entry.percent=percent;
    return {state:entry.state,percent};
  }
  function start(tabId,streamId,percent) {
    validatePercent(percent);
    if(entries.has(tabId))return setPercent(tabId,percent);
    const entry={state:'starting',percent};entries.set(tabId,entry);
    entry.ready=(async()=>{
      try{
        entry.stream=await getStream(streamId);
        if(entries.get(tabId)!==entry){await release(entry);return inactiveAudio();}
        entry.context=createContext();
        const source=entry.context.createMediaStreamSource(entry.stream);
        entry.graph=createAudioGraph({context:entry.context,source,percent});
        if(entry.context.state==='suspended')await entry.context.resume();
        if(entries.get(tabId)!==entry){await release(entry);return inactiveAudio();}
        for(const track of entry.stream.getTracks())track.addEventListener('ended',()=>{if(entries.get(tabId)===entry)void stop(tabId);},{once:true});
        entry.state='active';return {state:'active',percent};
      }catch(error){if(entries.get(tabId)===entry)entries.delete(tabId);await release(entry);throw error;}
    })();
    return entry.ready;
  }
  return {start,setPercent,stop,snapshot:()=>Object.fromEntries([...entries].map(([id,e])=>[id,{state:e.state,percent:e.percent}]))};
}
