// These fields describe player advertising, separate from streamingData.
// Filter only YouTube player configurations; never block media URLs or patch JSON.parse.
const AD_FIELDS=['playerAds','adPlacements','adSlots'];

function inheritedDescriptor(target,property) {
  for(let owner=target;owner;owner=Object.getPrototypeOf(owner)) {
    const descriptor=Object.getOwnPropertyDescriptor(owner,property);
    if(descriptor)return {owner,descriptor};
  }
}

function prunePlayer(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  let changed=false;
  for(const key of AD_FIELDS) {
    if(Object.getOwnPropertyDescriptor(value,key)?.configurable) {
      delete value[key];changed=true;
    }
  }
  const nested=value.playerResponse;
  if(nested && typeof nested==='object' && nested!==value) {
    for(const key of AD_FIELDS) {
      if(Object.getOwnPropertyDescriptor(nested,key)?.configurable) {
        delete nested[key];changed=true;
      }
    }
  }
  return changed;
}

export function installPlayerAdFilter(scope=window) {
  if(scope.location.origin!=='https://www.youtube.com')return;
  const installed=Symbol.for('crossz.player-ad-filter');
  if(scope[installed])return;
  Object.defineProperty(scope,installed,{value:true});
  // The isolated script confirms saved preferences. Until then, leave page data alone.
  let enabled=false;
  const isPlayerURL=url=>{
    try {
      const parsed=new URL(url,scope.location.href);
      return parsed.origin==='https://www.youtube.com' && parsed.pathname==='/youtubei/v1/player';
    } catch {return false;}
  };
  const filterValue=value=>{
    if(enabled)try{prunePlayer(value);}catch{/* Preserve playback on unfamiliar shapes. */}
    return value;
  };
  const filterText=text=>{
    if(!enabled || typeof text!=='string')return text;
    try {
      const prefix=text.startsWith(")]}'\n")?")]}'\n":'';
      const value=JSON.parse(text.slice(prefix.length));
      return prunePlayer(value)?prefix+JSON.stringify(value):text;
    } catch {return text;}
  };

  for(const key of ['ytInitialPlayerResponse','playerResponse']) {
    const descriptor=Object.getOwnPropertyDescriptor(scope,key);
    if(descriptor && (!descriptor.configurable || descriptor.get || descriptor.set || descriptor.writable===false))continue;
    let value=descriptor?.value;
    Object.defineProperty(scope,key,{
      configurable:true,enumerable:descriptor?.enumerable ?? true,
      get:()=>filterValue(value),set:next=>{value=filterValue(next);},
    });
  }

  // Keep native fetch/Response objects, body consumption, cloning and metadata.
  // Only the JSON/text consumers of the specific player endpoint are changed.
  for(const method of ['json','text']) {
    const prototype=scope.Response?.prototype;
    // Native fetch still returns intrinsic Response objects when window.Response is subclassed.
    const {owner,descriptor}=inheritedDescriptor(prototype,method) || {};
    if(typeof descriptor?.value!=='function')continue;
    const original=descriptor.value;
    try {
      Object.defineProperty(owner,method,{...descriptor,value:function(...args) {
        const selected=isPlayerURL(this.url) && this.ok;
        return Reflect.apply(original,this,args).then(value=>selected?(method==='json'?filterValue(value):filterText(value)):value);
      }});
    } catch { /* A locked browser/page wrapper must not prevent the remaining filters. */ }
  }

  const textCache=new WeakMap();
  for(const property of ['responseText','response']) {
    const prototype=scope.XMLHttpRequest?.prototype;
    const {descriptor}=inheritedDescriptor(prototype,property) || {};
    if(typeof descriptor?.get!=='function')continue;
    const original=descriptor.get;
    try {
      Object.defineProperty(prototype,property,{...descriptor,get:function() {
        const value=Reflect.apply(original,this,[]);
        if(!enabled || this.readyState!==4 || this.status<200 || this.status>=300 || !isPlayerURL(this.responseURL))return value;
        if(property==='response' && this.responseType==='json')return filterValue(value);
        if(typeof value!=='string' || !['','text'].includes(this.responseType))return value;
        const cached=textCache.get(this);
        if(cached?.original===value)return cached.filtered;
        const filtered=filterText(value);
        textCache.set(this,{original:value,filtered});return filtered;
      }});
    } catch { /* Keep unsupported XHR wrappers intact and still connect the settings bridge. */ }
  }

  scope.document.addEventListener('crossz-ads-state',event=>{
    if(typeof event.detail!=='boolean')return;
    enabled=event.detail;
    if(enabled)for(const key of ['ytInitialPlayerResponse','playerResponse']) {
      try{filterValue(scope[key]);}catch{}
    }
  });
  scope.document.dispatchEvent(new scope.Event('crossz-ads-ready'));
}
