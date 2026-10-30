import {createWebGpuUpscaler} from './webgpu.js';

const idle=()=>({state:'inactive',inputWidth:null,inputHeight:null,outputWidth:null,outputHeight:null,fps:0,scale:null,error:null,phase:null,progress:null,frameTimeMs:null,gpuLabel:null});
const problem=(code,message)=>Object.assign(new Error(message),{code});
const WARMUP_TIMEOUT=15000,FRAME_TIMEOUT=5000,PROGRESS_TIMEOUT=3000,MAX_FRAME_AGE=120,MAX_OVERLAY_AGE=100;
const CANCELLED=Symbol('cancelled AI frame');

async function loadPackagedModel(scale) {
  const response=await fetch(chrome.runtime.getURL(`models/fsrcnn-small-x${scale}.json`));
  if(!response.ok)throw problem('AI_MODEL_UNAVAILABLE','Không tải được mô hình AI trong extension. Hãy cài lại bản đầy đủ.');
  return response.json();
}

export function createAiController({document,createEngine=createWebGpuUpscaler,loadModel=loadPackagedModel}) {
  const view=document.defaultView;
  let status=idle(),session=null,sequence=0;
  const snapshot=()=>({...status});
  const current=value=>session===value;
  const watchId=()=>{
    const url=new URL(view.location.href);
    return view.top===view && url.origin==='https://www.youtube.com' && url.pathname==='/watch'?url.searchParams.get('v'):null;
  };
  const findVideo=()=>document.querySelector('#movie_player video.html5-main-video');
  const adShowing=value=>value.player.matches('.ad-showing,.ad-interrupting');

  function cancelFrame(value) {
    if(value.frameId!==null)value.video.cancelVideoFrameCallback?.(value.frameId);
    value.frameId=null;
  }

  function hide(value) {
    clearTimer(value,'freshnessId');
    value.canvas.hidden=true;
    if(value.container.getAttribute('data-crossz-ai-active')===value.owner)value.container.removeAttribute('data-crossz-ai-active');
    if(current(value))status={...status,state:'starting',phase:value.warmup?'warmup':'processing',fps:0};
  }

  function clearTimer(value,key) {
    if(value[key]!==null)view.clearTimeout(value[key]);
    value[key]=null;
  }

  function ageMs(video,mediaTime) {
    return Math.abs(video.currentTime-mediaTime)*1000/(Math.abs(video.playbackRate) || 1);
  }

  function armFreshness(value) {
    clearTimer(value,'freshnessId');
    if(!current(value) || value.canvas.hidden || value.video.paused)return;
    const age=ageMs(value.video,value.presentedMediaTime);
    if(age>=MAX_OVERLAY_AGE){hide(value);return;}
    // A buffered video may stop advancing without becoming paused; don't discard a matching still.
    value.freshnessId=view.setTimeout(()=>armFreshness(value),Math.max(16,MAX_OVERLAY_AGE-age));
  }

  function clean(value) {
    if(!value)return;
    value.frameGeneration++;
    cancelFrame(value);
    clearTimer(value,'watchdogId');
    clearTimer(value,'progressWatchdogId');
    clearTimer(value,'freshnessId');
    value.rearmBudget=null;
    value.cancelProcessing?.();
    value.cancelProcessing=null;
    hide(value);
    value.observer?.disconnect();
    value.resizeObserver?.disconnect();
    for(const dispose of value.listeners)dispose();
    value.listeners=[];
    value.canvas.remove();
    value.engine?.destroy();
    value.engine=null;
  }

  function stop() {
    const previous=session;
    session=null;
    clean(previous);
    status=idle();
    return snapshot();
  }

  function fail(error,value=session) {
    if(value && !current(value))return;
    const previous=session;
    session=null;
    clean(previous);
    status={...status,state:'error',phase:null,progress:null,fps:0,error:error?.message || 'Không thể xử lý video bằng AI.'};
  }

  function supported(video,player) {
    if(video.mediaKeys || video.webkitMediaKeys)throw problem('AI_PROTECTED_VIDEO','Video được bảo vệ DRM nên AI không thể đọc khung hình.');
    if(document.pictureInPictureElement===video)throw problem('AI_UNSUPPORTED_PIP','AI chưa hỗ trợ cửa sổ hình trong hình. Video gốc vẫn phát.');
    if(view.ambientlight?.isHdr)throw problem('AI_UNSUPPORTED_HDR','AI hiện chỉ hỗ trợ video SDR, chưa hỗ trợ HDR.');
    if(!view.VideoFrame)throw problem('AI_UNSUPPORTED_BROWSER','Hãy cập nhật Edge để kiểm tra màu sắc và quyền đọc khung hình video.');
    let frame;
    try {
      frame=new view.VideoFrame(video);
      const transfer=frame.colorSpace?.transfer,primaries=frame.colorSpace?.primaries;
      if(['smpte2084','arib-std-b67','pq','hlg'].includes(transfer) || primaries==='bt2020')throw problem('AI_UNSUPPORTED_HDR','AI hiện chỉ hỗ trợ video SDR, chưa hỗ trợ HDR hoặc màu BT.2020.');
    }catch(error) {
      if(error.code==='AI_UNSUPPORTED_HDR')throw error;
      throw problem('AI_FRAME_UNAVAILABLE','AI không có quyền đọc khung hình video này. Video gốc vẫn phát.');
    }finally{frame?.close();}
    if(view.ambientlight?.isVrVideo || player.classList.contains('ytp-webgl-spherical'))throw problem('AI_UNSUPPORTED_VR','AI chưa hỗ trợ video VR hoặc 360°.');
    if(document.hidden)throw problem('AI_PAGE_HIDDEN','Mở lại tab video rồi bật AI.');
  }

  function unchanged(value) {
    return value.video.isConnected && value.container.isConnected && findVideo()===value.video && watchId()===value.watchId &&
      value.video.srcObject===value.sourceObject && (value.video.currentSrc || value.video.src)===value.source &&
      value.video.videoWidth===status.inputWidth && value.video.videoHeight===status.inputHeight;
  }

  function layout(value) {
    if(!current(value))return;
    const style=view.getComputedStyle(value.video);
    Object.assign(value.canvas.style,{
      left:`${value.video.offsetLeft}px`,top:`${value.video.offsetTop}px`,
      width:`${value.video.clientWidth}px`,height:`${value.video.clientHeight}px`,
      transform:style.transform,transformOrigin:style.transformOrigin,
      objectFit:style.objectFit,objectPosition:style.objectPosition,borderRadius:style.borderRadius,
    });
  }

  function schedule(value,force=false) {
    if(!current(value))return;
    if(force)value.refreshRequested=true;
    if(!value.engine || value.inFlight || value.frameId!==null || value.video.seeking || adShowing(value))return;
    const refresh=value.refreshRequested;
    value.refreshRequested=false;
    if(value.video.paused) {
      if(refresh)view.queueMicrotask(()=>{if(current(value) && !value.inFlight)void process(value);});
      return;
    }
    value.frameId=value.video.requestVideoFrameCallback(timestamp=>{
      value.frameId=null;
      if(!refresh && timestamp<value.nextAllowed){schedule(value);return;}
      void process(value);
    });
  }

  async function process(value) {
    if(!current(value) || value.inFlight || value.video.seeking || adShowing(value))return;
    if(!unchanged(value)){stop();return;}
    const frameGeneration=value.frameGeneration;
    try {
      supported(value.video,value.player);
      if(value.video.readyState<2){hide(value);schedule(value);return;}
      value.inFlight=true;
      const began=view.performance.now(),capturedTime=value.video.currentTime,wasWarmup=value.warmup,workId=++value.workSequence;
      const validWork=()=>current(value) && value.inFlight && value.workSequence===workId;
      let completedTiles=0;
      status={...status,phase:wasWarmup?'warmup':'processing',progress:null};
      armFreshness(value);
      const cancelled=new Promise(resolve=>{value.cancelProcessing=()=>resolve(CANCELLED);});
      let armProgress;
      const timedOut=new Promise((_resolve,reject)=>{
        value.rearmBudget=()=>{
          clearTimer(value,'watchdogId');
          if(!validWork())return;
          const budget=wasWarmup || value.video.paused?WARMUP_TIMEOUT:FRAME_TIMEOUT;
          value.watchdogId=view.setTimeout(()=>{
            if(validWork())reject(problem('AI_FRAME_TIMEOUT',`${wasWarmup?'Khung AI đầu tiên':'Khung AI'} chưa hoàn tất sau ${budget/1000} giây. Video gốc vẫn phát; bật AI để thử lại.`));
          },Math.max(0,budget-(view.performance.now()-began)));
        };
        armProgress=()=>{
          clearTimer(value,'progressWatchdogId');
          value.progressWatchdogId=view.setTimeout(()=>{
            if(validWork())reject(problem('AI_PROGRESS_TIMEOUT','AI không cập nhật tiến độ trong 3 giây. Đã trở về video gốc; bật AI để thử lại.'));
          },PROGRESS_TIMEOUT);
        };
        value.rearmBudget();
        if(!wasWarmup)armProgress();
      });
      const result=await Promise.race([value.engine.processFrame(value.video,{onProgress:progress=>{
        if(!validWork() || !Number.isInteger(progress?.completed) || !Number.isInteger(progress?.total) || progress.completed<=completedTiles || progress.completed>progress.total)return;
        completedTiles=progress.completed;
        armProgress();
        if(frameGeneration===value.frameGeneration)status={...status,progress:{completed:progress.completed,total:progress.total}};
      }}),cancelled,timedOut]);
      if(result===CANCELLED || !current(value))return;
      value.warmup=false;
      if(frameGeneration!==value.frameGeneration)return;
      if(!unchanged(value)){stop();return;}
      if(value.video.seeking || adShowing(value)){hide(value);return;}
      supported(value.video,value.player);
      if(value.canvas.width!==3840 || value.canvas.height!==2160)throw problem('AI_INVALID_OUTPUT','Đầu ra AI không đạt 3840×2160. Đã trở về video gốc.');
      const completed=view.performance.now(),duration=completed-began;
      status={...status,frameTimeMs:Math.round(duration*10)/10,progress:null};
      if(!wasWarmup && !value.video.paused) {
        value.slowFrames=duration>100?value.slowFrames+1:0;
        value.averageDuration=value.averageDuration?value.averageDuration*0.75+duration*0.25:duration;
      } else if(value.video.paused)value.slowFrames=0;
      value.nextAllowed=began+Math.max(1000/30,value.averageDuration*1.2);
      if(value.slowFrames>=3)throw problem('AI_TOO_SLOW',`GPU xử lý quá chậm (${Math.round(duration)} ms/khung). Đã trở về video gốc; thử nguồn 720p hoặc tắt bớt hiệu ứng.${value.softwareGpu?' Trình duyệt đang dùng GPU phần mềm.':''}`);
      const mediaTime=Number.isFinite(result?.mediaTime)?result.mediaTime:capturedTime;
      const stale=value.video.paused?Math.abs(value.video.currentTime-mediaTime)>0.001:ageMs(value.video,mediaTime)>MAX_FRAME_AGE;
      if(stale){hide(value);return;}
      layout(value);
      value.canvas.hidden=false;
      value.container.setAttribute('data-crossz-ai-active',value.owner);
      value.presentedMediaTime=mediaTime;
      const fps=value.lastCompleted?1000/Math.max(1,completed-value.lastCompleted):0;
      value.lastCompleted=completed;
      status={...status,state:'active',phase:'ready',error:null,fps:value.video.paused?0:Math.round(fps*10)/10};
      armFreshness(value);
    }catch(error){if(current(value))fail(error,value);}
    finally {
      clearTimer(value,'watchdogId');
      clearTimer(value,'progressWatchdogId');
      value.rearmBudget=null;
      value.cancelProcessing=null;
      value.inFlight=false;
      schedule(value);
    }
  }

  function listen(value,target,type,handler) {
    target.addEventListener(type,handler);
    value.listeners.push(()=>target.removeEventListener(type,handler));
  }

  function observe(value) {
    for(const name of ['loadstart','emptied','enterpictureinpicture'])listen(value,value.video,name,stop);
    listen(value,value.video,'encrypted',()=>fail(problem('AI_PROTECTED_VIDEO','Video được bảo vệ DRM nên AI không thể đọc khung hình.'),value));
    listen(value,document,'yt-navigate-start',stop);
    listen(value,view,'pagehide',stop);
    listen(value,document,'visibilitychange',()=>{if(document.hidden)stop();});
    listen(value,value.video,'resize',()=>{if(!unchanged(value))stop();else layout(value);});
    listen(value,value.video,'seeking',()=>{
      value.frameGeneration++;
      cancelFrame(value);
      hide(value);
      status={...status,state:'starting',fps:0};
    });
    listen(value,value.video,'seeked',()=>schedule(value,true));
    listen(value,value.video,'playing',()=>{value.rearmBudget?.();armFreshness(value);schedule(value,true);});
    listen(value,value.video,'pause',()=>{
      value.rearmBudget?.();
      if(value.inFlight)value.frameGeneration++;
      cancelFrame(value);hide(value);schedule(value,true);
    });
    value.observer=new view.MutationObserver(()=>{
      if(!current(value))return;
      if(!unchanged(value)){stop();return;}
      const ad=adShowing(value);
      if(ad!==value.ad) {
        value.ad=ad;
        value.frameGeneration++;
        cancelFrame(value);
        hide(value);
        status={...status,state:'starting',fps:0};
        if(!ad)schedule(value,true);
      }
      layout(value);
    });
    value.observer.observe(document.documentElement,{childList:true,subtree:true});
    value.observer.observe(value.player,{attributes:true,attributeFilter:['class']});
    if(view.ResizeObserver) {
      value.resizeObserver=new view.ResizeObserver(()=>layout(value));
      value.resizeObserver.observe(value.video);
    }
    listen(value,view,'resize',()=>layout(value));
    listen(value,document,'fullscreenchange',()=>layout(value));
  }

  async function start() {
    if(session)return snapshot();
    status=idle();
    let value;
    try {
      const id=watchId();
      if(!id)throw problem('AI_UNSUPPORTED_PAGE','Mở một video YouTube thông thường để bật AI 4K.');
      const video=findVideo(),player=video?.closest('.html5-video-player'),container=video?.closest('.html5-video-container');
      if(!video?.isConnected || !player || !container || video.readyState<2)throw problem('AI_PLAYER_NOT_READY','Video chưa sẵn sàng. Hãy phát video rồi thử lại.');
      status={...status,inputWidth:video.videoWidth,inputHeight:video.videoHeight};
      supported(video,player);
      const scale=video.videoWidth===1920 && video.videoHeight===1080?2:video.videoWidth===1280 && video.videoHeight===720?3:null;
      if(!scale)throw problem('AI_UNSUPPORTED_RESOLUTION',`AI 4K cần video gốc 1280×720 hoặc 1920×1080. Hiện tại: ${video.videoWidth}×${video.videoHeight}.`);
      if(!video.requestVideoFrameCallback)throw problem('AI_UNSUPPORTED_BROWSER','Trình duyệt chưa hỗ trợ xử lý theo khung hình video. Hãy cập nhật Edge.');
      const canvas=document.createElement('canvas');
      canvas.className='crossz-ai-canvas';canvas.width=3840;canvas.height=2160;canvas.hidden=true;
      canvas.setAttribute('aria-hidden','true');
      value={video,player,container,canvas,watchId:id,source:video.currentSrc || video.src,sourceObject:video.srcObject,
        owner:`crossz-${++sequence}`,engine:null,listeners:[],observer:null,resizeObserver:null,frameId:null,frameGeneration:0,inFlight:false,refreshRequested:false,watchdogId:null,progressWatchdogId:null,freshnessId:null,rearmBudget:null,cancelProcessing:null,warmup:true,workSequence:0,slowFrames:0,averageDuration:0,nextAllowed:0,presentedMediaTime:0,lastCompleted:0,softwareGpu:false,ad:false};
      session=value;
      status={...status,state:'starting',phase:'model',scale,outputWidth:3840,outputHeight:2160};
      container.appendChild(canvas);
      observe(value);layout(value);
      const model=await loadModel(scale);
      if(!current(value))return snapshot();
      if(model?.scale!==scale)throw problem('AI_INVALID_MODEL','Mô hình AI không khớp độ phân giải video. Hãy cài lại bản đầy đủ.');
      status={...status,phase:'gpu'};
      const engine=await createEngine({canvas,model});
      if(!current(value)){engine.destroy();return snapshot();}
      value.engine=engine;
      const info=engine.gpuInfo || {};
      value.softwareGpu=info.isFallbackAdapter===true;
      const label=String(info.description || info.vendor || '').trim();
      status={...status,phase:'warmup',gpuLabel:value.softwareGpu?`GPU phần mềm${label?' · '+label:''}`:label || null};
      const lost=engine.lost || engine.device?.lost;
      if(lost?.then)lost.then(()=>{if(current(value))fail(problem('AI_DEVICE_LOST','Mất kết nối GPU. Video đã trở về bản gốc; bật AI để thử lại.'),value);}).catch(error=>{if(current(value))fail(error,value);});
      schedule(value,true);
      return snapshot();
    }catch(error) {
      if(!value || current(value)){fail(error,value);throw error;}
      return snapshot();
    }
  }

  return {start,stop,snapshot};
}
