const KEY='crossz-preferences-v1';
const clone=value=>structuredClone(value);

// Stateful Chrome API adapter: unit tests cannot install extensions under cloud policy.
export function createAdApi({storedEnabled,registered=[],dnrEnabled=true}={}) {
  const values=storedEnabled===undefined?{}:{[KEY]:{schemaVersion:1,adBlockingEnabled:storedEnabled}};
  const state={values,registry:new Map(registered.map(script=>[script.id,clone(script)])),rules:new Set(dnrEnabled?['youtube_ads']:[]),writes:[],mutations:[]};
  const hooks={};
  const api={
    storage:{local:{
      get:async key=>{await hooks.readPreferences?.();return {[key]:clone(values[key])};},
      set:async next=>{await hooks.writePreferences?.(next);state.writes.push(clone(next));Object.assign(values,clone(next));},
    }},
    declarativeNetRequest:{
      getEnabledRulesets:async()=>{await hooks.readRules?.();return [...state.rules];},
      updateEnabledRulesets:async update=>{
        await hooks.updateRules?.(update);
        state.mutations.push(['rules',clone(update)]);
        for(const id of update.disableRulesetIds || [])state.rules.delete(id);
        for(const id of update.enableRulesetIds || [])state.rules.add(id);
      },
    },
    scripting:{
      getRegisteredContentScripts:async filter=>{
        await hooks.readScripts?.();
        return [...state.registry.values()].filter(script=>!filter?.ids || filter.ids.includes(script.id)).map(clone);
      },
      registerContentScripts:async scripts=>{
        await hooks.registerScripts?.(scripts);
        if(scripts.some(script=>state.registry.has(script.id)))throw new Error('Duplicate content script');
        state.mutations.push(['register',clone(scripts)]);
        for(const script of scripts)state.registry.set(script.id,clone(script));
      },
      updateContentScripts:async scripts=>{
        await hooks.updateScripts?.(scripts);
        if(scripts.some(script=>!state.registry.has(script.id)))throw new Error('Missing content script');
        state.mutations.push(['update',clone(scripts)]);
        for(const script of scripts)state.registry.set(script.id,{...state.registry.get(script.id),...clone(script)});
      },
      unregisterContentScripts:async filter=>{
        await hooks.unregisterScripts?.(filter);
        state.mutations.push(['unregister',clone(filter)]);
        for(const id of filter.ids)state.registry.delete(id);
      },
    },
  };
  return {api,state,hooks};
}
