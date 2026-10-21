import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchFixture} from '../helpers/browser.js';

test('popup distinguishes enabled preferences from a ready pre-player filter and reports initialization failure',async()=>{
  const app=await launchFixture();
  try {
    await app.context.addInitScript(()=>{
      window.snapshot={tabId:7,isYouTube:true,ambientEnabled:true,adBlockingEnabled:true,adFilter:{state:'starting',error:null},audio:{state:'inactive',percent:100}};
      chrome.tabs={query:async()=>[{id:7}]};
      chrome.runtime.sendMessage=async()=>({ok:true,data:window.snapshot});
    });
    await app.page.goto('https://www.youtube.com/__crossz/popup.html');
    assert.equal(await app.page.locator('#adStatus').count(),1);
    await app.page.waitForFunction(()=>document.querySelector('#adStatus').textContent.includes('Đang chuẩn bị'));
    assert.equal(await app.page.locator('#adBlocking').isChecked(),true);
    await app.page.evaluate(()=>{window.snapshot.adFilter={state:'error',error:'Không có quyền truy cập YouTube.'};});
    await app.page.waitForFunction(()=>document.querySelector('#adStatus').textContent.includes('Không có quyền truy cập YouTube.'));
    assert.doesNotMatch(await app.page.locator('#adStatus').textContent(),/Lọc dữ liệu quảng cáo/);
    await app.page.evaluate(()=>{window.snapshot.adFilter={state:'ready',error:null};});
    await app.page.waitForFunction(()=>document.querySelector('#adStatus').textContent.includes('Lọc dữ liệu quảng cáo'));
    assert.match(await app.page.locator('#adHint').textContent(),/Tải lại tab YouTube/);
    await app.page.evaluate(()=>{window.snapshot.adBlockingEnabled=false;});
    await app.page.waitForFunction(()=>document.querySelector('#adStatus').textContent.includes('Đã tắt'));
  } finally {await app.close();}
});
