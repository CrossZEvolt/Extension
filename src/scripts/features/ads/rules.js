import {readPreferences,writePreferences} from '../shared/preferences.js';
export async function setAdRulesEnabled(enabled,api=chrome) {
  if(typeof enabled!=='boolean')throw new Error('Invalid ad setting');
  await api.declarativeNetRequest.updateEnabledRulesets({enableRulesetIds:enabled?['youtube_ads']:[],disableRulesetIds:enabled?[]:['youtube_ads']});
}
export function createAdSettingController(api=chrome) {
  let pending=Promise.resolve();
  const enqueue=action=>{
    const operation=pending.catch(()=>{}).then(action);
    pending=operation;return operation;
  };
  const setEnabled=enabled=>enqueue(async()=>{
    const previous=await readPreferences(api.storage.local);
    await setAdRulesEnabled(enabled,api);
    try{await writePreferences({...previous,adBlockingEnabled:enabled},api.storage.local);}
    catch(error){await setAdRulesEnabled(previous.adBlockingEnabled,api);throw error;}
  });
  setEnabled.reconcile=()=>enqueue(async()=>{
    const preferences=await readPreferences(api.storage.local);
    await setAdRulesEnabled(preferences.adBlockingEnabled,api);
  });
  return setEnabled;
}
