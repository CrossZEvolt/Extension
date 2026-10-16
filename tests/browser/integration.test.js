import {test} from 'node:test';import assert from 'node:assert/strict';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
test('Ambient and ad DOM components cooperate through toggles and SPA navigation',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);await a.page.addScriptTag({path:'dist/scripts/content.js'});await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 await a.page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<ytd-ad-slot-renderer id="ad-slot">Ad</ytd-ad-slot-renderer>'));
 await a.page.waitForFunction(()=>document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false,'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}));
 await a.page.waitForFunction(()=>!window.ambientlight.settings.enabled && !document.querySelector('#ad-slot').hasAttribute('data-crossz-ad-hidden'));
 await a.page.evaluate(()=>{document.querySelector('ytd-watch-flexy').setAttribute('theater','');document.dispatchEvent(new CustomEvent('yt-navigate-finish'));window.dispatchEvent(new Event('resize'));return chrome.storage.local.set({'setting-enabled':true});});
 await a.page.waitForFunction(()=>window.ambientlight.settings.enabled);
 assert.equal(await a.page.locator('.ambientlight').count(),1);assert.equal(await a.page.locator('video').count(),1);
 }finally{await a.close();}
});
