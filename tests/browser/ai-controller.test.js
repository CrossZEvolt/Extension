import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchFixture,loadPlayer} from '../helpers/browser.js';

async function openController(options={}) {
  const app=await launchFixture();
  try {
    await app.context.route('https://www.youtube.com/__modules/**',async route=>{
      const path=new URL(route.request().url()).pathname.replace('/__modules/','');
      const body=path.endsWith('/webgpu.js')?'export function createWebGpuUpscaler(){throw new Error("Use the injected lifecycle engine.");}':await readFile(resolve(path),'utf8').catch(()=>'export {};');
      await route.fulfill({body,contentType:'text/javascript'});
    });
    await loadPlayer(app.context,app.page);
    await app.page.addStyleTag({content:await readFile('src/styles/ai.css','utf8').catch(()=>'/* AI styles are not installed. */')});
    const exported=await app.page.evaluate(async()=>typeof(await import('/__modules/src/scripts/features/ai/controller.js')).createAiController);
    assert.equal(exported,'function','AI lifecycle controller must be exported');
    await app.page.evaluate(async options=>{
      const {createAiController}=await import('/__modules/src/scripts/features/ai/controller.js');
      const video=document.querySelector('video');
      const fixture={width:1920,height:1080,...options,callbacks:new Map(),nextId:0,starts:0,destroyed:0,frames:0,models:[],metadataOpened:0,metadataClosed:0};
      if(fixture.hdrTransfer)window.VideoFrame=class{
        constructor(){fixture.metadataOpened++;this.colorSpace={transfer:fixture.hdrTransfer,primaries:'bt709'};}
        close(){fixture.metadataClosed++;}
      };
      Object.defineProperties(video,{
        videoWidth:{configurable:true,get:()=>fixture.width},
        videoHeight:{configurable:true,get:()=>fixture.height},
        seeking:{configurable:true,get:()=>!!fixture.seeking},
        currentTime:{configurable:true,get:()=>fixture.mediaTime || 0},
        playbackRate:{configurable:true,get:()=>fixture.playbackRate ?? 1,set:value=>{fixture.playbackRate=value;}},
      });
      video.requestVideoFrameCallback=callback=>{const id=++fixture.nextId;fixture.callbacks.set(id,callback);return id;};
      video.cancelVideoFrameCallback=id=>fixture.callbacks.delete(id);
      fixture.fire=(timestamp)=>{
        const [id,callback]=fixture.callbacks.entries().next().value || [];
        if(!callback)throw new Error('No video frame scheduled');
        fixture.lastTimestamp=Math.max(performance.now(),(fixture.lastTimestamp || 0)+34);
        fixture.callbacks.delete(id);callback(timestamp ?? fixture.lastTimestamp,{mediaTime:video.currentTime});
      };
      fixture.controller=createAiController({document,loadModel:async scale=>{fixture.models.push(scale);if(fixture.delayModel)await new Promise(resolve=>{fixture.releaseModel=resolve;});if(fixture.modelError)throw new Error(fixture.modelError);return {scale:fixture.modelScale ?? scale};},createEngine:async({canvas})=>{
        fixture.starts++;
        if(fixture.delayEngine)await new Promise(resolve=>{fixture.releaseEngine=resolve;});
        return {
          gpuInfo:fixture.gpuInfo,
          lost:new Promise(resolve=>{fixture.loseDevice=resolve;}),
          async processFrame(source,{onProgress}={}){
            if(source!==video)throw new Error('Original video was replaced');
            const mediaTime=source.currentTime;
            fixture.progress=onProgress;
            fixture.frames++;
            if(fixture.delayFrame)await new Promise(resolve=>{fixture.releaseFrame=resolve;});
            if(fixture.frameError)throw new Error(fixture.frameError);
            if(fixture.outputWidth){canvas.width=fixture.outputWidth;canvas.height=fixture.outputHeight;}
            canvas.getContext('2d').fillRect(0,0,8,8);
            return {width:canvas.width,height:canvas.height,mediaTime};
          },
          destroy(){fixture.destroyed++;},
        };
      }});
      window.aiFixture=fixture;
    },options);
    return app;
  }catch(error){await app.close();throw error;}
}

async function start(app) {return app.page.evaluate(()=>aiFixture.controller.start());}
async function state(app) {return app.page.evaluate(()=>aiFixture.controller.snapshot());}
async function frame(app) {
  await app.page.evaluate(()=>aiFixture.fire());
  await app.page.waitForFunction(()=>aiFixture.controller.snapshot().state==='active' || aiFixture.controller.snapshot().state==='error');
}

async function pauseClock(app) {
  await app.page.clock.install({time:new Date('2026-10-30T00:00:00Z')});
  await app.page.clock.pauseAt(new Date('2026-10-30T00:00:00.100Z'));
}

test('a responsive first frame above 500ms finishes warmup without a false GPU timeout',async()=>{
  const app=await openController({delayFrame:true,gpuInfo:{vendor:'nvidia',description:'RTX fixture'}});try{
    await pauseClock(app);await start(app);
    await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(650);
    assert.equal((await state(app)).state,'starting');
    assert.equal((await state(app)).phase,'warmup');
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),0);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await app.page.evaluate(()=>aiFixture.releaseFrame());
    const active=await state(app);
    assert.equal(active.state,'active');assert.equal(active.phase,'ready');
    assert.equal(active.frameTimeMs,650);assert.equal(active.gpuLabel,'RTX fixture');
  }finally{await app.close();}
});

test('progress extends the warmup stall budget but cannot disable its finite overall deadline',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(4000);
    assert.equal((await state(app)).state,'starting');
    for(let index=1;index<=5;index++) {
      await app.page.evaluate(completed=>aiFixture.progress({completed,total:40}),index*4);
      await app.page.clock.runFor(2000);
    }
    assert.equal((await state(app)).state,'starting');
    await app.page.clock.runFor(1001);
    assert.equal((await state(app)).state,'error');
    assert.match((await state(app)).error,/15/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
  }finally{await app.close();}
});

test('a completed warmup frame older than the moving video is discarded until a fresh frame arrives',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(650);
    await app.page.evaluate(()=>{aiFixture.mediaTime=0.3;aiFixture.releaseFrame();});
    const pending=await state(app);
    assert.equal(pending.state,'starting');assert.equal(pending.phase,'processing');
    assert.equal(pending.frameTimeMs,650);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await app.page.evaluate(()=>{aiFixture.delayFrame=false;aiFixture.fire();});
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('warmup stops on missing batch progress only after its first heartbeat',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(2000);
    assert.equal((await state(app)).state,'starting');
    await app.page.evaluate(()=>aiFixture.progress({completed:4,total:15}));
    assert.deepEqual((await state(app)).progress,{completed:4,total:15});
    await app.page.clock.runFor(2999);
    assert.equal((await state(app)).state,'starting');
    await app.page.clock.runFor(2);
    assert.equal((await state(app)).state,'error');
    assert.match((await state(app)).error,/tiến độ/);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
  }finally{await app.close();}
});

test('steady processing expires stale output and reports its total budget separately from a GPU stall',async()=>{
  const app=await openController();try{
    await pauseClock(app);await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();aiFixture.mediaTime=0.2;});
    await app.page.clock.runFor(101);
    assert.equal((await state(app)).state,'starting');
    assert.equal(await app.page.locator('.crossz-ai-canvas').evaluate(canvas=>canvas.hidden),true);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    for(let index=1;index<=2;index++) {
      await app.page.evaluate(completed=>aiFixture.progress({completed,total:40}),index*4);
      await app.page.clock.runFor(2000);
    }
    await app.page.evaluate(()=>aiFixture.progress({completed:12,total:40}));
    await app.page.clock.runFor(900);
    assert.equal((await state(app)).state,'error');
    assert.match((await state(app)).error,/5/);
    assert.doesNotMatch((await state(app)).error,/không phản hồi/);
    assert.equal(await app.page.locator('.crossz-ai-canvas').count(),0);
  }finally{await app.close();}
});

test('a paused still accepts slow valid 4K without starting a continuous processing loop',async()=>{
  const app=await openController({delayFrame:true,gpuInfo:{vendor:'google',isFallbackAdapter:true}});try{
    await app.page.evaluate(async()=>{const video=document.querySelector('video');const paused=new Promise(resolve=>video.addEventListener('pause',resolve,{once:true}));video.pause();await paused;});
    await pauseClock(app);await start(app);
    await app.page.clock.runFor(650);
    assert.equal((await state(app)).state,'starting');
    await app.page.evaluate(()=>aiFixture.releaseFrame());
    assert.equal((await state(app)).state,'active');
    assert.equal((await state(app)).frameTimeMs,650);
    assert.equal((await state(app)).gpuLabel,'GPU phần mềm · google');
    await app.page.clock.fastForward(5000);
    assert.equal((await state(app)).state,'active');
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),1);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});

test('frame scheduling caps fast inference without queuing overlapping work',async()=>{
  const app=await openController();try{
    await pauseClock(app);await start(app);await frame(app);
    await app.page.evaluate(()=>aiFixture.fire(performance.now()));
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),1);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),1);
    await app.page.clock.runFor(34);
    await app.page.evaluate(()=>aiFixture.fire(performance.now()));
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),2);
  }finally{await app.close();}
});

test('displayed output expires while a moving video waits for its next inference callback',async()=>{
  const app=await openController();try{
    await pauseClock(app);await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.mediaTime=0.2;});
    await app.page.clock.runFor(101);
    assert.equal((await state(app)).state,'starting');
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),1);
    await frame(app);
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('pausing an in-flight moving frame hides it until the exact paused position is refreshed',async()=>{
  const app=await openController();try{
    await pauseClock(app);await start(app);await frame(app);
    await app.page.evaluate(()=>{
      aiFixture.delayFrame=true;aiFixture.fire();aiFixture.mediaTime=0.2;
      window.oldAiRelease=aiFixture.releaseFrame;aiFixture.releaseFrame=null;
    });
    await app.page.evaluate(async()=>{
      const video=document.querySelector('video');
      const paused=new Promise(resolve=>video.addEventListener('pause',resolve,{once:true}));
      video.pause();await paused;window.oldAiRelease();
    });
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),3);
    assert.equal((await state(app)).state,'starting');
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await app.page.evaluate(()=>aiFixture.releaseFrame());
    assert.equal((await state(app)).state,'active');
    await app.page.clock.fastForward(5000);
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),3);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});

test('freshness follows wall time at half and double playback speed',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);
    await app.page.evaluate(()=>{document.querySelector('video').playbackRate=0.5;});
    await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(160);
    await app.page.evaluate(()=>{aiFixture.mediaTime=0.08;aiFixture.releaseFrame();});
    assert.equal((await state(app)).state,'starting');
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await app.page.evaluate(()=>{aiFixture.controller.stop();aiFixture.mediaTime=0;document.querySelector('video').playbackRate=2;});
    await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.runFor(70);
    await app.page.evaluate(()=>{aiFixture.mediaTime=0.14;aiFixture.releaseFrame();});
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('later paused seeks retain a 15-second still budget after the first warmup',async()=>{
  const app=await openController();try{
    await app.page.evaluate(async()=>{const video=document.querySelector('video');const paused=new Promise(resolve=>video.addEventListener('pause',resolve,{once:true}));video.pause();await paused;});
    await pauseClock(app);await start(app);
    assert.equal((await state(app)).state,'active');
    await app.page.evaluate(()=>{
      aiFixture.delayFrame=true;aiFixture.mediaTime=0.5;aiFixture.seeking=true;document.querySelector('video').dispatchEvent(new Event('seeking'));
      aiFixture.seeking=false;document.querySelector('video').dispatchEvent(new Event('seeked'));
    });
    for(let index=1;index<=2;index++) {
      await app.page.clock.runFor(2000);
      await app.page.evaluate(completed=>aiFixture.progress({completed,total:40}),index*4);
    }
    await app.page.clock.runFor(1500);
    assert.equal((await state(app)).state,'starting');
    await app.page.evaluate(()=>aiFixture.releaseFrame());
    assert.equal((await state(app)).state,'active');
    assert.equal((await state(app)).frameTimeMs,5500);
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),2);
  }finally{await app.close();}
});

test('AI reports actual source/output dimensions only after a valid frame and preserves the video',async()=>{
  const app=await openController();try{
    const original=await app.page.evaluate(()=>{const v=document.querySelector('video');window.originalVideo=v;window.originalStream=v.srcObject;return {src:v.src,volume:v.volume,muted:v.muted,tracks:v.srcObject.getTracks().length};});
    assert.equal((await state(app)).state,'inactive');
    const pending=await start(app);
    assert.equal(pending.state,'starting');assert.equal(pending.inputWidth,1920);assert.equal(pending.outputWidth,3840);assert.equal(pending.scale,2);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await frame(app);
    const active=await state(app);
    assert.equal(active.state,'active');assert.equal(active.inputHeight,1080);assert.equal(active.outputHeight,2160);
    assert.deepEqual(await app.page.locator('.crossz-ai-canvas').evaluate(c=>({width:c.width,height:c.height,hidden:c.hidden})),{width:3840,height:2160,hidden:false});
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),1);
    assert.deepEqual(await app.page.evaluate(()=>{const v=document.querySelector('video');return {same:v===window.originalVideo,stream:v.srcObject===window.originalStream,src:v.src,volume:v.volume,muted:v.muted,tracks:v.srcObject.getTracks().length};}),{same:true,stream:true,...original});
    await app.page.evaluate(()=>aiFixture.controller.stop());
    assert.equal((await state(app)).state,'inactive');assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
  }finally{await app.close();}
});

test('AI selects the separately trained x3 model for a 720p source',async()=>{
  const app=await openController({width:1280,height:720});try{
    await start(app);await frame(app);
    const result=await state(app);assert.equal(result.scale,3);assert.equal(result.outputWidth,3840);assert.equal(result.outputHeight,2160);
    assert.deepEqual(await app.page.evaluate(()=>aiFixture.models),[3]);
  }finally{await app.close();}
});

test('stopping while the GPU engine starts destroys the late engine without showing output',async()=>{
  const app=await openController({delayEngine:true});try{
    await app.page.evaluate(()=>{window.startPending=aiFixture.controller.start();});
    await app.page.waitForFunction(()=>aiFixture.releaseEngine);
    await app.page.evaluate(()=>{aiFixture.controller.stop();aiFixture.releaseEngine();});
    await app.page.evaluate(()=>window.startPending);
    assert.equal((await state(app)).state,'inactive');
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});

test('a frame finishing after stop cannot reactivate the canvas',async()=>{
  const app=await openController({delayFrame:true});try{
    await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.waitForFunction(()=>aiFixture.releaseFrame);
    await app.page.evaluate(()=>{aiFixture.controller.stop();aiFixture.releaseFrame();});
    await app.page.waitForTimeout(20);
    assert.equal((await state(app)).state,'inactive');
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});

test('seeking hides stale output until a fresh frame completes and keeps one frame in flight',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();});
    await app.page.waitForFunction(()=>aiFixture.releaseFrame);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
    await app.page.evaluate(()=>{aiFixture.seeking=true;document.querySelector('video').dispatchEvent(new Event('seeking'));aiFixture.releaseFrame();});
    await app.page.waitForTimeout(20);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.locator('.crossz-ai-canvas').evaluate(c=>c.hidden),true);
    await app.page.evaluate(()=>{aiFixture.seeking=false;aiFixture.delayFrame=false;document.querySelector('video').dispatchEvent(new Event('seeked'));});
    await frame(app);
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('unsupported source sizes and pages return informative errors without creating an engine',async()=>{
  const app=await openController({width:854,height:480});try{
    const rejected=await app.page.evaluate(()=>aiFixture.controller.start().then(()=>null,error=>({code:error.code,message:error.message})));
    assert.ok(rejected?.message);assert.equal((await state(app)).state,'error');
    assert.equal(await app.page.evaluate(()=>aiFixture.starts),0);
    await app.page.evaluate(()=>{history.pushState({},'','/shorts/test');aiFixture.width=1920;aiFixture.height=1080;});
    const pageError=await app.page.evaluate(()=>aiFixture.controller.start().then(()=>null,error=>error.code));
    assert.equal(pageError,'AI_UNSUPPORTED_PAGE');assert.equal(await app.page.evaluate(()=>aiFixture.starts),0);
  }finally{await app.close();}
});

test('source changes, video replacement and navigation stop AI without automatic restart',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('loadstart')));
    assert.equal((await state(app)).state,'inactive');
    await start(app);await frame(app);
    await app.page.evaluate(()=>{const v=document.querySelector('video');v.replaceWith(v.cloneNode());});
    await app.page.waitForFunction(()=>aiFixture.controller.snapshot().state==='inactive');
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),2);
  }finally{await app.close();}
});

test('an inference failure restores the original and exposes a retryable error',async()=>{
  const app=await openController({frameError:'GPU device lost'});try{
    await start(app);await frame(app);
    assert.equal((await state(app)).state,'error');assert.match((await state(app)).error,/GPU device lost/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    await app.page.evaluate(()=>{aiFixture.frameError=null;});await start(app);await frame(app);
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('AI canvas leaves controls interactive and suppresses only the Ambient video overlay while active',async()=>{
  const app=await openController();try{
    await app.page.evaluate(()=>{
      const overlay=document.createElement('canvas');overlay.className='ambientlight__video-overlay';document.querySelector('.html5-video-container').appendChild(overlay);
    });
    await start(app);await frame(app);
    const result=await app.page.evaluate(()=>({
      pointer:getComputedStyle(document.querySelector('.crossz-ai-canvas')).pointerEvents,
      ambient:getComputedStyle(document.querySelector('.ambientlight__video-overlay')).visibility,
      original:getComputedStyle(document.querySelector('video')).visibility,
    }));
    assert.equal(result.pointer,'none');assert.equal(result.ambient,'hidden');assert.equal(result.original,'visible');
    await app.page.evaluate(()=>aiFixture.controller.stop());
    assert.equal(await app.page.locator('.ambientlight__video-overlay').evaluate(c=>getComputedStyle(c).visibility),'visible');
  }finally{await app.close();}
});

test('entry accepts only extension messages on its private channel and starts disabled',async()=>{
  const app=await openController();try{
    const installed=await app.page.evaluate(async()=>{
      chrome.runtime.onMessage.addListener=listener=>{window.aiEntryListener=listener;};
      await import('/__modules/src/scripts/ai-content.js');
      return typeof window.aiEntryListener;
    });
    assert.equal(installed,'function');
    const results=await app.page.evaluate(async()=>{
      const invoke=(message,sender={id:'fixture'})=>new Promise(resolve=>{if(window.aiEntryListener(message,sender,resolve)!==true)resolve(null);});
      return {
        state:await invoke({channel:'crossz-ai-content',type:'AI_GET_STATE'}),
        page:await invoke({channel:'crossz-ai-content',type:'AI_START'},{id:'webpage'}),
        wrong:await invoke({channel:'crossz-content',type:'AI_START'}),
        unknown:await invoke({channel:'crossz-ai-content',type:'UNEXPECTED'}),
        stopped:await invoke({channel:'crossz-ai-content',type:'AI_STOP'}),
      };
    });
    assert.equal(results.state.ok,true);assert.equal(results.state.data.state,'inactive');
    assert.equal(results.page,null);assert.equal(results.wrong,null);assert.equal(results.unknown,null);
    assert.equal(results.stopped.data.state,'inactive');assert.equal(await app.page.locator('.crossz-ai-canvas').count(),0);
  }finally{await app.close();}
});

test('late model errors after stop do not overwrite the inactive state',async()=>{
  const app=await openController({delayModel:true,modelError:'Late download failure'});try{
    await app.page.evaluate(()=>{window.startPending=aiFixture.controller.start();});
    await app.page.waitForFunction(()=>aiFixture.releaseModel);
    await app.page.evaluate(()=>{aiFixture.controller.stop();aiFixture.releaseModel();});
    await app.page.evaluate(()=>window.startPending);
    assert.equal((await state(app)).state,'inactive');assert.equal((await state(app)).error,null);
    assert.equal(await app.page.evaluate(()=>aiFixture.starts),0);
  }finally{await app.close();}
});

test('adaptive resolution changes return to the original until the user starts the matching model',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.width=1280;aiFixture.height=720;document.querySelector('video').dispatchEvent(new Event('resize'));});
    assert.equal((await state(app)).state,'inactive');assert.equal(await app.page.locator('.crossz-ai-canvas').count(),0);
    await start(app);await frame(app);
    assert.equal((await state(app)).inputHeight,720);assert.equal((await state(app)).scale,3);
  }finally{await app.close();}
});

test('advertisements suspend the overlay and discard an inference that crosses the boundary',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();document.querySelector('#movie_player').classList.add('ad-showing');});
    await app.page.waitForFunction(()=>document.querySelector('.crossz-ai-canvas').hidden);
    await app.page.evaluate(()=>aiFixture.releaseFrame());await app.page.waitForTimeout(20);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
    await app.page.evaluate(()=>{aiFixture.delayFrame=false;document.querySelector('#movie_player').classList.remove('ad-showing');});
    await app.page.waitForFunction(()=>aiFixture.callbacks.size===1);await frame(app);
    assert.equal((await state(app)).state,'active');
  }finally{await app.close();}
});

test('DRM, HDR, VR and existing picture-in-picture reject startup before GPU work',async()=>{
  const app=await openController();try{
    const codes=await app.page.evaluate(async()=>{
      const attempt=()=>aiFixture.controller.start().then(()=>null,error=>error.code),video=document.querySelector('video'),codes=[];
      Object.defineProperty(video,'mediaKeys',{configurable:true,value:{}});codes.push(await attempt());
      Object.defineProperty(video,'mediaKeys',{configurable:true,value:null});window.ambientlight={isHdr:true};codes.push(await attempt());
      window.ambientlight={isVrVideo:true};codes.push(await attempt());window.ambientlight=null;
      Object.defineProperty(document,'pictureInPictureElement',{configurable:true,value:video});codes.push(await attempt());
      return codes;
    });
    assert.deepEqual(codes,['AI_PROTECTED_VIDEO','AI_UNSUPPORTED_HDR','AI_UNSUPPORTED_VR','AI_UNSUPPORTED_PIP']);
    assert.equal(await app.page.evaluate(()=>aiFixture.starts),0);
  }finally{await app.close();}
});

test('navigation, hidden pages, picture-in-picture and encryption clean up an active session',async()=>{
  const app=await openController();try{
    for(const event of ['yt-navigate-start','pagehide','visibilitychange','enterpictureinpicture','encrypted']) {
      await start(app);await frame(app);
      await app.page.evaluate(type=>{
        if(type==='visibilitychange')Object.defineProperty(document,'hidden',{configurable:true,value:true});
        const target=type==='pagehide'?window:['enterpictureinpicture','encrypted'].includes(type)?document.querySelector('video'):document;
        target.dispatchEvent(new Event(type));
      },event);
      const result=await state(app);assert.equal(result.state,event==='encrypted'?'error':'inactive',event);
      assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0,event);
      if(event==='visibilitychange')await app.page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));
    }
  }finally{await app.close();}
});

test('device loss between frames immediately restores the original',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>aiFixture.loseDevice());
    await app.page.waitForFunction(()=>aiFixture.controller.snapshot().state==='error');
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
  }finally{await app.close();}
});

test('three slow steady playing frames stop AI without counting the warmup frame',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);
    for(let i=0;i<4;i++) {
      if(i)await app.page.clock.runFor(34);
      await app.page.evaluate(()=>{aiFixture.releaseFrame=null;aiFixture.fire();});
      await app.page.clock.runFor(115);
      await app.page.evaluate(()=>aiFixture.releaseFrame());
      if(i<3)assert.notEqual((await state(app)).state,'error');
    }
    assert.equal((await state(app)).state,'error');assert.match((await state(app)).error,/chậm/);
    assert.match((await state(app)).error,/115 ms/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
  }finally{await app.close();}
});

test('a paused seek retains its requested refresh until an older inference finishes',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();});
    await app.page.waitForFunction(()=>aiFixture.releaseFrame);
    await app.page.evaluate(async()=>{
      const video=document.querySelector('video');
      const paused=new Promise(resolve=>video.addEventListener('pause',resolve,{once:true}));
      video.pause();await paused;
      aiFixture.seeking=true;video.dispatchEvent(new Event('seeking'));
      aiFixture.seeking=false;aiFixture.delayFrame=false;video.dispatchEvent(new Event('seeked'));aiFixture.releaseFrame();
    });
    await app.page.waitForFunction(()=>aiFixture.controller.snapshot().state==='active' && aiFixture.frames===3,{},{timeout:1500});
    assert.equal(await app.page.locator('.crossz-ai-canvas').evaluate(c=>c.hidden),false);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});

test('a model with the wrong trained scale fails before engine creation',async()=>{
  const app=await openController({modelScale:3});try{
    const code=await app.page.evaluate(()=>aiFixture.controller.start().then(()=>null,error=>error.code));
    assert.equal(code,'AI_INVALID_MODEL');assert.equal((await state(app)).state,'error');
    assert.equal(await app.page.evaluate(()=>aiFixture.starts),0);
    assert.equal(await app.page.locator('.crossz-ai-canvas').count(),0);
  }finally{await app.close();}
});

test('a non-4K rendered canvas cannot be reported as active 4K',async()=>{
  const app=await openController({outputWidth:1920,outputHeight:1080});try{
    await start(app);await frame(app);
    assert.equal((await state(app)).state,'error');assert.match((await state(app)).error,/3840.*2160/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
  }finally{await app.close();}
});

test('HDR frame metadata rejects AI even when Ambient reports SDR and closes its frame',async()=>{
  const app=await openController({hdrTransfer:'smpte2084'});try{
    await app.page.evaluate(()=>{window.ambientlight={isHdr:false};});
    const code=await app.page.evaluate(()=>aiFixture.controller.start().then(()=>null,error=>error.code));
    assert.equal(code,'AI_UNSUPPORTED_HDR');assert.equal((await state(app)).state,'error');
    assert.deepEqual(await app.page.evaluate(()=>({opened:aiFixture.metadataOpened,closed:aiFixture.metadataClosed,starts:aiFixture.starts})),{opened:1,closed:1,starts:0});
    assert.equal(await app.page.locator('.crossz-ai-canvas').count(),0);
  }finally{await app.close();}
});

test('a hanging first inference times out and restores the original video',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.clock.fastForward(15001);
    assert.equal((await state(app)).state,'error');
    assert.match((await state(app)).error,/15 giây/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
  }finally{await app.close();}
});

test('a hanging inference cannot freeze an active AI canvas over the original',async()=>{
  const app=await openController();try{
    await pauseClock(app);await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();aiFixture.mediaTime=0.2;});
    await app.page.clock.runFor(101);
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),0);
    await app.page.clock.runFor(2900);
    assert.equal((await state(app)).state,'error');
    assert.match((await state(app)).error,/tiến độ/);
    assert.equal(await app.page.locator('.crossz-ai-canvas,[data-crossz-ai-active]').count(),0);
    assert.equal(await app.page.evaluate(()=>aiFixture.destroyed),1);
  }finally{await app.close();}
});

test('a cancelled frame watchdog cannot stop a newer user-started session',async()=>{
  const app=await openController({delayFrame:true});try{
    await pauseClock(app);await start(app);await app.page.evaluate(()=>aiFixture.fire());
    await app.page.waitForFunction(()=>aiFixture.releaseFrame);
    await app.page.evaluate(()=>{aiFixture.controller.stop();aiFixture.delayFrame=false;});
    await start(app);await frame(app);
    await app.page.clock.fastForward(15100);
    assert.equal((await state(app)).state,'active');
    assert.equal(await app.page.locator('[data-crossz-ai-active]').count(),1);
  }finally{await app.close();}
});

test('pausing during inference refreshes the final paused frame once without a render loop',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    await app.page.evaluate(()=>{aiFixture.delayFrame=true;aiFixture.fire();});
    await app.page.waitForFunction(()=>aiFixture.releaseFrame);
    await app.page.evaluate(async()=>{
      const video=document.querySelector('video');
      const paused=new Promise(resolve=>video.addEventListener('pause',resolve,{once:true}));
      video.pause();await paused;
      aiFixture.delayFrame=false;aiFixture.releaseFrame();
    });
    await app.page.waitForFunction(()=>aiFixture.controller.snapshot().state==='active' && aiFixture.frames===3,{},{timeout:1500});
    await app.page.waitForTimeout(75);
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),3);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
    assert.equal(await app.page.locator('.crossz-ai-canvas').evaluate(c=>c.hidden),false);
  }finally{await app.close();}
});

test('pausing with a pending video callback renders once without waiting for another playing frame',async()=>{
  const app=await openController();try{
    await start(app);await frame(app);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),1);
    await app.page.evaluate(()=>document.querySelector('video').pause());
    await app.page.waitForFunction(()=>aiFixture.frames===2,{},{timeout:1500});
    await app.page.waitForTimeout(75);
    assert.equal(await app.page.evaluate(()=>aiFixture.frames),2);
    assert.equal(await app.page.evaluate(()=>aiFixture.callbacks.size),0);
  }finally{await app.close();}
});
