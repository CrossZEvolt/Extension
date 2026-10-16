// Compatibility API for the upstream renderer; no network transport.
import {recordLocalError} from './local-reporter.js';
export const parseSettingsToSentry=()=>{};
export const setVersion=()=>{};
export let crashOptions={video:false,technical:false,crash:true};
export const setCrashOptions=value=>{crashOptions={...value,video:false,technical:false};};
export default class LocalErrorReporter {
  static async captureException(error) {try {await recordLocalError(error);} catch { /* Extension may have reloaded. */ }}
}
