import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchFixture,loadPlayer,loadAmbient} from '../helpers/browser.js';
test('Ambient and ad DOM components cooperate through toggles and SPA navigation',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);
 await a.page.addStyleTag({path:'dist/styles/ads.css'});
 await a.page.addScriptTag({path:'dist/scripts/ads-content.js'});
 await loadAmbient(a.page);await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 await a.page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<ytd-ad-slot-renderer id="ad-slot">Ad</ytd-ad-slot-renderer>'));
 await a.page.waitForFunction(()=>document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false,'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
 await a.page.waitForFunction(()=>!window.ambientlight.settings.enabled && !document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>{document.querySelector('ytd-watch-flexy').setAttribute('theater','');document.dispatchEvent(new CustomEvent('yt-navigate-finish'));window.dispatchEvent(new Event('resize'));return chrome.storage.local.set({'setting-enabled':true,'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:true}});});
 await a.page.waitForFunction(()=>window.ambientlight.settings.enabled && document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 assert.equal(await a.page.locator('.ambientlight').count(),1);assert.equal(await a.page.locator('video').count(),1);
 }finally{await a.close();}
});

test('ad entry hides banners even when the Ambient stylesheet is unavailable',async()=>{
 const app=await launchFixture();try{
  await loadPlayer(app.context,app.page);
  await app.page.addStyleTag({path:'dist/styles/ads.css'});
  await app.page.addScriptTag({path:'dist/scripts/ads-content.js'});
  await app.page.locator('style[data-fixture-manifest-css]').evaluateAll(styles=>styles.forEach(style=>style.remove()));
  await loadAmbient(app.page);
  await app.page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<ytd-in-feed-ad-layout-renderer id="independent-ad">Sponsored</ytd-in-feed-ad-layout-renderer>'));
  await app.page.waitForFunction(()=>document.querySelector('#independent-ad').hasAttribute('data-crossz-ad-hidden'));
  assert.equal(await app.page.locator('#independent-ad').isVisible(),false);
  await app.page.evaluate(()=>chrome.storage.local.set({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
  await app.page.waitForFunction(()=>!document.querySelector('#independent-ad').hasAttribute('data-crossz-ad-hidden'));
  assert.equal(await app.page.locator('#independent-ad').isVisible(),true);
 }finally{await app.close();}
});

test('Ambient declares native styles for normal and embedded pages',async()=>{
 const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
 const entries=manifest.content_scripts.filter(entry=>entry.js?.includes('scripts/content.js'));
 assert.equal(entries.length,2);
 for(const entry of entries)assert.ok(entry.css?.includes('styles/content.css'));
 assert.ok(entries.some(entry=>entry.matches.includes('https://www.youtube.com/embed/*') && entry.all_frames));
});

test('Ambient initializes without a page CSS request',async()=>{
 const app=await launchFixture();try{
  let pageStyleRequests=0;
  await app.context.route('https://www.youtube.com/__crossz/styles/content.css',route=>{pageStyleRequests++;return route.abort();});
  await loadPlayer(app.context,app.page);
  await loadAmbient(app.page);
  await app.page.waitForFunction(()=>window.ambientlight?.initializedTime,{},{timeout:3000});
  assert.equal(await app.page.locator('link[href$="/styles/content.css"]').count(),0);
  assert.equal(pageStyleRequests,0);
  assert.equal(await app.page.locator('.ambientlight').count(),1);
  assert.equal(await app.page.locator('.ambientlight').evaluate(element=>getComputedStyle(element).display),'contents');
  await app.page.waitForFunction(()=>[...document.querySelectorAll('.ambientlight canvas')].some(canvas=>canvas.getContext('2d')?.getImageData(10,10,1,1).data[0]>200));
 }finally{await app.close();}
});
