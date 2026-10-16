const notReady=()=>Object.assign(new Error('Video chưa sẵn sàng. Hãy mở một video YouTube rồi thử lại.'),{code:'PLAYER_NOT_READY'});
export function createAmbientAdapter(getInstance) {
  return {
    getEnabled(){return getInstance()?.settings?.enabled ?? null;},
    async setEnabled(enabled) {
      const instance=getInstance();
      if(!instance?.initializedTime || instance.pendingStart)throw notReady();
      if(instance.settings.enabled!==enabled)await instance.toggleEnabled(enabled);
      if(instance.settings.enabled!==enabled)throw notReady();
    },
    async openSettings() {
      const instance=getInstance();
      const usable=element=>!!element?.isConnected && element.getClientRects().length>0;
      const menu=instance?.settings?.menuElem;
      if(!instance?.initializedTime || !instance.isOnVideoPage || !usable(instance.videoElem) || !usable(instance.videoPlayerElem) || !menu?.isConnected)throw notReady();
      await instance.settings.onSettingsBtnClicked();
      if(!instance.isOnVideoPage || !usable(menu) || !menu.classList.contains('is-visible'))throw notReady();
    },
  };
}
