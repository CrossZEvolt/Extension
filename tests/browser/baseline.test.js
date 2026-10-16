import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension,launchFixture,loadPlayer,canOpenOriginalSettings} from '../helpers/browser.js';

test('unpacked extension installation',async t=>{
  let app;
  try {app=await launchExtension();}catch(error){if(error.code==='EXTENSIONS_BLOCKED'){t.skip('Managed browser policy prohibits unpacked extensions');return;}throw error;}
  try{assert.ok(app.extensionId);}finally{await app.close();}
});

test('production Ambient renderer component draws video and opens settings',async()=>{
  const app=await launchFixture();
  try {
    await loadPlayer(app.context,app.page);
    await app.page.addScriptTag({path:'dist/scripts/content.js'});
    await app.page.locator('.ambientlight').waitFor({timeout:20000});
    assert.equal(await canOpenOriginalSettings(app.page),true);
    assert.ok(await app.page.locator('.ambientlight canvas').count()>0);
    await app.page.waitForFunction(()=>[...document.querySelectorAll('.ambientlight canvas')].some(c=>c.getContext('2d')?.getImageData(10,10,1,1).data[0]>200));
    await app.page.evaluate(()=>{window.fixtureColor='#2050ff';});
    await app.page.waitForFunction(()=>[...document.querySelectorAll('.ambientlight canvas')].some(c=>{const p=c.getContext('2d')?.getImageData(10,10,1,1).data;return p?.[2]>200 && p[0]<100;}));
  } finally {await app.close();}
});
