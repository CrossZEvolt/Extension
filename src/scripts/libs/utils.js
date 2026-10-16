export const getBrowser=()=>{
 const ua=globalThis.navigator?.userAgent || '';
 if(ua.includes('Firefox')) return 'Firefox';
 if(ua.includes('Edg')) return 'Edge';
 if(ua.includes('OPR')) return 'Opera';
 return 'Chrome';
};
export const getVersion=()=>chrome.runtime.getManifest().version;
export const getFeedbackFormLink=()=> 'https://github.com/CrossZEvolt/Extension/issues';
export const getPrivacyPolicyLink=()=>chrome.runtime.getURL('privacy.html');
