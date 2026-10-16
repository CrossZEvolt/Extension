export const PREFERENCES_KEY='crossz-preferences-v1';
const defaults={schemaVersion:1,adBlockingEnabled:true};
export function parseImportedPreferences(json) {
  const value=JSON.parse(json);
  if(!value || Array.isArray(value) || value.schemaVersion!==1 || typeof value.adBlockingEnabled!=='boolean' || Object.keys(value).some(k=>!['schemaVersion','adBlockingEnabled'].includes(k))) throw new Error('Cấu hình CrossZ không hợp lệ.');
  return {schemaVersion:1,adBlockingEnabled:value.adBlockingEnabled};
}
export async function readPreferences(area=chrome.storage.local) {
  const value=(await area.get(PREFERENCES_KEY))[PREFERENCES_KEY];
  try{return value?parseImportedPreferences(JSON.stringify(value)):{...defaults};}catch{return {...defaults};}
}
export async function writePreferences(value,area=chrome.storage.local) {
  await area.set({[PREFERENCES_KEY]:parseImportedPreferences(JSON.stringify(value))});
}
export function validateAmbientImport(input,config) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid Ambient configuration');
  const result={};
  for(const [raw,value] of Object.entries(input)) {
    const name=raw==='blur'?'blur2':raw,hotkey=name.endsWith('-key');
    const item=config.find(s=>s.name===(hotkey?name.slice(0,-4):name));
    if(!item)throw new Error(`Unknown Ambient setting: ${name}`);
    if(hotkey) {
      if(item.defaultKey===undefined || typeof value!=='string' || value.length!==1 || value.toUpperCase().length!==1)throw new Error(`Invalid shortcut: ${name}`);
    }
    else if(['checkbox','section'].includes(item.type)) {if(typeof value!=='boolean')throw new Error(`Invalid boolean: ${name}`);}
    else if(item.type==='list') {
      const min=item.min ?? (item.valuePoints?Math.min(...item.valuePoints):0),max=item.max ?? (item.valuePoints?Math.max(...item.valuePoints):Infinity);
      if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max)throw new Error(`Out of range: ${name}`);
      if(item.valuePoints && item.manualinput===false && !item.valuePoints.includes(value))throw new Error(`Invalid value: ${name}`);
      if(item.step>0) {
        const steps=(value-min)/item.step;
        if(Math.abs(steps-Math.round(steps))>1e-7)throw new Error(`Invalid step: ${name}`);
      }
    } else throw new Error(`Unsupported setting: ${name}`);
    result[`setting-${name}`]=hotkey?value.toUpperCase():value;
  }
  if(!Object.keys(result).length)throw new Error('No settings to import');
  return result;
}

export function exportAmbientSettings(stored,config) {
  const output={};
  for(const [key,value] of Object.entries(stored)) {
    if(!key.startsWith('setting-'))continue;
    const name=key.slice('setting-'.length);
    if(config.some(item=>item.name===name || (item.defaultKey!==undefined && `${item.name}-key`===name)))output[name]=value;
  }
  return output;
}
