import { installWorker } from './features/worker.js';
import { createAudioCoordinator } from './features/audio/coordinator.js';
const audio=createAudioCoordinator();
installWorker(chrome,{audio});
chrome.tabs.onRemoved.addListener(tabId=>{audio.stop(tabId).catch(()=>{});});
chrome.tabs.onUpdated.addListener(async(tabId,changes)=>{
 if(!changes.url && changes.status!=='loading')return;
 try{const tab=await chrome.tabs.get(tabId);if(!tab.url || new URL(tab.url).origin!=='https://www.youtube.com')await audio.stop(tabId);}catch{await audio.stop(tabId).catch(()=>{});}
});
chrome.tabCapture.onStatusChanged.addListener(info=>{if(['stopped','error'].includes(info.status))audio.stop(info.tabId).catch(()=>{});});
