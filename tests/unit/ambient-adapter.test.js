import {test} from 'node:test';import assert from 'node:assert/strict';
test('ambient controls call live renderer and reject an unready player',async()=>{
 const {createAmbientAdapter}=await import('../../src/scripts/features/ambient/adapter.js');
 let instance=null,opened=0;
 const a=createAmbientAdapter(()=>instance);
 await assert.rejects(a.openSettings(),{code:'PLAYER_NOT_READY'});
 instance={initializedTime:1,settings:{enabled:true,menuElem:{},onSettingsBtnClicked:async()=>{opened++;}},toggleEnabled:async v=>{instance.settings.enabled=v;}};
 await a.setEnabled(false);assert.equal(a.getEnabled(),false);
 await a.openSettings();assert.equal(opened,1);
});
