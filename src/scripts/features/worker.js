import {parsePopupCommand,isYouTube,inactiveAudio} from './shared/protocol.js';
import {readPreferences} from './shared/preferences.js';

export function installWorker(api=chrome,{audio=null,setAdEnabled=null}={}) {
  const getTab=async tabId=>{try{return tabId===null?null:await api.tabs.get(tabId);}catch{return null;}};
  const getSnapshot=async tabId=>{
    const [tab,prefs,stored]=await Promise.all([getTab(tabId),readPreferences(api.storage.local),api.storage.local.get('setting-enabled')]);
    return {tabId,isYouTube:isYouTube(tab?.url),ambientEnabled:stored['setting-enabled']??true,adBlockingEnabled:prefs.adBlockingEnabled,audio:audio?await audio.snapshot(tabId):inactiveAudio()};
  };
  async function handle(command) {
    const {type,tabId}=command;
    if(type==='GET_SNAPSHOT')return getSnapshot(tabId);
    if(type==='AMBIENT_SET_ENABLED') {
      await api.storage.local.set({'setting-enabled':command.enabled});
    } else if(type==='AD_SET_ENABLED') {
      if(!setAdEnabled)throw new Error('NOT_AVAILABLE');
      await setAdEnabled(command.enabled);
    } else {
      const tab=await getTab(tabId);
      if(!isYouTube(tab?.url))throw new Error('Hãy mở tab YouTube để sử dụng chức năng này.');
      if(type==='AMBIENT_OPEN_SETTINGS') {
        const reply=await api.tabs.sendMessage(tabId,{channel:'crossz-content',type},{frameId:0});
        if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message || 'Video chưa sẵn sàng.'),{code:reply?.error?.code || 'PLAYER_NOT_READY'});
      } else if(type==='AUDIO_SET_GAIN' && audio)await audio.setGain(tabId,command.percent);
      else if(type==='AUDIO_STOP' && audio)await audio.stop(tabId);
      else throw new Error('NOT_AVAILABLE');
    }
    return getSnapshot(tabId);
  }
  api.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.channel!=='crossz-worker')return;
    const command=parsePopupCommand(message,sender,api.runtime.getURL(''));
    if(!command){reply({ok:false,error:{code:'INVALID_COMMAND',message:'Yêu cầu không hợp lệ.'}});return;}
    handle(command).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:{code:error.code || 'COMMAND_FAILED',message:error.message}}));
    return true;
  });
  return {getSnapshot};
}
