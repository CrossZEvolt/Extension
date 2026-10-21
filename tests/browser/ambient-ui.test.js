import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchFixture,loadPlayer,loadAmbient,canOpenOriginalSettings} from '../helpers/browser.js';

async function openStudio() {
  const app=await launchFixture();
  try {
    await loadPlayer(app.context,app.page);
    await loadAmbient(app.page);
    await canOpenOriginalSettings(app.page);
    return app;
  } catch(error) {await app.close();throw error;}
}

test('Light Studio navigation reaches a localized control and changes the live renderer',async()=>{
  const app=await openStudio();
  try {
    assert.equal(await app.page.getByRole('heading',{name:'Light Studio',exact:true}).count(),1);
    await app.page.getByRole('button',{name:'Màu sắc',exact:true}).click();
    const slider=app.page.getByRole('slider',{name:'Độ sáng',exact:true}).first();
    await slider.waitFor({state:'visible'});
    await slider.focus();
    await slider.press('ArrowRight');
    await app.page.waitForFunction(()=>window.ambientlight.settings.brightness===101);
    assert.equal(await app.page.locator('#setting-brightness-value').textContent(),'101%');
    await app.page.getByRole('button',{name:'Đóng bảng ánh sáng',exact:true}).click();
    await app.page.waitForFunction(()=>!document.querySelector('.crossz-ambient-panel').classList.contains('is-visible'));
    assert.equal(await app.page.locator('.ytp-ambientlight-settings-button').getAttribute('aria-expanded'),'false');
  } finally {await app.close();}
});

test('keyboard controls preserve advanced settings and Escape closes without losing values',async()=>{
  const app=await openStudio();
  try {
    const section=app.page.locator('[data-name="sectionSettingsCollapsed"]');
    await section.focus();await section.press('Enter');
    await app.page.waitForFunction(()=>document.querySelector('[data-name="sectionSettingsCollapsed"]').getAttribute('aria-expanded')==='true');
    const advanced=app.page.locator('#setting-advancedSettings');
    await advanced.waitFor({state:'visible'});await advanced.focus();await advanced.press('Space');
    await app.page.waitForFunction(()=>window.ambientlight.settings.advancedSettings===true);
    await app.page.getByRole('button',{name:'Hiệu năng',exact:true}).click();
    await app.page.getByRole('slider',{name:'Giới hạn FPS',exact:true}).focus();
    await app.page.keyboard.press('Escape');
    await app.page.waitForFunction(()=>!document.querySelector('.crossz-ambient-panel').classList.contains('is-visible'));
    assert.equal(await app.page.locator('.ytp-ambientlight-settings-button').evaluate(element=>document.activeElement===element),true);
    await canOpenOriginalSettings(app.page);
    assert.equal(await app.page.evaluate(()=>window.ambientlight.settings.advancedSettings),true);
  } finally {await app.close();}
});

test('Light Studio stays inside a narrow player and preserves every setting identity',async()=>{
  const app=await openStudio();
  try {
    assert.equal(await app.page.locator('.crossz-ambient-panel').count(),1);
    await app.page.setViewportSize({width:390,height:740});
    await app.page.addStyleTag({content:'#player-container-inner,#movie_player,.html5-video-container,video{width:360px!important}'});
    await app.page.evaluate(()=>document.querySelector('#movie_player').classList.add('ytp-big-mode','ytp-delhi-modern'));
    const bounds=await app.page.evaluate(()=>{
      const panel=document.querySelector('.crossz-ambient-panel'),player=document.querySelector('#movie_player');
      const p=panel.getBoundingClientRect(),v=player.getBoundingClientRect();
      return {left:p.left,right:p.right,playerLeft:v.left,playerRight:v.right,overflow:panel.scrollWidth-panel.clientWidth,height:p.height,playerHeight:v.height,
        sectionAdjacency:[...panel.querySelectorAll('.ytpa-section')].every(section=>section.nextElementSibling.classList.contains('ytpa-section-content')),
        ids:[...panel.querySelectorAll('[id^="setting-"]')].map(element=>element.id)};
    });
    assert.ok(bounds.left>=bounds.playerLeft && bounds.right<=bounds.playerRight);
    assert.ok(bounds.overflow<=1);
    assert.ok(bounds.height<bounds.playerHeight);
    assert.equal(bounds.sectionAdjacency,true);
    assert.equal(bounds.ids.length,new Set(bounds.ids).size);
    for(const id of ['setting-enabled','setting-blur2-range','setting-spread-range','setting-enableInVRVideos','setting-frameSync-range'])assert.ok(bounds.ids.includes(id),id);
  } finally {await app.close();}
});

test('Escape in the hotkey editor changes the shortcut without closing the studio',async()=>{
  const app=await openStudio();
  try {
    await app.page.getByRole('button',{name:'Chung',exact:true}).click();
    const hotkey=app.page.locator('#setting-enabled .ytpa-menuitem-key');
    await hotkey.focus();await hotkey.press('Escape');
    assert.equal(await app.page.locator('.crossz-ambient-panel').evaluate(element=>element.classList.contains('is-visible')),true);
    assert.equal(await hotkey.textContent(),' ');
    assert.equal(await app.page.evaluate(()=>window.ambientlight.settings.enabled),true);
  } finally {await app.close();}
});

test('Escape cancels an unfinished manual value and closes Light Studio',async()=>{
  const app=await openStudio();
  try {
    await app.page.getByRole('button',{name:'Màu sắc',exact:true}).click();
    const input=app.page.locator('#setting-brightness-manualinput');
    await input.fill('145');await input.press('Escape');
    assert.equal(await app.page.locator('.crossz-ambient-panel').getAttribute('class').then(value=>value.includes('fade-out') || !value.includes('is-visible')),true);
    assert.equal(await app.page.evaluate(()=>window.ambientlight.settings.brightness),100);
    assert.equal(await app.page.locator('.ytp-ambientlight-settings-button').evaluate(element=>document.activeElement===element),true);
  } finally {await app.close();}
});
