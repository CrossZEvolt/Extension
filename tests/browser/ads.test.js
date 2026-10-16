import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
async function routeAdModules(app) {
 await app.context.route('https://www.youtube.com/__modules/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/__modules/','');
  await route.fulfill({contentType:'text/javascript',body:await readFile(resolve('src/scripts/features',path))});
 });
 await loadPlayer(app.context,app.page);
}
const settleFrames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
test('ad controller skips only visible enabled ad buttons and restores owned changes',async()=>{
 const a=await launchFixture();try{
 await a.context.route('https://www.youtube.com/__modules/**',async route=>{const p=new URL(route.request().url()).pathname.replace('/__modules/','');await route.fulfill({contentType:'text/javascript',body:await readFile(resolve('src/scripts/features',p)).catch(()=>'' )});});
 await loadPlayer(a.context,a.page);await a.page.addStyleTag({path:'src/styles/ads.css'});
 await a.page.evaluate(async()=>{
  const {createAdController}=await import('/__modules/ads/controller.js');
  const player=document.querySelector('#movie_player');
  player.insertAdjacentHTML('beforeend','<button class="ytp-ad-skip-button" id="skip">skip</button><button class="ytp-ad-skip-button-modern" id="disabled" disabled>disabled</button>');
  document.body.insertAdjacentHTML('beforeend','<ytd-ad-slot-renderer id="ad">Ad</ytd-ad-slot-renderer>');
  window.clicks=0;document.querySelector('#skip').onclick=()=>window.clicks++;
  window.ads=createAdController({document,requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame});window.ads.start();
 });
 await a.page.waitForFunction(()=>document.querySelector('#ad').hasAttribute('data-crossz-ad-hidden'));
 assert.equal(await a.page.evaluate(()=>window.clicks),0);
 await a.page.evaluate(()=>document.querySelector('#movie_player').classList.add('ad-showing'));
 await a.page.waitForFunction(()=>window.clicks===1);
 assert.equal(await a.page.locator('#ad').isVisible(),false);
 await a.page.evaluate(()=>{window.ads.stop();window.ads.start();window.ads.stop();});
 assert.equal(await a.page.locator('#ad').isVisible(),true);
 assert.equal(await a.page.evaluate(()=>window.clicks),1);
 }finally{await a.close();}
});

test('a reused skip button rearms after becoming unavailable, without repeated mutation clicks',async()=>{
 const app=await launchFixture();try{
  await routeAdModules(app);
  await app.page.evaluate(async()=>{
   const {createAdController}=await import('/__modules/ads/controller.js');
   const player=document.querySelector('#movie_player');player.classList.add('ad-showing');
   player.insertAdjacentHTML('beforeend','<button class="ytp-ad-skip-button" id="reused-skip">Skip</button>');
   window.clicks=0;document.querySelector('#reused-skip').onclick=()=>window.clicks++;
   window.ads=createAdController({document,requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame});window.ads.start();
  });
  await settleFrames(app.page);assert.equal(await app.page.evaluate(()=>window.clicks),1);
  await app.page.evaluate(()=>document.querySelector('#movie_player').classList.add('unrelated-change'));
  await settleFrames(app.page);assert.equal(await app.page.evaluate(()=>window.clicks),1);
  await app.page.evaluate(()=>{document.querySelector('#reused-skip').disabled=true;});
  await settleFrames(app.page);
  await app.page.evaluate(()=>{document.querySelector('#reused-skip').disabled=false;});
  await settleFrames(app.page);assert.equal(await app.page.evaluate(()=>window.clicks),2);
 }finally{await app.close();}
});

test('feed ad cards hide their layout while organic rich items remain visible',async()=>{
 const app=await launchFixture();try{
  await routeAdModules(app);
  await app.page.addStyleTag({path:'src/styles/ads.css'});
  await app.page.evaluate(async()=>{
   const {createAdController}=await import('/__modules/ads/controller.js');
   document.body.insertAdjacentHTML('beforeend','<ytd-rich-item-renderer id="sponsored-card"><ytd-in-feed-ad-layout-renderer>Sponsored</ytd-in-feed-ad-layout-renderer></ytd-rich-item-renderer><ytd-rich-item-renderer id="organic-card"><ytd-rich-grid-media>Organic</ytd-rich-grid-media></ytd-rich-item-renderer>');
   window.ads=createAdController({document,requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame});window.ads.start();
  });
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#sponsored-card').getAttribute('data-crossz-ad-hidden'),'');
  assert.equal(await app.page.locator('#organic-card').getAttribute('data-crossz-ad-hidden'),null);
  assert.equal(await app.page.locator('#sponsored-card').isVisible(),false);
  assert.equal(await app.page.locator('#organic-card').isVisible(),true);
  await app.page.evaluate(()=>{document.querySelector('#sponsored-card').innerHTML='<ytd-rich-grid-media>Reused organic card</ytd-rich-grid-media>';});
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#sponsored-card').getAttribute('data-crossz-ad-hidden'),null);
  assert.equal(await app.page.locator('#sponsored-card').isVisible(),true);
 }finally{await app.close();}
});

test('detached ad cards release their owned marker before organic reuse and stop',async()=>{
 const app=await launchFixture();try{
  await routeAdModules(app);
  await app.page.addStyleTag({path:'src/styles/ads.css'});
  await app.page.evaluate(async()=>{
   const {createAdController}=await import('/__modules/ads/controller.js');
   document.body.insertAdjacentHTML('beforeend','<ytd-rich-item-renderer id="recycled-card"><ytd-ad-slot-renderer>Ad</ytd-ad-slot-renderer></ytd-rich-item-renderer>');
   window.ads=createAdController({document,requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame});window.ads.start();
  });
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#recycled-card').isVisible(),false);
  await app.page.evaluate(()=>{window.detachedCard=document.querySelector('#recycled-card');window.detachedCard.remove();});
  await settleFrames(app.page);
  await app.page.evaluate(()=>{
   window.detachedCard.innerHTML='<ytd-rich-grid-media>Organic replacement</ytd-rich-grid-media>';
   document.body.appendChild(window.detachedCard);
  });
  await settleFrames(app.page);
  await app.page.evaluate(()=>window.ads.stop());
  assert.equal(await app.page.locator('#recycled-card').getAttribute('data-crossz-ad-hidden'),null);
  assert.equal(await app.page.locator('#recycled-card').isVisible(),true);
 }finally{await app.close();}
});

test('document_start observes ads even before an html element exists',async()=>{
 const app=await launchFixture();try{
  await routeAdModules(app);
  await app.page.evaluate(async()=>{
   const {createAdController}=await import('/__modules/ads/controller.js');
   document.documentElement.remove();
   window.ads=createAdController({document,requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame});window.ads.start();
   const html=document.createElement('html');document.appendChild(html);
   html.innerHTML='<head></head><body><ytd-ad-slot-renderer id="early-ad">Ad</ytd-ad-slot-renderer></body>';
  });
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#early-ad').getAttribute('data-crossz-ad-hidden'),'');
 }finally{await app.close();}
});

test('ad settings bridge keeps the latest confirmed preference when the initial read arrives late',async()=>{
 const app=await launchFixture();try{
  await routeAdModules(app);
  await app.page.evaluate(async()=>{
   const {startAdContent}=await import('/__modules/ads/content.js');
   document.body.insertAdjacentHTML('beforeend','<ytd-ad-slot-renderer id="bridge-ad">Ad</ytd-ad-slot-renderer>');
   window.states=[];document.addEventListener('crossz-ads-state',event=>window.states.push(event.detail));
   const area={...chrome.storage.local,get:()=>new Promise(resolve=>{window.finishInitialRead=resolve;})};
   window.adsContent=startAdContent({document,area});
   document.dispatchEvent(new Event('crossz-ads-ready'));
  });
  assert.deepEqual(await app.page.evaluate(()=>window.states),[]);
  await app.page.evaluate(()=>chrome.storage.local.set({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
  await app.page.evaluate(async()=>{
   window.finishInitialRead({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:true}});
   await window.adsContent.ready;
   document.dispatchEvent(new Event('crossz-ads-ready'));
  });
  await settleFrames(app.page);
  assert.deepEqual(await app.page.evaluate(()=>window.states),[false,false]);
  assert.equal(await app.page.locator('#bridge-ad').getAttribute('data-crossz-ad-hidden'),null);
  await app.page.evaluate(()=>document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:true})));
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#bridge-ad').getAttribute('data-crossz-ad-hidden'),null);
  await app.page.evaluate(()=>chrome.storage.local.set({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:true}}));
  await settleFrames(app.page);
  assert.equal(await app.page.locator('#bridge-ad').getAttribute('data-crossz-ad-hidden'),'');
 }finally{await app.close();}
});
