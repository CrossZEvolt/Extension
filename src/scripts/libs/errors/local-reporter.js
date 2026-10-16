const KEY='crossz-local-errors';
export function createLocalReporter({read,write}) {
  let pending=Promise.resolve();
  return {
    record(error) {
      const entry={time:new Date().toISOString(),name:String(error?.name || 'Error').slice(0,80),message:String(error?.message || error).replace(/(?:https?:|chrome-extension:|blob:)[^\s)]+/g,'[URL]').replace(/(?:streamId|chromeMediaSourceId)[=: ]+\S+/gi,'[stream]').slice(0,1000)};
      pending=pending.catch(()=>{}).then(async()=>{const previous=await read();await write([...(Array.isArray(previous)?previous:[]),entry].slice(-100));});
      return pending;
    },
    async export(){await pending;return JSON.stringify(await read(),null,2);},
  };
}
const reporter=createLocalReporter({
  read:async()=> (await chrome.storage.local.get(KEY))[KEY] || [],
  write:async entries=>{await chrome.storage.local.set({[KEY]:entries});},
});
export const recordLocalError=error=>reporter.record(error);
export const exportLocalErrors=()=>reporter.export();
