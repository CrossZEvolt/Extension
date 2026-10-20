import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchFixture} from '../helpers/browser.js';

test('AI popup waits for confirmed output, stops, and exposes GPU failures',async()=>{
  const app=await launchFixture();
  try {
    await app.context.addInitScript(()=>{
      window.snapshot={tabId:7,isYouTube:true,ambientEnabled:true,adBlockingEnabled:true,audio:{state:'inactive',percent:100},ai:{available:true,state:'inactive',fps:0}};
      chrome.tabs={query:async()=>[{id:7}]};chrome.runtime.openOptionsPage=()=>{};
      chrome.runtime.sendMessage=async message=>{
        if(message.type==='AI_START') {
          if(window.rejectAI)return {ok:false,error:{message:'GPU không khả dụng'}};
          await new Promise(resolve=>{window.confirmAI=resolve;});
          window.snapshot.ai={available:true,state:'active',inputWidth:1920,inputHeight:1080,outputWidth:3840,outputHeight:2160,scale:2,fps:26};
        }
        if(message.type==='AI_STOP')window.snapshot.ai={available:true,state:'inactive',fps:0};
        return {ok:true,data:window.snapshot};
      };
    });
    await app.page.goto('https://www.youtube.com/__crossz/popup.html');
    assert.equal(await app.page.locator('#ai4k').count(),1);
    await app.page.locator('#ai4k').check();
    await app.page.waitForFunction(()=>typeof window.confirmAI==='function');
    assert.doesNotMatch(await app.page.locator('#aiStatus').textContent(),/Đang xử lý 4K/);
    await app.page.evaluate(()=>window.confirmAI());
    await app.page.waitForFunction(()=>document.querySelector('#aiStatus').textContent.includes('Đang xử lý 4K'));
    assert.match(await app.page.locator('#aiDetails').textContent(),/1920.*1080.*3840.*2160/);
    await app.page.locator('#ai4k').uncheck();
    await app.page.waitForFunction(()=>document.querySelector('#aiStatus').textContent==='Hình ảnh gốc');
    await app.page.evaluate(()=>{window.rejectAI=true;});
    // Rejection immediately restores the unchecked state; check() requires it to stay checked.
    await app.page.locator('#ai4k').click();
    await app.page.getByRole('alert').filter({hasText:'GPU không khả dụng'}).waitFor();
    assert.equal(await app.page.locator('#ai4k').isChecked(),false);
  } finally {await app.close();}
});
