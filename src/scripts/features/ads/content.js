import { createAdController } from './controller.js';
import { parseImportedPreferences, readPreferences, PREFERENCES_KEY } from '../shared/preferences.js';

export function startAdContent({document,area=chrome.storage.local}) {
  const view=document.defaultView;
  const ads=createAdController({document,requestFrame:callback=>view.requestAnimationFrame(callback),cancelFrame:id=>view.cancelAnimationFrame(id)});
  let revision=0,enabled,stopped=false;
  const publish=()=>{
    if(!stopped && typeof enabled==='boolean')document.dispatchEvent(new view.CustomEvent('crossz-ads-state',{detail:enabled}));
  };
  const apply=value=>{
    if(stopped)return;
    enabled=value;
    if(enabled)ads.start();else ads.stop();
    publish();
  };
  const onChanged=changes=>{
    if(!Object.hasOwn(changes,PREFERENCES_KEY))return;
    revision++;
    let value=true;
    const next=changes[PREFERENCES_KEY].newValue;
    if(next!==undefined) {
      try{value=parseImportedPreferences(JSON.stringify(next)).adBlockingEnabled;}catch{}
    }
    apply(value);
  };
  area.onChanged.addListener(onChanged);
  document.addEventListener('crossz-ads-ready',publish);
  const initialRevision=revision;
  const ready=readPreferences(area).then(preferences=>{
    if(revision===initialRevision)apply(preferences.adBlockingEnabled);
  }).catch(()=>{});
  return {
    ready,
    stop(){
      stopped=true;
      area.onChanged.removeListener(onChanged);
      document.removeEventListener('crossz-ads-ready',publish);
      ads.stop();
    },
  };
}
