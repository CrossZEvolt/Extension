import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchFixture,loadPlayer} from '../helpers/browser.js';

const player={playabilityStatus:{status:'OK'},videoDetails:{videoId:'main'},streamingData:{adaptiveFormats:[{url:'https://example.googlevideo.com/main'}]},playerAds:[{ad:true}],adPlacements:[{ad:true}],adSlots:[{ad:true}]};
const cleanPlayer=(({playerAds,adPlacements,adSlots,...content})=>content)(player);

async function installFilter(context,{enabled=true,confirm=true,seedPlayer=true}={}) {
  const bundle=await readFile(`dist/scripts/${enabled?'ads-main':'ads-main-disabled'}.js`,'utf8');
  await context.addInitScript({content:`
    const observedFetch=window.fetch;
    window.fetch=function(...args){return Reflect.apply(observedFetch,this,args).then(response=>{window.observedNetworkResponse=response;return response;});};
    ${confirm?`document.addEventListener('crossz-ads-ready',()=>document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:${enabled}})));`:''}
    ${bundle}
    ${seedPlayer?`window.ytInitialPlayerResponse=${JSON.stringify(player)};window.firstPlayerConsumption=structuredClone(window.ytInitialPlayerResponse);`:""}
  `});
}

test('enabled bootstrap filters the first inline player value without waiting for a preference event',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context,{enabled:true,confirm:false,seedPlayer:false});
    await app.context.route('https://www.youtube.com/watch?v=inline-startup',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script>var ytInitialPlayerResponse=${JSON.stringify(player)};window.firstPlayerConsumption=structuredClone(ytInitialPlayerResponse);</script></head><body>Inline startup fixture</body></html>`}));
    await app.page.goto('https://www.youtube.com/watch?v=inline-startup');
    assert.deepEqual(await app.page.evaluate(()=>window.firstPlayerConsumption),cleanPlayer);
  } finally {await app.close();}
});

test('player response body is filtered before arrayBuffer, blob, stream and clone consumers read it',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:player}));
    const result=await app.page.evaluate(async()=>{
      const buffer=JSON.parse(new TextDecoder().decode(await (await fetch('/youtubei/v1/player?read=buffer')).arrayBuffer()));
      const blob=JSON.parse(await (await (await fetch('/youtubei/v1/player?read=blob')).blob()).text());
      const response=await fetch('/youtubei/v1/player?read=stream');
      const reader=response.body.getReader();
      const decoder=new TextDecoder();let text='';
      for(;;){const {value,done}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
      const transferred=await new Response((await fetch('/youtubei/v1/player?read=transfer')).body).json();
      const cloned=await (await fetch('/youtubei/v1/player?read=clone')).clone().json();
      return {buffer,blob,stream:JSON.parse(text),transferred,cloned};
    });
    assert.deepEqual(result,Object.fromEntries(['buffer','blob','stream','transferred','cloned'].map(name=>[name,cleanPlayer])));
  } finally {await app.close();}
});

test('known player API envelopes filter array playerResponse values and retain unrelated objects',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?array=1',route=>route.fulfill({json:[{page:'watch',other:{playerAds:['keep']}},{playerResponse:player,tracking:'keep'}]}));
    for(const endpoint of ['get_watch','playlist'])await app.context.route(`https://www.youtube.com/youtubei/v1/${endpoint}?wrapped=1`,route=>route.fulfill({json:{playerResponse:player,other:{adSlots:['keep']}}}));
    const result=await app.page.evaluate(async()=>{
      const read=path=>fetch(path).then(response=>response.json());
      return {array:await read('/youtubei/v1/player?array=1'),watch:await read('/youtubei/v1/get_watch?wrapped=1'),playlist:await read('/youtubei/v1/playlist?wrapped=1')};
    });
    assert.deepEqual(result,{array:[{page:'watch',other:{playerAds:['keep']}},{playerResponse:cleanPlayer,tracking:'keep'}],watch:{playerResponse:cleanPlayer,other:{adSlots:['keep']}},playlist:{playerResponse:cleanPlayer,other:{adSlots:['keep']}}});
  } finally {await app.close();}
});

test('playlist list responses are filtered while other playlist requests stay unchanged',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/playlist?*',route=>route.fulfill({json:{playerResponse:player,other:{adSlots:['keep']}}}));
    const result=await app.page.evaluate(async()=>({
      playlist:await (await fetch('/playlist?list=fixture')).json(),
      unrelated:await (await fetch('/playlist?other=1')).json(),
    }));
    assert.deepEqual(result,{playlist:{playerResponse:cleanPlayer,other:{adSlots:['keep']}},unrelated:{playerResponse:player,other:{adSlots:['keep']}}});
  } finally {await app.close();}
});

test('a synthetic Response with an empty URL never inherits the page endpoint',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.page.goto('https://www.youtube.com/youtubei/v1/player');
    const result=await app.page.evaluate(async value=>{
      const response=new Response(JSON.stringify(value));
      return {url:response.url,value:await response.json()};
    },player);
    assert.deepEqual(result,{url:'',value:player});
  } finally {await app.close();}
});

test('Shorts sequences remove only entries explicitly marked as advertisements',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    const organic={id:'organic',command:{reelWatchEndpoint:{videoId:'one'}}};
    const advertisement={id:'ad',command:{reelWatchEndpoint:{adClientParams:{isAd:true}}}};
    const organicWithFalse={id:'not-ad',command:{reelWatchEndpoint:{adClientParams:{isAd:false}}}};
    const sequence={entries:[organic,advertisement,organicWithFalse],reelWatchSequenceResponse:{entries:[advertisement,organic]},other:{entries:[advertisement]}};
    await app.context.route('https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence?*',route=>route.fulfill({json:sequence}));
    const result=await app.page.evaluate(()=>fetch('/youtubei/v1/reel/reel_watch_sequence?items=1').then(response=>response.json()));
    assert.deepEqual(result,{entries:[organic,organicWithFalse],reelWatchSequenceResponse:{entries:[organic]},other:{entries:[advertisement]}});
  } finally {await app.close();}
});

test('disabled, unrelated and malformed fetches return the unchanged network Response',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context,{enabled:false,confirm:false});
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/**',route=>route.fulfill({body:route.request().url().includes('malformed')?'not-json':JSON.stringify(player),contentType:'application/json'}));
    const result=await app.page.evaluate(async()=>{
      const off=await fetch('/youtubei/v1/player?disabled=1');
      const offIdentity=off===window.observedNetworkResponse;
      const offValue=JSON.parse(new TextDecoder().decode(await off.arrayBuffer()));
      document.dispatchEvent(new CustomEvent('crossz-ads-state',{detail:true}));
      const unrelated=await fetch('/youtubei/v1/browse?untouched=1');
      const unrelatedIdentity=unrelated===window.observedNetworkResponse;
      const unrelatedValue=await unrelated.json();
      const malformed=await fetch('/youtubei/v1/player?malformed=1');
      const malformedIdentity=malformed===window.observedNetworkResponse;
      return {offIdentity,offValue,unrelatedIdentity,unrelatedValue,malformedIdentity,malformedText:await malformed.text()};
    });
    assert.deepEqual(result,{offIdentity:true,offValue:player,unrelatedIdentity:true,unrelatedValue:player,malformedIdentity:true,malformedText:'not-json'});
  } finally {await app.close();}
});

test('filtered response clones preserve response metadata, headers and one-use body semantics',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?final=1',route=>route.fulfill({status:201,body:JSON.stringify(player),headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(JSON.stringify(player))),'x-player-metadata':'keep'}}));
    const result=await app.page.evaluate(async()=>{
      const response=await fetch('/youtubei/v1/player?final=1');
      const native=window.observedNetworkResponse;
      const clone=response.clone().clone();
      const metadata=value=>({status:value.status,statusText:value.statusText,url:value.url,type:value.type,redirected:value.redirected,header:value.headers.get('x-player-metadata')});
      const mainMetadata=metadata(response),cloneMetadata=metadata(clone),nativeMetadata=metadata(native);
      const text=await response.text();let secondRead;
      try {await response.text();}catch(error){secondRead=error.name;}
      const length=response.headers.get('content-length');
      return {mainMetadata,cloneMetadata,nativeMetadata,value:JSON.parse(text),cloneValue:await clone.json(),used:response.bodyUsed,secondRead,lengthCorrect:length===null || Number(length)===new TextEncoder().encode(text).length};
    });
    assert.deepEqual(result.mainMetadata,result.nativeMetadata);
    assert.deepEqual(result.cloneMetadata,result.nativeMetadata);
    assert.deepEqual(result.value,cleanPlayer);assert.deepEqual(result.cloneValue,cleanPlayer);
    assert.equal(result.used,true);assert.equal(result.secondRead,'TypeError');assert.equal(result.lengthCorrect,true);
  } finally {await app.close();}
});

test('fetch filtering preserves failed responses and AbortError rejection',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?failed=1',route=>route.fulfill({status:500,json:player}));
    const result=await app.page.evaluate(async()=>{
      const failed=await fetch('/youtubei/v1/player?failed=1');
      const same=failed===window.observedNetworkResponse;
      let abort;
      try {await fetch('/youtubei/v1/player?abort=1',{signal:AbortSignal.abort()});}catch(error){abort=error.name;}
      return {same,status:failed.status,value:await failed.json(),abort};
    });
    assert.deepEqual(result,{same:true,status:500,value:player,abort:'AbortError'});
  } finally {await app.close();}
});

test('aborting after fetch resolves rejects the filtered body and its unused clones',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:player}));
    const result=await app.page.evaluate(async()=>{
      const abortedRead=async read=>{try {await read();return 'success';}catch(error){return error.name;}};
      const directController=new AbortController();
      const direct=await fetch('/youtubei/v1/player?abort=direct',{signal:directController.signal});
      directController.abort();
      const directError=await abortedRead(()=>direct.json());
      const requestController=new AbortController();
      const requestResponse=await fetch(new Request('/youtubei/v1/player?abort=request',{signal:requestController.signal}));
      const unusedClone=requestResponse.clone().clone();
      await requestResponse.clone().arrayBuffer();
      requestController.abort();
      const [originalError,cloneError]=await Promise.all([abortedRead(()=>requestResponse.text()),abortedRead(()=>unusedClone.arrayBuffer())]);
      const originalController=new AbortController(),overrideController=new AbortController();
      const overridden=await fetch(new Request('/youtubei/v1/player?abort=override',{signal:originalController.signal}),{signal:overrideController.signal});
      originalController.abort();
      const stillReadable=await overridden.clone().json();
      overrideController.abort();
      const readerError=await abortedRead(()=>overridden.body.getReader().read());
      const lockedController=new AbortController();
      const locked=await fetch('/youtubei/v1/player?abort=locked',{signal:lockedController.signal});
      const lock=locked.body.getReader();lockedController.abort();
      const lockedError=await abortedRead(()=>locked.text());lock.releaseLock();
      return {directError,originalError,cloneError,stillReadable,readerError,lockedError};
    });
    assert.deepEqual(result,{directError:'AbortError',originalError:'AbortError',cloneError:'AbortError',stillReadable:cleanPlayer,readerError:'AbortError',lockedError:'TypeError'});
  } finally {await app.close();}
});

test('mutating a returned byte chunk does not change another filtered clone',async()=>{
  const app=await launchFixture();try {
    await installFilter(app.context);
    await loadPlayer(app.context,app.page);
    await app.context.route('https://www.youtube.com/youtubei/v1/player?*',route=>route.fulfill({json:player}));
    const result=await app.page.evaluate(async()=>{
      const response=await fetch('/youtubei/v1/player?clone=isolation');
      const clone=response.clone();
      const reader=response.body.getReader();
      const chunk=await reader.read();chunk.value.fill(32);
      try {return {value:await clone.json()};}catch(error){return {error:error.name};}
    });
    assert.deepEqual(result,{value:cleanPlayer});
  } finally {await app.close();}
});
