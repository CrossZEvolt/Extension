import {createSessionManager} from './features/audio/sessions.js';
import {validatePercent} from './features/shared/protocol.js';
const sessions=createSessionManager({
  getStream:streamId=>navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false}),
  createContext:()=>new AudioContext(),
});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || message?.channel!=='crossz-audio')return;
  const {type,tabId,streamId,percent}=message;
  const run=()=>{
    if(type==='STATUS')return sessions.snapshot();
    if(!Number.isInteger(tabId) || tabId<0)throw new Error('Invalid tab');
    if(type==='STOP')return sessions.stop(tabId);
    validatePercent(percent);
    if(type==='SET')return sessions.setPercent(tabId,percent);
    if(type==='START' && typeof streamId==='string' && streamId.length>0 && streamId.length<10000)return sessions.start(tabId,streamId,percent);
    throw new Error('Invalid audio command');
  };
  Promise.resolve().then(run).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:{code:'AUDIO_ERROR',message:error.message}}));
  return true;
});
