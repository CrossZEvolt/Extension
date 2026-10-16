import {inactiveAudio,isYouTube,validatePercent} from '../shared/protocol.js';

export function createAudioCoordinator(api=chrome) {
  let lifecycle=Promise.resolve();
  const starts=new Map(),generations=new Map();
  const contexts=()=>api.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[api.runtime.getURL('offscreen.html')]});
  const serial=action=>{lifecycle=lifecycle.catch(()=>{}).then(action);return lifecycle;};
  const send=async(type,payload={})=>{
    const reply=await api.runtime.sendMessage({channel:'crossz-audio',type,...payload});
    if(!reply?.ok)throw new Error(reply?.error?.message || 'Không kết nối được bộ xử lý âm thanh.');
    return reply.data;
  };
  const status=async()=> (await contexts()).length?await send('STATUS'):{};
  const ensure=()=>serial(async()=>{if(!(await contexts()).length)await api.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Process user-activated YouTube tab audio locally.'});});
  const closeIfIdle=()=>serial(async()=>{
    if(starts.size || !(await contexts()).length)return;
    const states=await send('STATUS');
    if(!starts.size && !Object.keys(states).length)await api.offscreen.closeDocument();
  });
  async function stop(tabId) {
    generations.set(tabId,(generations.get(tabId)||0)+1);
    if((await contexts()).length)await send('STOP',{tabId});
    await closeIfIdle();return inactiveAudio();
  }
  async function setGain(tabId,percent) {
    validatePercent(percent);
    if(percent===100)return stop(tabId);
    const generation=generations.get(tabId)||0;
    if(starts.has(tabId)) {
      await starts.get(tabId);
      return generation===(generations.get(tabId)||0)?setGain(tabId,percent):inactiveAudio();
    }
    const operation=(async()=>{
      const tab=await api.tabs.get(tabId);
      if(!isYouTube(tab.url))throw new Error('Chỉ bật khuếch đại trên tab YouTube.');
      const states=await status();
      if(generation!==(generations.get(tabId)||0))return inactiveAudio();
      if(states[tabId])return send('SET',{tabId,percent});
      await ensure();
      if(generation!==(generations.get(tabId)||0))return inactiveAudio();
      const streamId=await api.tabCapture.getMediaStreamId({targetTabId:tabId});
      if(generation!==(generations.get(tabId)||0))return inactiveAudio();
      return send('START',{tabId,streamId,percent});
    })();
    starts.set(tabId,operation);
    try{return await operation;}finally{if(starts.get(tabId)===operation)starts.delete(tabId);await closeIfIdle().catch(()=>{});}
  }
  return {setGain,stop,snapshot:async tabId=>(await status())[tabId] || inactiveAudio(),closeIfIdle};
}
