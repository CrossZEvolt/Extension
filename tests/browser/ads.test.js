import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
test('ad controller skips only visible enabled ad buttons and restores owned changes',async()=>{
 const a=await launchFixture();try{
 await a.context.route('https://www.youtube.com/__modules/**',async route=>{const p=new URL(route.request().url()).pathname.replace('/__modules/','');await route.fulfill({contentType:'text/javascript',body:await readFile(resolve('src/scripts/features',p)).catch(()=>'' )});});
 await loadPlayer(a.context,a.page);await a.page.addStyleTag({path:'dist/styles/content.css'});
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
