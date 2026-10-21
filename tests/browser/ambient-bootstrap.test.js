import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const matches=(pattern,url)=>new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')}$`).test(url);

async function launchNativeAmbientFixture() {
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chromium',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();
    const requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('https://www.youtube.com/__crossz/**',route=>{requests.push(route.request().url());return route.abort();});
    const html=await readFile('tests/fixtures/player.html','utf8');
    await context.route('https://www.youtube.com/watch?*',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.goto('https://www.youtube.com/watch?v=native-ambient');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3);
    const session=await context.newCDPSession(page);
    const {frameTree}=await session.send('Page.getFrameTree');
    const {executionContextId}=await session.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'crossz-native-ambient-fixture'});
    const evaluate=async expression=>{
      const result=await session.send('Runtime.evaluate',{contextId:executionContextId,expression,awaitPromise:true,returnByValue:true});
      assert.equal(result.exceptionDetails,undefined,result.exceptionDetails?.exception?.description);
      return result.result.value;
    };
    const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
    // Extension APIs belong only to the isolated world, as they do in a native content script.
    await evaluate(`(()=>{
      const values={'setting-webGL':false},listeners=[],messages=[];
      const area={
        get(keys,callback){const result=keys===null?{...values}:Object.fromEntries((typeof keys==='string'?[keys]:keys).filter(key=>key in values).map(key=>[key,values[key]]));callback?.(result);return Promise.resolve(result);},
        set(next,callback){const changes=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,{oldValue:values[key],newValue:value}]));Object.assign(values,next);for(const listener of listeners)listener(changes,'local');callback?.();return Promise.resolve();},
        onChanged:{addListener:listener=>listeners.push(listener),removeListener:listener=>{const index=listeners.indexOf(listener);if(index>=0)listeners.splice(index,1);}},
      };
      globalThis.chrome={runtime:{id:'fixture',getManifest:()=>({version:${JSON.stringify(manifest.version)}}),getURL:path=>'https://www.youtube.com/__crossz/'+path,onMessage:{addListener:listener=>messages.push(listener)},lastError:null},storage:{local:area,sync:area}};
    })()`);
    const url=page.url();
    const entries=manifest.content_scripts.filter(entry=>entry.matches.some(pattern=>matches(pattern,url)) && !(entry.exclude_matches || []).some(pattern=>matches(pattern,url)));
    const ambient=entries.filter(entry=>entry.js?.includes('scripts/content.js'));
    assert.equal(ambient.length,1);
    for(const entry of ambient)for(const css of entry.css || [])await page.addStyleTag({content:await readFile(`dist/${css}`,'utf8')});
    // Emulate the browser's delivery of declared MAIN scripts; there are no script URL loads.
    for(const entry of entries.filter(entry=>entry.world==='MAIN' && entry.js?.includes('scripts/injected.js'))) {
      for(const script of entry.js)await page.evaluate(await readFile(`dist/${script}`,'utf8'));
    }
    for(const entry of ambient)for(const script of entry.js)await evaluate(await readFile(`dist/${script}`,'utf8'));
    return {page,evaluate,requests,errors,close:()=>browser.close()};
  } catch(error) {await browser.close();throw error;}
}

test('Ambient native scripts render across isolated and MAIN worlds without page resource loads',async()=>{
  const app=await launchNativeAmbientFixture();
  try {
    const initialized=await app.evaluate(`new Promise(resolve=>{
      const deadline=performance.now()+4000;
      const check=()=>{if(window.ambientlight?.initializedTime)return resolve(true);if(performance.now()>=deadline)return resolve(false);requestAnimationFrame(check);};check();
    })`);
    assert.equal(initialized,true,'The isolated native renderer must initialize even when page resource loads are blocked.');
    const drawn=await app.evaluate(`new Promise(resolve=>{
      const deadline=performance.now()+4000;
      const check=()=>{if([...document.querySelectorAll('.ambientlight canvas')].some(canvas=>canvas.getContext('2d')?.getImageData(10,10,1,1).data[0]>200))return resolve(true);if(performance.now()>=deadline)return resolve(false);requestAnimationFrame(check);};check();
    })`);
    assert.equal(drawn,true);
    assert.equal(await app.page.evaluate(()=>window.ambientlight),undefined);
    assert.equal(await app.page.evaluate(()=>typeof globalThis.chrome?.runtime?.getManifest),'undefined');
    assert.equal(await app.page.locator('script[src*="/__crossz/"]').count(),0);
    assert.deepEqual(app.requests,[]);
    assert.deepEqual(app.errors,[]);

    // The page player owns these JS methods; an isolated DOM wrapper cannot call them directly.
    await app.page.evaluate(()=>{
      document.querySelector('#movie_player').getVideoData=()=>({isHdr:true});
      document.querySelector('#movie_player').getStoryboardFormat=()=>'storyboard-from-main';
    });
    assert.equal(await app.evaluate(`typeof document.querySelector('#movie_player').getVideoData`),'undefined');
    const request=type=>app.evaluate(`new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{document.removeEventListener('crossz-message',receive);reject(new Error('MAIN helper did not respond.'));},2000);
      function receive(event){const data=JSON.parse(event.detail || 'null');if(data?.injectedScript!=='crossz-youtube-extension' || data.type!==${JSON.stringify(type)})return;clearTimeout(timeout);document.removeEventListener('crossz-message',receive);resolve(data.message);}
      document.addEventListener('crossz-message',receive);
      document.dispatchEvent(new CustomEvent('crossz-message',{detail:JSON.stringify({contentScript:'crossz-youtube-extension',type:${JSON.stringify(type)}})}));
    })`);
    assert.equal(await request('is-hdr-video'),true);
    assert.equal(await request('player-storyboard-format'),'storyboard-from-main');
  } finally {await app.close();}
});
