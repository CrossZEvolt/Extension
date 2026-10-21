import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdSettingController} from '../../src/scripts/features/ads/rules.js';
import {createAdApi} from '../helpers/ad-api.js';

const KEY='crossz-preferences-v1',ID='crossz-player-filter';
const unrelated={id:'another-module',matches:['https://example.com/*'],js:['scripts/other.js']};
const desired=enabled=>({id:ID,matches:['https://www.youtube.com/*'],excludeMatches:['https://www.youtube.com/live_chat*'],js:[enabled?'scripts/ads-main.js':'scripts/ads-main-disabled.js'],css:[],world:'MAIN',runAt:'document_start',allFrames:true,persistAcrossSessions:true,matchOriginAsFallback:false});

test('startup installs the enabled synchronous MAIN filter without changing preferences or other registrations',async()=>{
  const {api,state}=createAdApi({registered:[unrelated]});
  const setting=createAdSettingController(api);
  await setting.reconcile();
  assert.deepEqual(state.registry.get(ID),desired(true));
  assert.deepEqual(state.registry.get(unrelated.id),unrelated);
  assert.equal(state.registry.size,2);
  assert.deepEqual(state.writes,[]);
  assert.deepEqual(setting.status(),{state:'ready',error:null});
});

test('a saved disabled preference installs the disabled bootstrap before future page scripts run',async()=>{
  const {api,state}=createAdApi({storedEnabled:false});
  const setting=createAdSettingController(api);
  await setting.reconcile();
  assert.deepEqual(state.registry.get(ID),desired(false));
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.values[KEY].adBlockingEnabled,false);
  assert.deepEqual(state.writes,[]);
  assert.deepEqual(setting.status(),{state:'ready',error:null});
});

test('reconciliation repairs stale registration attributes and is then idempotent',async()=>{
  const stale={...desired(false),world:'ISOLATED',runAt:'document_idle',allFrames:false,css:['styles/stale.css']};
  const {api,state}=createAdApi({storedEnabled:true,registered:[stale,unrelated]});
  const setting=createAdSettingController(api);
  await setting.reconcile();
  assert.deepEqual(state.registry.get(ID),desired(true));
  const mutations=structuredClone(state.mutations);
  await setting.reconcile();
  assert.deepEqual(state.mutations,mutations);
  assert.deepEqual(state.registry.get(unrelated.id),unrelated);
  assert.deepEqual(state.writes,[]);
});

test('a successful user change commits matching rules, bootstrap, and stored preference',async()=>{
  const {api,state}=createAdApi({storedEnabled:true,registered:[desired(true)]});
  const setting=createAdSettingController(api);
  await setting(false);
  assert.deepEqual(state.registry.get(ID),desired(false));
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.values[KEY].adBlockingEnabled,false);
  assert.equal(state.writes.length,1);
  assert.deepEqual(setting.status(),{state:'ready',error:null});
});

test('registration failure restores actual prior rules and never commits the requested preference',async()=>{
  const {api,state,hooks}=createAdApi({storedEnabled:true,registered:[unrelated],dnrEnabled:false});
  hooks.registerScripts=async()=>{throw new Error('Private browser detail');};
  const setting=createAdSettingController(api);
  await assert.rejects(setting(true));
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.registry.has(ID),false);
  assert.equal(state.values[KEY].adBlockingEnabled,true);
  assert.deepEqual(state.registry.get(unrelated.id),unrelated);
  assert.deepEqual(state.writes,[]);
  assert.equal(setting.status().state,'error');
  assert.doesNotMatch(setting.status().error,/Private browser detail/);
});

test('failed preference persistence removes a new registration and restores the actual previous DNR state',async()=>{
  const {api,state,hooks}=createAdApi({storedEnabled:false,registered:[unrelated],dnrEnabled:false});
  hooks.writePreferences=async()=>{throw new Error('Storage unavailable');};
  const setting=createAdSettingController(api);
  await assert.rejects(setting(true));
  assert.equal(state.registry.has(ID),false);
  assert.deepEqual(state.registry.get(unrelated.id),unrelated);
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.values[KEY].adBlockingEnabled,false);
  assert.equal(setting.status().state,'error');
});

test('failed preference persistence restores an updated registration exactly',async()=>{
  const previous={...desired(true),excludeMatches:['https://www.youtube.com/live_chat*','https://www.youtube.com/other*']};
  const {api,state,hooks}=createAdApi({storedEnabled:true,registered:[previous,unrelated]});
  let attemptedBootstrap;
  hooks.writePreferences=async()=>{attemptedBootstrap=structuredClone(state.registry.get(ID));throw new Error('Storage unavailable');};
  const setting=createAdSettingController(api);
  await assert.rejects(setting(false));
  assert.deepEqual(attemptedBootstrap,desired(false));
  assert.deepEqual(state.registry.get(ID),previous);
  assert.deepEqual(state.registry.get(unrelated.id),unrelated);
  assert.equal(state.rules.has('youtube_ads'),true);
  assert.equal(state.values[KEY].adBlockingEnabled,true);
});

test('registration remains starting until the browser accepts the bootstrap',async()=>{
  const {api,hooks}=createAdApi();
  let release,entered;
  const entering=new Promise(resolve=>entered=resolve);
  hooks.registerScripts=async()=>{entered();await new Promise(resolve=>release=resolve);};
  const setting=createAdSettingController(api);
  assert.deepEqual(setting.status?.(),{state:'starting',error:null});
  const operation=setting.reconcile();
  await entering;
  assert.deepEqual(setting.status(),{state:'starting',error:null});
  release();await operation;
  assert.deepEqual(setting.status(),{state:'ready',error:null});
});

test('missing registration capability reports an error without changing rules or preferences',async()=>{
  const {api,state}=createAdApi({storedEnabled:false});
  delete api.scripting;
  const setting=createAdSettingController(api);
  await assert.rejects(setting.reconcile());
  assert.deepEqual(state.mutations,[]);
  assert.deepEqual(state.writes,[]);
  assert.equal(setting.status().state,'error');
});

test('an unconfirmed browser registration cannot be reported as ready or persist success',async()=>{
  const {api,state}=createAdApi({storedEnabled:false,dnrEnabled:false});
  api.scripting.registerContentScripts=async()=>{};
  const setting=createAdSettingController(api);
  await assert.rejects(setting(true),error=>error.code==='AD_FILTER_SETUP_FAILED');
  assert.equal(state.registry.has(ID),false);
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.values[KEY].adBlockingEnabled,false);
  assert.deepEqual(state.writes,[]);
  assert.equal(setting.status().state,'error');
});

test('a failed bootstrap rollback still restores DNR and exposes a safe error',async()=>{
  const {api,state,hooks}=createAdApi({storedEnabled:false,dnrEnabled:false});
  hooks.writePreferences=async()=>{throw new Error('private-storage-detail');};
  hooks.unregisterScripts=async()=>{throw new Error('private-registration-detail');};
  const setting=createAdSettingController(api);
  await assert.rejects(setting(true));
  assert.equal(state.rules.has('youtube_ads'),false);
  assert.equal(state.values[KEY].adBlockingEnabled,false);
  assert.equal(setting.status().state,'error');
  assert.doesNotMatch(setting.status().error,/private-/);
});
