import {test} from 'node:test';import assert from 'node:assert/strict';
import {launchFixture,loadPlayer,loadAmbient} from '../helpers/browser.js';
test('Ambient setting changes both open renderers and survives SPA navigation',async()=>{
 const app=await launchFixture();try{
 const second=await app.context.newPage();
 for(const p of [app.page,second]){await loadPlayer(app.context,p);await loadAmbient(p);await p.waitForFunction(()=>window.ambientlight?.initializedTime);}
 await app.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false}));
 for(const p of [app.page,second])await p.waitForFunction(()=>window.ambientlight?.settings.enabled===false,{},{timeout:3000});
 await app.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':true}));
 for(const p of [app.page,second])await p.waitForFunction(()=>window.ambientlight?.settings.enabled===true);
 await app.page.evaluate(()=>{for(let i=0;i<5;i++)document.dispatchEvent(new CustomEvent('yt-navigate-finish'));});
 await app.page.evaluate(()=>{
  const previous=document.querySelector('video'),next=previous.cloneNode();
  next.srcObject=previous.srcObject;previous.replaceWith(next);next.play();
 });
 await app.page.waitForFunction(()=>window.ambientlight.videoElem===document.querySelector('video'));
 assert.equal(await app.page.locator('.ambientlight').count(),1);
 }finally{await app.close();}
});

test('opening Ambient settings after SPA departure reports PLAYER_NOT_READY',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);await loadAmbient(a.page);await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 await a.page.evaluate(()=>{history.pushState({},'','/');document.dispatchEvent(new CustomEvent('yt-navigate-finish'));});
 await a.page.waitForFunction(()=>window.ambientlight.isOnVideoPage===false);
 const reply=await a.page.evaluate(()=>window.__testCommand({channel:'crossz-content',type:'AMBIENT_OPEN_SETTINGS'}));
 assert.equal(reply.ok,false);assert.equal(reply.error.code,'PLAYER_NOT_READY');
 }finally{await a.close();}
});

test('Ambient disabled before the first video survives the preloaded settings cache',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);await a.page.goto('https://www.youtube.com/');await loadAmbient(a.page);
 await a.page.waitForFunction(()=>window.__testSettingsReads>0);
 await a.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false}));
 await a.page.evaluate(()=>{history.pushState({},'','/watch?v=later');document.querySelector('ytd-app').appendChild(document.createElement('div'));});
 await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 assert.equal(await a.page.evaluate(()=>window.ambientlight.settings.enabled),false);
 }finally{await a.close();}
});

test('Ambient setting changed during player initialization is applied after initialization',async()=>{
 const a=await launchFixture();try{
 await loadPlayer(a.context,a.page);
 await a.page.evaluate(()=>{const original=requestIdleCallback;window.requestIdleCallback=callback=>{window.releaseInit=()=>{window.requestIdleCallback=original;original(callback);};return 1;};});
 await loadAmbient(a.page);
 await a.page.waitForFunction(()=>typeof window.releaseInit==='function');
 await a.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false}));
 await a.page.evaluate(()=>window.releaseInit());
 await a.page.waitForFunction(()=>window.ambientlight?.initializedTime);
 assert.equal(await a.page.evaluate(()=>window.ambientlight.settings.enabled),false);
 }finally{await a.close();}
});
