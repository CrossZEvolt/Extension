const $=id=>document.getElementById(id);
const idleAi=()=>({available:false,state:'inactive',fps:0});
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
  $('ai4k').disabled=!supported || state?.ai?.available!==true || (busy && !$('ai4k').checked);
}
function renderPopupState(snapshot) {
  state=snapshot;
  $('tabStatus').textContent=state.isYouTube?'Trên tab YouTube':'Mở YouTube để sử dụng các chức năng theo tab';
  $('adBlocking').checked=state.adBlockingEnabled;$('ambient').checked=state.ambientEnabled;
  const ad=state.adFilter;
  $('adStatus').textContent=ad?.state==='error'?`Bộ lọc chưa sẵn sàng: ${ad.error || 'Không khởi tạo được.'}`:!state.adBlockingEnabled?'Đã tắt bộ chặn.':ad?.state==='starting'?'Đang chuẩn bị bộ lọc…':ad?.state==='ready'?'Lọc dữ liệu quảng cáo trước khi phát.':'Chưa xác nhận bộ lọc.';
  $('boost').checked=['active','starting'].includes(state.audio.state);
  $('volume').value=state.audio.percent;$('volumeValue').value=`${state.audio.percent}%`;
  $('audioStatus').textContent=state.audio.state==='active'?'Đang khuếch đại trên tab này':state.audio.state==='starting'?'Đang khởi tạo…':'Âm thanh gốc';
  const ai=state.ai || idleAi();
  $('ai4k').checked=['active','starting'].includes(ai.state);
  $('aiStatus').textContent=ai.state==='active'?'Đang xử lý 4K bằng AI':ai.state==='starting'?'Đang khởi tạo AI…':ai.state==='error'?(ai.error || 'AI chưa sẵn sàng'):'Hình ảnh gốc';
  $('aiDetails').textContent=ai.state==='active'?`${ai.inputWidth}×${ai.inputHeight} → ${ai.outputWidth}×${ai.outputHeight} · ${Math.round(ai.fps || 0)} FPS xử lý`:ai.available?'Bật riêng cho video SDR 720p hoặc 1080p. Xử lý trong máy.':'Hãy tải lại tab YouTube để sử dụng AI.';
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
$('ai4k').addEventListener('change',()=>{
  if($('ai4k').checked)$('aiStatus').textContent='Đang nạp mô hình và khởi tạo GPU…';
  void request($('ai4k').checked?'AI_START':'AI_STOP');
});
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
