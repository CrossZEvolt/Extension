const AD_SLOTS='ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-in-feed-ad-layout-renderer,ytd-rich-item-renderer:has(ytd-ad-slot-renderer),ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),.video-ads .ytp-ad-overlay-container';
const SKIP='.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button';
const AD_PLAYERS='.html5-video-player.ad-showing,.html5-video-player.ad-interrupting';
const OWNED='data-crossz-ad-hidden';
export function createAdController({document,requestFrame,cancelFrame}) {
  let observer=null,frame=null;
  const marked=new Set(),clicked=new Set();
  function available(button) {
    const style=document.defaultView.getComputedStyle(button);
    return !button.disabled && button.getAttribute('aria-disabled')!=='true' && button.getClientRects().length>0 && style.visibility!=='hidden' && style.visibility!=='collapse' && style.display!=='none';
  }
  function scan() {
    frame=null;
    for(const element of document.querySelectorAll(AD_SLOTS)) {
      if(!element.hasAttribute(OWNED)){element.setAttribute(OWNED,'');marked.add(element);}
    }
    const players=document.querySelectorAll(AD_PLAYERS);
    for(const button of clicked) {
      if(!button.isConnected || !button.closest(AD_PLAYERS) || !available(button))clicked.delete(button);
    }
    for(const player of players)for(const button of player.querySelectorAll(SKIP)) {
      if(clicked.has(button) || !available(button))continue;
      clicked.add(button);button.click();
    }
    for(const element of marked) {
      if(!element.isConnected || !element.matches(AD_SLOTS)) {
        element.removeAttribute(OWNED);marked.delete(element);
      }
    }
  }
  const schedule=()=>{if(frame===null)frame=requestFrame(scan);};
  return {
    start(){
      if(observer)return;
      observer=new document.defaultView.MutationObserver(schedule);
      observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','disabled','aria-disabled']});
      document.addEventListener('yt-navigate-finish',schedule);schedule();
    },
    stop(){
      observer?.disconnect();observer=null;document.removeEventListener('yt-navigate-finish',schedule);
      if(frame!==null)cancelFrame(frame);frame=null;
      for(const element of marked)element.removeAttribute(OWNED);marked.clear();clicked.clear();
    },
  };
}
