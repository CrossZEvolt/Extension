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
