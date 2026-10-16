const AD_SLOTS='ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,.video-ads .ytp-ad-overlay-container';
const SKIP='.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button';
const OWNED='data-crossz-ad-hidden';
export function createAdController({document,requestFrame,cancelFrame}) {
  let observer=null,frame=null,clicked=new WeakSet();
  const marked=new Set();
  function scan() {
    frame=null;
    for(const element of document.querySelectorAll(AD_SLOTS)) {
      if(!element.hasAttribute(OWNED)){element.setAttribute(OWNED,'');marked.add(element);}
    }
    const players=document.querySelectorAll('.html5-video-player.ad-showing,.html5-video-player.ad-interrupting');
    if(!players.length)clicked=new WeakSet();
    for(const player of players)for(const button of player.querySelectorAll(SKIP)) {
      const style=document.defaultView.getComputedStyle(button);
      if(clicked.has(button) || button.disabled || button.getAttribute('aria-disabled')==='true' || !button.getClientRects().length || style.visibility==='hidden' || style.display==='none')continue;
      clicked.add(button);button.click();
    }
    for(const element of marked)if(!element.isConnected)marked.delete(element);
  }
  const schedule=()=>{if(frame===null)frame=requestFrame(scan);};
  return {
    start(){
      if(observer)return;
      observer=new document.defaultView.MutationObserver(schedule);
      observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','disabled','aria-disabled']});
      document.addEventListener('yt-navigate-finish',schedule);schedule();
    },
    stop(){
      observer?.disconnect();observer=null;document.removeEventListener('yt-navigate-finish',schedule);
      if(frame!==null)cancelFrame(frame);frame=null;
      for(const element of marked)element.removeAttribute(OWNED);marked.clear();clicked=new WeakSet();
    },
  };
}
