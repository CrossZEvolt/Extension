import {test} from 'node:test';import assert from 'node:assert/strict';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
test('Ambient setting changes both open renderers and survives SPA navigation',async()=>{
 const app=await launchFixture();try{
 const second=await app.context.newPage();
 for(const p of [app.page,second]){await loadPlayer(app.context,p);await p.addScriptTag({path:'dist/scripts/content.js'});await p.waitForFunction(()=>window.ambientlight?.initializedTime);}
 await app.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':false}));
 for(const p of [app.page,second])await p.waitForFunction(()=>window.ambientlight?.settings.enabled===false,{},{timeout:3000});
 await app.page.evaluate(()=>chrome.storage.local.set({'setting-enabled':true}));
 for(const p of [app.page,second])await p.waitForFunction(()=>window.ambientlight?.settings.enabled===true);
 await app.page.evaluate(()=>{for(let i=0;i<5;i++)document.dispatchEvent(new CustomEvent('yt-navigate-finish'));});
 assert.equal(await app.page.locator('.ambientlight').count(),1);
 }finally{await app.close();}
});
