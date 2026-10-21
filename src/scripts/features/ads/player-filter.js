// These fields describe player advertising, separate from streamingData.
// Filter only YouTube player configurations; never block media URLs or patch JSON.parse.
const AD_FIELDS=['playerAds','adPlacements','adSlots'];
const PLAYER_PATHS=new Set(['/youtubei/v1/player','/youtubei/v1/playlist','/youtubei/v1/get_watch']);
const SHORTS_PATHS=new Set(['/youtubei/v1/reel_watch_sequence','/youtubei/v1/reel/reel_watch_sequence']);

function inheritedDescriptor(target,property) {
  for(let owner=target;owner;owner=Object.getPrototypeOf(owner)) {
    const descriptor=Object.getOwnPropertyDescriptor(owner,property);
    if(descriptor)return {owner,descriptor};
  }
}

function pruneFields(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  let changed=false;
  for(const key of AD_FIELDS) {
    if(Object.getOwnPropertyDescriptor(value,key)?.configurable) {
      delete value[key];changed=true;
    }
  }
  return changed;
}

function prunePlayer(value) {
  if(!value || typeof value!=='object')return false;
  let changed=Array.isArray(value)?false:pruneFields(value);
  // These are known player envelopes, not a recursive search for similarly named keys.
  for(const envelope of Array.isArray(value)?value:[value]) {
    const nested=envelope?.playerResponse;
    if(nested && nested!==envelope)changed=pruneFields(nested) || changed;
  }
  return changed;
}

function pruneShorts(value) {
  let changed=false;
  for(const envelope of [value,value?.reelWatchSequenceResponse]) {
    const entries=envelope?.entries;
    if(!Array.isArray(entries))continue;
    for(let index=entries.length-1;index>=0;index--) {
      if(entries[index]?.command?.reelWatchEndpoint?.adClientParams?.isAd===true) {
        entries.splice(index,1);changed=true;
      }
    }
  }
  return changed;
}

export function installPlayerAdFilter(scope=window,{initialEnabled=false}={}) {
  if(scope.location.origin!=='https://www.youtube.com')return;
  const installed=Symbol.for('crossz.player-ad-filter');
  if(scope[installed])return;
  Object.defineProperty(scope,installed,{value:true});
  // The registered MAIN entry carries the saved choice before any page script can consume ads.
  let enabled=initialEnabled===true;
  const responseKind=url=>{
    if(typeof url!=='string' || url==='')return null;
    try {
      const parsed=new URL(url,scope.location.href);
      if(parsed.origin!=='https://www.youtube.com')return null;
      if(parsed.pathname==='/playlist' && parsed.searchParams.has('list'))return 'player';
      return PLAYER_PATHS.has(parsed.pathname)?'player':SHORTS_PATHS.has(parsed.pathname)?'shorts':null;
    } catch {return null;}
  };
  const prune=(value,kind)=>{
    const changed=prunePlayer(value);
    return kind==='shorts'?(pruneShorts(value) || changed):changed;
  };
  const filterValue=(value,kind='player')=>{
    if(enabled)try{prune(value,kind);}catch{/* Preserve playback on unfamiliar shapes. */}
    return value;
  };
  const filterText=(text,kind='player')=>{
    if(!enabled || typeof text!=='string')return text;
    try {
      const prefix=text.match(/^\)\]\}'(?:\r?\n)?/)?.[0] || '';
      const value=JSON.parse(text.slice(prefix.length));
      return prune(value,kind)?prefix+JSON.stringify(value):text;
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

  // Filter the selected response body before fetch resolves, including streaming/byte consumers.
  // Capture native consumers before installing the compatibility method hooks below.
  const originalText=inheritedDescriptor(scope.Response?.prototype,'text')?.descriptor.value;
  const originalClone=inheritedDescriptor(scope.Response?.prototype,'clone')?.descriptor.value;
  const ResponseConstructor=scope.Response,HeadersConstructor=scope.Headers;
  if(typeof scope.fetch==='function' && typeof originalText==='function' && typeof originalClone==='function' && typeof ResponseConstructor==='function' && typeof HeadersConstructor==='function') {
    const replacement=(original,text,headers)=>{
      const bytes=new TextEncoder().encode(text),branches=new Set();
      let reader=null,failure=null;
      const finish=branch=>{
        branches.delete(branch);
        if(branches.size===0 && reader)void reader.cancel().catch(()=>{});
      };
      const create=(branchHeaders=headers)=>{
        const branch={controller:null};
        const stream=new ReadableStream({
          start(controller){branch.controller=controller;if(failure)controller.error(failure);else branches.add(branch);},
          async pull(controller) {
            // Let a native abort settle before handing buffered bytes to a new consumer.
            await Promise.resolve();
            if(failure){controller.error(failure);finish(branch);return;}
            if(!branches.has(branch))return;
            controller.enqueue(bytes.slice());controller.close();finish(branch);
          },
          cancel(){finish(branch);},
        },{highWaterMark:0});
        const response=new ResponseConstructor(stream,{status:original.status,statusText:original.statusText,headers:branchHeaders});
        Object.defineProperties(response,{
          url:{value:original.url,configurable:true},
          type:{value:original.type,configurable:true},
          redirected:{value:original.redirected,configurable:true},
          clone:{configurable:true,writable:true,value:function() {
            if(this!==response)return Reflect.apply(originalClone,this,[]);
            if(this.bodyUsed || this.body?.locked)throw new TypeError('Response body is already used or locked.');
            return create(this.headers);
          }},
        });
        for(const method of ['json','text','arrayBuffer','blob','bytes']) {
          const consume=response[method];
          if(typeof consume!=='function')continue;
          Object.defineProperty(response,method,{configurable:true,writable:true,value:function(...args) {
            const unavailable=this===response && (this.bodyUsed || this.body?.locked);
            const pending=Reflect.apply(consume,this,args);
            if(this!==response || unavailable)return pending;
            // Chromium maps custom-stream failures to TypeError; retain the native abort reason.
            return pending.catch(error=>{throw failure || error;});
          }});
        }
        return response;
      };
      const response=create();
      // Observe native aborts without reading Request/init getters a second time.
      reader=original.body.getReader();
      void reader.closed.then(()=>{},error=>{
        failure=error;
        for(const branch of branches)branch.controller.error(error);
        branches.clear();
      }).finally(()=>{reader.releaseLock();reader=null;});
      return response;
    };
    const transform=async response=>{
      const kind=responseKind(response.url);
      if(!enabled || !kind || !response.ok)return response;
      try {
        const copy=Reflect.apply(originalClone,response,[]);
        const text=await Reflect.apply(originalText,copy,[]);
        const filtered=filterText(text,kind);
        if(filtered===text)return response;
        const headers=new HeadersConstructor(response.headers);
        // The replacement is decoded UTF-8; origin wire encoding/length no longer describe its body.
        headers.delete('content-length');headers.delete('content-encoding');
        return replacement(response,filtered,headers);
      } catch {return response;}
    };
    try {
      const descriptor=Object.getOwnPropertyDescriptor(scope,'fetch');
      Object.defineProperty(scope,'fetch',{configurable:true,writable:true,enumerable:true,...descriptor,value:new Proxy(scope.fetch,{
        apply:(target,receiver,args)=>Reflect.apply(target,receiver,args).then(transform),
      })});
    } catch { /* Keep locked API wrappers usable; method consumers below can still be filtered. */ }
  }

  // Keep fallback consumers for Response objects created outside the fetch wrapper.
  for(const method of ['json','text']) {
    const prototype=scope.Response?.prototype;
    // Native fetch still returns intrinsic Response objects when window.Response is subclassed.
    const {owner,descriptor}=inheritedDescriptor(prototype,method) || {};
    if(typeof descriptor?.value!=='function')continue;
    const original=descriptor.value;
    try {
      Object.defineProperty(owner,method,{...descriptor,value:function(...args) {
        const kind=responseKind(this.url);
        return Reflect.apply(original,this,args).then(value=>kind && this.ok?(method==='json'?filterValue(value,kind):filterText(value,kind)):value);
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
        const kind=responseKind(this.responseURL);
        if(!enabled || this.readyState!==4 || this.status<200 || this.status>=300 || !kind)return value;
        if(property==='response' && this.responseType==='json')return filterValue(value,kind);
        if(typeof value!=='string' || !['','text'].includes(this.responseType))return value;
        const cached=textCache.get(this);
        if(cached?.original===value)return cached.filtered;
        const filtered=filterText(value,kind);
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
