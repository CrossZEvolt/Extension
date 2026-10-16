import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchFixture,loadPlayer} from '../helpers/browser.js';

const payload={
  playabilityStatus:{status:'OK'},videoDetails:{videoId:'main-video'},
  streamingData:{adaptiveFormats:[{url:'https://example.googlevideo.com/videoplayback?content=main'}]},
  playerAds:[{ad:true}],adPlacements:[{ad:true}],adSlots:[{ad:true}],
};
const withoutAds=({playerAds,adPlacements,adSlots,...content})=>content;

async function installMainFilter(context,enabled=true) {
  const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
  const paths=manifest.content_scripts.filter(entry=>entry.world==='MAIN').flatMap(entry=>entry.js || []);
  const bundles=await Promise.all(paths.map(path=>readFile(`dist/${path}`,'utf8')));
  await context.addInitScript({content:`
    document.addEventListener('crossz-ads-ready',()=>document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:${enabled}})));
    ${bundles.join('\n;\n')}
    window.ytInitialPlayerResponse=${JSON.stringify(payload)};
    window.initialPlayerSnapshot=structuredClone(window.ytInitialPlayerResponse);
  `});
}

test('player advertising is removed before initial page code consumes its configuration',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context);
    await loadPlayer(app.context,app.page);
    assert.deepEqual(await app.page.evaluate(()=>window.initialPlayerSnapshot),withoutAds(payload));
    assert.deepEqual(await app.page.evaluate(()=>JSON.parse('{"playerAds":[1]}')),{playerAds:[1]});
  } finally {await app.close();}
});

test('fetch player JSON and text lose only ad metadata while response properties survive',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:payload,headers:{'x-crossz-fixture':'preserved'}}));
    const result=await app.page.evaluate(async()=>{
      const response=await fetch(new Request('/youtubei/v1/player?key=fixture'));
      const copy=response.clone();
      return {status:response.status,url:response.url,header:response.headers.get('x-crossz-fixture'),
        json:await response.json(),text:JSON.parse(await copy.text()),used:response.bodyUsed};
    });
    assert.deepEqual(result,{status:200,url:'https://www.youtube.com/youtubei/v1/player?key=fixture',header:'preserved',json:withoutAds(payload),text:withoutAds(payload),used:true});
  } finally {await app.close();}
});

test('XHR text and JSON player responses are filtered without touching other endpoints',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/**',route=>route.fulfill({json:payload}));
    const result=await app.page.evaluate(async()=>{
      const request=(path,responseType)=>new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('GET',path);xhr.responseType=responseType;
        xhr.onload=()=>resolve(responseType==='json'?xhr.response:JSON.parse(xhr.responseText));xhr.onerror=reject;xhr.send();
      });
      return {text:await request('/youtubei/v1/player?xhr=1',''),json:await request('/youtubei/v1/player?xhr=2','json'),other:await request('/youtubei/v1/browse','json')};
    });
    assert.deepEqual(result,{text:withoutAds(payload),json:withoutAds(payload),other:payload});
  } finally {await app.close();}
});

test('saved disabled state and live toggles preserve unfiltered responses when off',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context,false);
    await loadPlayer(app.context,app.page);
    assert.deepEqual(await app.page.evaluate(()=>window.initialPlayerSnapshot),payload);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:payload}));
    const result=await app.page.evaluate(async()=>{
      const read=()=>fetch('/youtubei/v1/player?toggle=1').then(response=>response.json());
      const off=await read();
      document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:true}));const on=await read();
      document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:false}));const offAgain=await read();
      return {off,on,offAgain};
    });
    assert.deepEqual(result,{off:payload,on:withoutAds(payload),offAgain:payload});
  } finally {await app.close();}
});

test('malformed payloads, other origins, and non-player requests remain unchanged',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('**/youtubei/v1/**',route=>route.fulfill({body:route.request().url().includes('malformed')?'not-json':JSON.stringify(payload),headers:{'access-control-allow-origin':'*'}}));
    const result=await app.page.evaluate(async()=>({
      malformed:await fetch('/youtubei/v1/player?malformed=1').then(response=>response.text()),
      unrelated:await fetch('/youtubei/v1/browse').then(response=>response.json()),
      external:await fetch('https://example.com/youtubei/v1/player').then(response=>response.json()),
    }));
    assert.deepEqual(result,{malformed:'not-json',unrelated:payload,external:payload});
  } finally {await app.close();}
});

test('late preference confirmation cleans retained configuration without acting while unknown',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context,false);
    await loadPlayer(app.context,app.page);
    const result=await app.page.evaluate(()=>{
      const retained=window.ytInitialPlayerResponse;
      const before=structuredClone(retained);
      document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:'true'}));
      const invalid=structuredClone(window.ytInitialPlayerResponse);
      document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:true}));
      const after=structuredClone(retained);
      window.playerResponse={playerResponse:{...before},other:{playerAds:['preserve unrelated data']}};
      return {before,invalid,after,nested:structuredClone(window.playerResponse)};
    });
    assert.deepEqual(result,{before:payload,invalid:payload,after:withoutAds(payload),nested:{playerResponse:withoutAds(payload),other:{playerAds:['preserve unrelated data']}}});
  } finally {await app.close();}
});

test('anti-XSSI text and partial XHR reads retain normal parsing and ready-state behavior',async()=>{
  const app=await launchFixture();
  try {
    await installMainFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({body:")]}'\n"+JSON.stringify(payload),contentType:'application/json'}));
    const result=await app.page.evaluate(async()=>{
      const before=new XMLHttpRequest();before.open('GET','/youtubei/v1/player?prefix=1');
      const empty=before.responseText;
      const text=await fetch('/youtubei/v1/player?prefix=2').then(response=>response.text());
      const xhr=await new Promise((resolve,reject)=>{before.onload=()=>resolve(before.response);before.onerror=reject;before.send();});
      return {empty,text,xhr};
    });
    assert.deepEqual(result,{empty:'',text:")]}'\n"+JSON.stringify(withoutAds(payload)),xhr:")]}'\n"+JSON.stringify(withoutAds(payload))});
  } finally {await app.close();}
});

test('confirmed preferences cross a separate isolated world into the MAIN player filter',async()=>{
  const app=await launchFixture();
  try {
    // null deliberately leaves MAIN waiting for a real isolated-world confirmation.
    await installMainFilter(app.context,null);
    await loadPlayer(app.context,app.page);
    assert.deepEqual(await app.page.evaluate(()=>window.initialPlayerSnapshot),payload);
    const session=await app.context.newCDPSession(app.page);
    const {frameTree}=await session.send('Page.getFrameTree');
    const {executionContextId}=await session.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'crossz-ads-test'});
    const bundle=await readFile('dist/scripts/ads-content.js','utf8');
    const installed=await session.send('Runtime.evaluate',{contextId:executionContextId,expression:`
      globalThis.chrome={storage:{local:{
        get:async()=>({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:true}}),
        onChanged:{addListener:handler=>{window.fixtureAdChange=handler;},removeListener:()=>{}}
      }}};
      ${bundle}
    `});
    assert.equal(installed.exceptionDetails,undefined);
    await app.page.waitForFunction(()=>!('adSlots' in window.ytInitialPlayerResponse));
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:payload}));
    assert.deepEqual(await app.page.evaluate(()=>fetch('/youtubei/v1/player?world=1').then(response=>response.json())),withoutAds(payload));
    const disabled=await session.send('Runtime.evaluate',{contextId:executionContextId,expression:`window.fixtureAdChange({'crossz-preferences-v1':{newValue:{schemaVersion:1,adBlockingEnabled:false}}})`});
    assert.equal(disabled.exceptionDetails,undefined);
    assert.deepEqual(await app.page.evaluate(()=>fetch('/youtubei/v1/player?world=2').then(response=>response.json())),payload);
    await session.detach();
  } finally {await app.close();}
});
