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
      if(!instance?.initializedTime || !instance.settings?.menuElem)throw notReady();
      await instance.settings.onSettingsBtnClicked();
    },
  };
}
