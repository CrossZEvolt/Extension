import {readPreferences,writePreferences} from '../shared/preferences.js';
const SCRIPT_ID='crossz-player-filter';
const SETUP_ERROR='Không thể khởi tạo bộ lọc quảng cáo trước khi phát. Hãy tải lại tiện ích rồi thử lại.';
const ROLLBACK_ERROR='Không thể khôi phục đầy đủ bộ lọc quảng cáo. Hãy tải lại tiện ích trước khi thử lại.';
const registration=enabled=>({
  id:SCRIPT_ID,matches:['https://www.youtube.com/*'],excludeMatches:['https://www.youtube.com/live_chat*'],
  js:[enabled?'scripts/ads-main.js':'scripts/ads-main-disabled.js'],css:[],world:'MAIN',runAt:'document_start',
  allFrames:true,persistAcrossSessions:true,matchOriginAsFallback:false,
});
const matchesRegistration=(current,desired)=>{
  if(!current)return false;
  const normalized={...current,css:current.css || [],excludeMatches:current.excludeMatches || [],persistAcrossSessions:current.persistAcrossSessions ?? true,matchOriginAsFallback:current.matchOriginAsFallback ?? false};
  return Object.entries(desired).every(([key,value])=>Array.isArray(value)?Array.isArray(normalized[key]) && value.length===normalized[key].length && value.every((item,index)=>item===normalized[key][index]):normalized[key]===value);
};
const ownRegistration=async api=>(await api.scripting.getRegisteredContentScripts({ids:[SCRIPT_ID]})).find(script=>script.id===SCRIPT_ID) || null;
async function restoreRegistration(previous,api) {
  const current=await ownRegistration(api);
  if(current)await api.scripting.unregisterContentScripts({ids:[SCRIPT_ID]});
  if(previous)await api.scripting.registerContentScripts([previous]);
}
export async function setAdRulesEnabled(enabled,api=chrome) {
  if(typeof enabled!=='boolean')throw new Error('Invalid ad setting');
  await api.declarativeNetRequest.updateEnabledRulesets({enableRulesetIds:enabled?['youtube_ads']:[],disableRulesetIds:enabled?[]:['youtube_ads']});
}
export function createAdSettingController(api=chrome) {
  let pending=Promise.resolve(),status={state:'starting',error:null};
  const transaction=async(requested,persist)=>{
    let previousRegistration,previousRules,rulesChanged=false,registrationChanged=false;
    try {
      if(persist && typeof requested!=='boolean')throw new Error('Invalid ad setting');
      for(const method of ['getRegisteredContentScripts','registerContentScripts','updateContentScripts','unregisterContentScripts']) {
        if(typeof api.scripting?.[method]!=='function')throw new Error('Content script registration unavailable');
      }
      if(typeof api.declarativeNetRequest?.getEnabledRulesets!=='function')throw new Error('Ruleset state unavailable');
      const preferences=await readPreferences(api.storage.local);
      const enabled=persist?requested:preferences.adBlockingEnabled;
      previousRegistration=await ownRegistration(api);
      previousRules=(await api.declarativeNetRequest.getEnabledRulesets()).includes('youtube_ads');
      if(previousRules!==enabled) {
        await setAdRulesEnabled(enabled,api);
        rulesChanged=true;
      }
      const desired=registration(enabled);
      if(!matchesRegistration(previousRegistration,desired)) {
        if(previousRegistration)await api.scripting.updateContentScripts([desired]);
        else await api.scripting.registerContentScripts([desired]);
        registrationChanged=true;
      }
      // A successful API call must leave the expected synchronous bootstrap registered.
      if(!matchesRegistration(await ownRegistration(api),desired))throw new Error('Content script registration not ready');
      if(persist)await writePreferences({...preferences,adBlockingEnabled:enabled},api.storage.local);
    } catch(cause) {
      const recoveries=[];
      if(registrationChanged)recoveries.push(restoreRegistration(previousRegistration,api));
      if(rulesChanged)recoveries.push(setAdRulesEnabled(previousRules,api));
      const failed=(await Promise.allSettled(recoveries)).some(result=>result.status==='rejected');
      throw Object.assign(new Error(failed?ROLLBACK_ERROR:SETUP_ERROR,{cause}),{code:failed?'AD_FILTER_ROLLBACK_FAILED':'AD_FILTER_SETUP_FAILED'});
    }
  };
  const enqueue=action=>{
    status={state:'starting',error:null};
    const operation=pending.catch(()=>{}).then(async()=>{
      status={state:'starting',error:null};
      try {await action();status={state:'ready',error:null};}
      catch(error){status={state:'error',error:error.message};throw error;}
    });
    pending=operation;return operation;
  };
  const setEnabled=enabled=>enqueue(()=>transaction(enabled,true));
  setEnabled.reconcile=()=>enqueue(()=>transaction(undefined,false));
  setEnabled.status=()=>({...status});
  return setEnabled;
}
