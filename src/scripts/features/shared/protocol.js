export const inactiveAudio=()=>({state:'inactive',percent:100});
export const isYouTube=url=>{try{return new URL(url).origin==='https://www.youtube.com';}catch{return false;}};
export function validatePercent(value) {
  if(!Number.isInteger(value) || value<100 || value>500) throw new Error('Âm lượng phải là số nguyên từ 100% đến 500%.');
  return value;
}
export function parsePopupCommand(message,sender,extensionOrigin) {
  try {
    const root=new URL(extensionOrigin),url=new URL(sender.url);
    if(sender.id!==root.host || url.protocol!==root.protocol || url.host!==root.host || url.pathname!=='/popup.html') return null;
    if(!message || message.channel!=='crossz-worker') return null;
    const {type,tabId=null,payload={}}=message;
    if(tabId!==null && (!Number.isInteger(tabId) || tabId<0))return null;
    if(['GET_SNAPSHOT','AMBIENT_OPEN_SETTINGS','AUDIO_STOP'].includes(type))return {type,tabId};
    if(['AMBIENT_SET_ENABLED','AD_SET_ENABLED'].includes(type) && typeof payload.enabled==='boolean')return {type,tabId,enabled:payload.enabled};
    if(type==='AUDIO_SET_GAIN' && tabId!==null)return {type,tabId,percent:validatePercent(payload.percent)};
  } catch {return null;}
  return null;
}
