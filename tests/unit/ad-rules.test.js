import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('ad rules are limited to YouTube initiators and ad-only hosts',async()=>{
 const rules=JSON.parse(await readFile(new URL('../../src/rules/youtube-ads.json',import.meta.url),'utf8'));
 assert.ok(rules.length>0);
 for(const rule of rules){assert.deepEqual(rule.condition.initiatorDomains,['youtube.com']);assert.equal(rule.action.type,'block');assert.doesNotMatch(rule.condition.urlFilter,/googlevideo|youtubei|videoplayback/);}
});
test('failed DNR update does not persist success',async()=>{
 const {createAdSettingController}=await import('../../src/scripts/features/ads/rules.js');let writes=0;
 const api={declarativeNetRequest:{updateEnabledRulesets:async()=>{throw new Error('DNR failed');}},storage:{local:{get:async()=>({}),set:async()=>{writes++;}}}};
 await assert.rejects(createAdSettingController(api)(false),/DNR failed/);assert.equal(writes,0);
});
test('a user command wins over a delayed worker startup preference read',async t=>{
 const key='crossz-preferences-v1',values={[key]:{schemaVersion:1,adBlockingEnabled:false}},updates=[],writes=[];
 let listener,releaseStartupRead,signalStartupRead,signalUpdates,firstRead=true;
 const startupRead=new Promise(resolve=>signalStartupRead=resolve),rulesUpdated=new Promise(resolve=>signalUpdates=resolve);
 const api={
  runtime:{id:'abc',getURL:path=>'chrome-extension://abc/'+path,getContexts:async()=>[],onMessage:{addListener:callback=>listener=callback}},
  tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=1'}),onRemoved:{addListener:()=>{}},onUpdated:{addListener:()=>{}}},
  tabCapture:{onStatusChanged:{addListener:()=>{}}},
  declarativeNetRequest:{updateEnabledRulesets:async update=>{updates.push(update.enableRulesetIds.includes('youtube_ads'));if(updates.length===2)signalUpdates();}},
  storage:{local:{
   get:async requested=>{
    const snapshot={[requested]:values[requested]};
    if(requested===key && firstRead){firstRead=false;signalStartupRead();return new Promise(resolve=>releaseStartupRead=()=>resolve(snapshot));}
    return snapshot;
   },
   set:async next=>{writes.push(next);Object.assign(values,next);},
  }},
 };
 const previousChrome=globalThis.chrome;globalThis.chrome=api;
 t.after(()=>{if(previousChrome===undefined)delete globalThis.chrome;else globalThis.chrome=previousChrome;});
 await import('../../src/scripts/background.js?ad-startup-race');
 await startupRead;
 const command=new Promise(resolve=>listener({channel:'crossz-worker',type:'AD_SET_ENABLED',tabId:1,payload:{enabled:true}},{id:'abc',url:'chrome-extension://abc/options.html'},resolve));
 await new Promise(resolve=>setImmediate(resolve));
 releaseStartupRead();
 assert.equal((await command).ok,true);
 await rulesUpdated;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(values[key].adBlockingEnabled,true);
 assert.deepEqual(updates,[false,true]);
 assert.equal(writes.length,1);
});
test('startup reconciliation applies stored rules without writing preferences',async()=>{
 const {createAdSettingController}=await import('../../src/scripts/features/ads/rules.js');let writes=0;const updates=[];
 const api={declarativeNetRequest:{updateEnabledRulesets:async update=>updates.push(update)},storage:{local:{get:async()=>({'crossz-preferences-v1':{schemaVersion:1,adBlockingEnabled:false}}),set:async()=>{writes++;}}}};
 await createAdSettingController(api).reconcile();
 assert.deepEqual(updates,[{enableRulesetIds:[],disableRulesetIds:['youtube_ads']}]);
 assert.equal(writes,0);
});
