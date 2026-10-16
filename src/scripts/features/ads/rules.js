import {readPreferences,writePreferences} from '../shared/preferences.js';
export async function setAdRulesEnabled(enabled,api=chrome) {
  if(typeof enabled!=='boolean')throw new Error('Invalid ad setting');
  await api.declarativeNetRequest.updateEnabledRulesets({enableRulesetIds:enabled?['youtube_ads']:[],disableRulesetIds:enabled?[]:['youtube_ads']});
}
export function createAdSettingController(api=chrome) {
  let pending=Promise.resolve();
  return enabled=>{
    const operation=pending.catch(()=>{}).then(async()=>{
      const previous=await readPreferences(api.storage.local);
      await setAdRulesEnabled(enabled,api);
      try{await writePreferences({...previous,adBlockingEnabled:enabled},api.storage.local);}
      catch(error){await setAdRulesEnabled(previous.adBlockingEnabled,api);throw error;}
    });
    pending=operation;return operation;
  };
}
