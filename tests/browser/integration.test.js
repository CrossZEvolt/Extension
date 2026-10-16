import {test} from 'node:test';import assert from 'node:assert/strict';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
test('Ambient and ad DOM components cooperate through toggles and SPA navigation',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);
 await a.page.addStyleTag({path:'dist/styles/ads.css'});
 await a.page.addScriptTag({path:'dist/scripts/ads-content.js'});
 await a.page.addScriptTag({path:'dist/scripts/content.js'});await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 await a.page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<ytd-ad-slot-renderer id="ad-slot">Ad</ytd-ad-slot-renderer>'));
 await a.page.waitForFunction(()=>document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false,'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
 await a.page.waitForFunction(()=>!window.ambientlight.settings.enabled && !document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>{document.querySelector('ytd-watch-flexy').setAttribute('theater','');document.dispatchEvent(new CustomEvent('yt-navigate-finish'));window.dispatchEvent(new Event('resize'));return chrome.storage.local.set({'setting-enabled':true,'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:true}});});
 await a.page.waitForFunction(()=>window.ambientlight.settings.enabled && document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 assert.equal(await a.page.locator('.ambientlight').count(),1);assert.equal(await a.page.locator('video').count(),1);
 }finally{await a.close();}
});

test('ad entry hides banners even when the Ambient stylesheet fails to load',async()=>{
 const app=await launchFixture();try{
  await loadPlayer(app.context,app.page);
  await app.context.route('https://www.youtube.com/__crossz/styles/content.css',route=>route.fulfill({status:404,body:'Unavailable Ambient stylesheet'}));
  await app.page.addStyleTag({path:'dist/styles/ads.css'});
  await app.page.addScriptTag({path:'dist/scripts/ads-content.js'});
  const failedStyle=app.page.waitForResponse(response=>response.url().endsWith('/styles/content.css') && response.status()===404);
  await app.page.addScriptTag({path:'dist/scripts/content.js'});
  await failedStyle;
  await app.page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<ytd-in-feed-ad-layout-renderer id="independent-ad">Sponsored</ytd-in-feed-ad-layout-renderer>'));
  await app.page.waitForFunction(()=>document.querySelector('#independent-ad').hasAttribute('data-crossz-ad-hidden'));
  assert.equal(await app.page.locator('#independent-ad').isVisible(),false);
  assert.equal(await app.page.locator('.ambientlight').count(),0);
  await app.page.evaluate(()=>chrome.storage.local.set({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
  await app.page.waitForFunction(()=>!document.querySelector('#independent-ad').hasAttribute('data-crossz-ad-hidden'));
  assert.equal(await app.page.locator('#independent-ad').isVisible(),true);
 }finally{await app.close();}
});
