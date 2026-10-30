import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

// Synthetic clip: ffmpeg -f lavfi -i color=c=0xd87828:s=1280x720:r=5:d=1 -an -c:v libvpx -b:v 100k ai-720p.webm
test('a real paused 720p video reaches visible learned 4K output while GPU batches exceed the old deadline',{timeout:45000},async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chromium',headless:true,
    args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--autoplay-policy=no-user-gesture-required']});
  try {
    const context=await browser.newContext({viewport:{width:800,height:600}});
    const html=`<!doctype html><style>body{margin:0;background:magenta}.html5-video-container{position:relative;width:384px;height:216px}video{width:384px;height:216px}</style><div id="movie_player" class="html5-video-player"><div class="html5-video-container"><video class="html5-main-video" src="/__ai_runtime/tests/fixtures/ai-720p.webm" muted autoplay loop playsinline></video></div></div>`;
    await context.route('https://www.youtube.com/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/watch')return route.fulfill({contentType:'text/html',body:html+`<style>${await readFile('src/styles/ai.css','utf8')}</style>`});
      if(path.startsWith('/__ai_runtime/src/scripts/features/ai/') || path.startsWith('/__ai_runtime/src/models/') || path==='/__ai_runtime/tests/fixtures/ai-720p.webm') {
        const file=resolve(path.replace('/__ai_runtime/',''));
        return route.fulfill({body:await readFile(file),contentType:path.endsWith('.webm')?'video/webm':path.endsWith('.json')?'application/json':'text/javascript'});
      }
      return route.fulfill({status:404,body:'Unrequested runtime fixture resource'});
    });
    const page=await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=gpu-runtime');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3 && document.querySelector('video').videoWidth===1280);
    await page.evaluate(()=>document.querySelector('video').pause());
    const sourcePixel=await page.evaluate(()=>{
      const sample=document.createElement('canvas');sample.width=1280;sample.height=720;
      sample.getContext('2d').drawImage(document.querySelector('video'),0,0);
      return [...sample.getContext('2d').getImageData(640,360,1,1).data];
    });
    assert.ok(sourcePixel[0]>120 && sourcePixel[1]>40 && sourcePixel[2]<140,`Source video must be decoded and coloured: ${sourcePixel}.`);
    await page.evaluate(async()=>{
      const video=document.querySelector('video');video.pause();
      const {createAiController}=await import('/__ai_runtime/src/scripts/features/ai/controller.js');
      window.runtimeController=createAiController({document,loadModel:scale=>fetch(`/__ai_runtime/src/models/fsrcnn-small-x${scale}.json`).then(response=>response.json())});
      await window.runtimeController.start();
    });
    await page.waitForFunction(()=>['active','error'].includes(window.runtimeController.snapshot().state),null,{timeout:22000});
    const state=await page.evaluate(()=>window.runtimeController.snapshot());
    assert.equal(state.state,'active',state.error || 'The real GPU frame must complete.');
    assert.equal(state.outputWidth,3840);assert.equal(state.outputHeight,2160);
    assert.equal(await page.locator('.crossz-ai-canvas').isVisible(),true);
    const before=await page.locator('.crossz-ai-canvas').screenshot();
    // Remove the original video from the screenshot so a missing GPU presentation cannot pass.
    await page.evaluate(()=>{document.querySelector('video').style.visibility='hidden';});
    const png=await page.locator('.crossz-ai-canvas').screenshot();
    const centre=bytes=>page.evaluate(async bytes=>{
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
      const sample=document.createElement('canvas');sample.width=bitmap.width;sample.height=bitmap.height;
      sample.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      return [...sample.getContext('2d').getImageData(Math.floor(sample.width/2),Math.floor(sample.height/2),1,1).data];
    },[...bytes]);
    const pixel=await centre(png),beforePixel=await centre(before);
    t.diagnostic(`Source ${sourcePixel}; AI before hiding source ${beforePixel}; AI after hiding source ${pixel}; ${state.frameTimeMs} ms.`);
    assert.ok(pixel[0]>120 && pixel[1]>40 && pixel[2]<140,`The learned canvas must show the source colour, got ${pixel}.`);
    assert.equal(pixel[3],255);
    t.diagnostic(`Actual paused 1280×720 → 3840×2160 frame: ${state.frameTimeMs ?? 'unreported'} ms; centre RGBA ${pixel}.`);
    await page.evaluate(()=>{
      window.runtimeController.stop();
      const video=document.querySelector('video');video.pause();
      video.srcObject?.getTracks().forEach(track=>track.stop());
      video.removeAttribute('src');video.load();
    });
  } finally {await browser.close();}
});
