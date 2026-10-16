import {test} from 'node:test';import assert from 'node:assert/strict';
import {launchFixture} from '../helpers/browser.js';
import {mkdir} from 'node:fs/promises';
test('Vietnamese popup applies confirmed gain, stops at 100 and reports capture errors',async()=>{
 const a=await launchFixture();try{
 await a.context.addInitScript(()=>{
  window.commands=[];window.snapshot={tabId:7,isYouTube:true,ambientEnabled:true,adBlockingEnabled:true,audio:{state:'inactive',percent:100}};
  chrome.tabs={query:async()=>[{id:7}]};chrome.runtime.openOptionsPage=()=>{};
  chrome.runtime.sendMessage=async m=>{
   window.commands.push(m);
   if(m.type==='AUDIO_SET_GAIN'){if(window.rejectAudio)return {ok:false,error:{message:'Capture bị từ chối'}};window.snapshot.audio={state:'active',percent:m.payload.percent};}
   if(m.type==='AUDIO_STOP')window.snapshot.audio={state:'inactive',percent:100};
   return {ok:true,data:window.snapshot};
  };
 });
 await a.page.goto('https://www.youtube.com/__crossz/popup.html');
 await a.page.locator('#volume').waitFor({timeout:3000});
 assert.equal(await a.page.locator('html').getAttribute('lang'),'vi');
 assert.equal(await a.page.locator('#volume').getAttribute('max'),'500');
 await a.page.waitForFunction(()=>getComputedStyle(document.querySelector('#adBlocking + span'),'::after').transform==='matrix(1, 0, 0, 1, 13, 0)');
 await mkdir('artifacts',{recursive:true});await a.page.screenshot({path:'artifacts/popup.png',clip:{x:0,y:0,width:360,height:640}});
 await a.page.locator('#boost').check();await a.page.waitForFunction(()=>document.querySelector('#volume').value==='150');
 await a.page.locator('#resetVolume').click();await a.page.waitForFunction(()=>document.querySelector('#volume').value==='100');
 await a.page.evaluate(()=>{window.rejectAudio=true;});
 await a.page.locator('#boost').click();await a.page.getByRole('alert').filter({hasText:'Capture bị từ chối'}).waitFor();
 assert.equal(await a.page.locator('#boost').isChecked(),false);
 await a.page.evaluate(()=>{window.snapshot.isYouTube=false;});
 await a.page.waitForFunction(()=>document.querySelector('#boost').disabled);
 assert.equal(await a.page.locator('#adBlocking').isDisabled(),false);
 }finally{await a.close();}
});
