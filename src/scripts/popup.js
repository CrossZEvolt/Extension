const $=id=>document.getElementById(id);
let tabId=null,state=null,busy=false,sequence=0;
const send=(type,payload={})=>chrome.runtime.sendMessage({channel:'crossz-worker',type,tabId,payload});
function controls() {
  const supported=state?.isYouTube===true;
  $('adBlocking').disabled=busy || !state;
  $('ambient').disabled=busy || !state;
  $('boost').disabled=!supported || (busy && !$('boost').checked);
  $('volume').disabled=!supported || busy;
  $('resetVolume').disabled=!supported;
  $('ambientSettings').disabled=!supported || busy;
}
function renderPopupState(snapshot) {
  state=snapshot;
  $('tabStatus').textContent=state.isYouTube?'Trên tab YouTube':'Mở YouTube để sử dụng các chức năng theo tab';
  $('adBlocking').checked=state.adBlockingEnabled;$('ambient').checked=state.ambientEnabled;
  $('boost').checked=['active','starting'].includes(state.audio.state);
  $('volume').value=state.audio.percent;$('volumeValue').value=`${state.audio.percent}%`;
  $('audioStatus').textContent=state.audio.state==='active'?'Đang khuếch đại trên tab này':state.audio.state==='starting'?'Đang khởi tạo…':'Âm thanh gốc';
  controls();
}
async function request(type,payload={}) {
  const current=++sequence;
  busy=true;$('error').hidden=true;$('progress').textContent='Đang cập nhật…';controls();
  try {
    const reply=await send(type,payload);
    if(current!==sequence)return;
    if(!reply?.ok)throw new Error(reply?.error?.message || 'Không kết nối được extension.');
    busy=false;renderPopupState(reply.data);
  }catch(error){if(current!==sequence)return;busy=false;if(state)renderPopupState(state);$('error').textContent=error.message;$('error').hidden=false;}
  finally{if(current===sequence){busy=false;$('progress').textContent='';controls();}}
}
async function loadPopupState(id) {
  tabId=id;const reply=await send('GET_SNAPSHOT');
  if(!reply?.ok)throw new Error(reply?.error?.message || 'Không đọc được trạng thái.');
  return reply.data;
}
$('adBlocking').addEventListener('change',()=>request('AD_SET_ENABLED',{enabled:$('adBlocking').checked}));
$('ambient').addEventListener('change',()=>request('AMBIENT_SET_ENABLED',{enabled:$('ambient').checked}));
$('boost').addEventListener('change',()=>$('boost').checked?request('AUDIO_SET_GAIN',{percent:state?.audio.percent>100?state.audio.percent:150}):request('AUDIO_STOP'));
$('volume').addEventListener('input',()=>{$('volumeValue').value=`${$('volume').value}%`;});
$('volume').addEventListener('change',()=>Number($('volume').value)===100?request('AUDIO_STOP'):request('AUDIO_SET_GAIN',{percent:Number($('volume').value)}));
$('resetVolume').addEventListener('click',()=>request('AUDIO_STOP'));
$('ambientSettings').addEventListener('click',()=>request('AMBIENT_OPEN_SETTINGS'));
$('options').addEventListener('click',()=>chrome.runtime.openOptionsPage());
controls();
(async()=>{
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});renderPopupState(await loadPopupState(tab?.id ?? null));}
  catch(error){$('error').hidden=false;$('error').textContent=error.message;}
})();
setInterval(async()=>{
  if(busy || !state)return;
  const current=sequence;
  try{const reply=await send('GET_SNAPSHOT');if(reply?.ok && current===sequence && !busy)renderPopupState(reply.data);}catch{ /* Keep last confirmed state until the next refresh. */ }
},1000);
