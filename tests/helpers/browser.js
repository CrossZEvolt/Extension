import {chromium} from 'playwright';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

export async function launchExtension(distDir='dist') {
  const profile=await mkdtemp(join(tmpdir(),'crossz-test-'));
  const dir=resolve(distDir);
  const context=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chromium',headless:true,
    ignoreDefaultArgs:['--disable-extensions','--mute-audio'],
    args:[`--load-extension=${dir}`,`--disable-extensions-except=${dir}`,'--enable-unsafe-extension-debugging','--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    viewport:{width:1280,height:900},
  });
  try {
    if(!context.serviceWorkers().length) {
      const session=await context.browser().newBrowserCDPSession();
      try {await session.send('Extensions.loadUnpacked',{path:dir});}
      catch(error) {if(/administrator/.test(error.message)) error.code='EXTENSIONS_BLOCKED';throw error;}
    }
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
    const extensionId=new URL(worker.url()).host;
    const page=await context.newPage();
    return {context,worker,extensionId,page,close:async()=>{await context.close();await rm(profile,{recursive:true,force:true});}};
  } catch(error) {await context.close();await rm(profile,{recursive:true,force:true});throw error;}
}

export async function loadPlayer(context,page) {
  const html=await readFile(new URL('../fixtures/player.html',import.meta.url),'utf8');
  await context.route(url=>url.host==='www.youtube.com' && !url.pathname.startsWith('/__crossz/') && !url.pathname.startsWith('/__modules/'),route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://www.youtube.com/watch?v=crossz-test');
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3);
}

export async function canOpenOriginalSettings(page) {
  const button=page.locator('.ytp-ambientlight-settings-button');
  await button.waitFor({timeout:15000});
  await button.click();
  await page.locator('.ytpa-ambientlight-settings-menu.is-visible').waitFor({timeout:10000});
  return true;
}

// Production renderer with browser API adapters. Not an extension installation test.
export async function launchFixture() {
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chromium',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const values={'setting-webGL':false};
  await context.exposeBinding('__testGet',(_,key)=>key===null?{...values}:Object.fromEntries((typeof key==='string'?[key]:key).filter(k=>k in values).map(k=>[k,values[k]])));
  await context.exposeBinding('__testSet',async(_,next)=>{
    const changes=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,{oldValue:values[key],newValue:value}]));Object.assign(values,next);
    await Promise.all(context.pages().map(p=>p.evaluate(changes=>window.__testChanged?.(changes),changes).catch(()=>{})));
  });
  await context.addInitScript(()=>{
    const listeners=[],messages=[];
    window.__testChanged=changes=>listeners.forEach(f=>f(changes,'local'));
    const area={get:(keys,cb)=>window.__testGet(keys).then(v=>{cb?.(v);return v;}),set:(value,cb)=>window.__testSet(value).then(()=>cb?.()),onChanged:{addListener:f=>listeners.push(f),removeListener:f=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);}}};
    window.chrome={...window.chrome,runtime:{id:'fixture',getManifest:()=>({version:'0.1.0'}),getURL:path=>`https://www.youtube.com/__crossz/${path}`,onMessage:{addListener:f=>messages.push(f)},lastError:null},storage:{local:area,sync:area}};
    window.__testCommand=message=>new Promise(resolve=>messages.forEach(f=>f(message,{id:'fixture'},resolve)));
  });
  await context.route('https://www.youtube.com/__crossz/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace('/__crossz/','');
    const body=await readFile(resolve('dist',path)).catch(()=>null);
    if(!body){await route.fulfill({status:404,body:'Missing fixture resource'});return;}
    await route.fulfill({body,contentType:path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':'application/octet-stream'});
  });
  const page=await context.newPage();
  return {context,page,values,close:()=>browser.close()};
}
