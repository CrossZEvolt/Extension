import {createAiController} from './features/ai/controller.js';

const controller=createAiController({document});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || message?.channel!=='crossz-ai-content')return;
  if(!['AI_GET_STATE','AI_START','AI_STOP'].includes(message.type))return;
  const action=message.type==='AI_START'?()=>controller.start():message.type==='AI_STOP'?()=>controller.stop():()=>controller.snapshot();
  Promise.resolve().then(action).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:{code:error.code || 'AI_FAILED',message:error.message}}));
  return true;
});
