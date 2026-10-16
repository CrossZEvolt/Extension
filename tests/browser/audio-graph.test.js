import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {launchFixture,loadPlayer} from '../helpers/browser.js';
test('production audio graph measures 1x to 5x gain and reduces loud peaks',async()=>{
 const a=await launchFixture();try{
 await a.context.route('https://www.youtube.com/__modules/**',async route=>{const path=new URL(route.request().url()).pathname.replace('/__modules/','');await route.fulfill({contentType:'text/javascript',body:await readFile(resolve('src/scripts/features',path))});});
 await loadPlayer(a.context,a.page);
 const results=await a.page.evaluate(async()=>{
  const {createAudioGraph}=await import('/__modules/audio/graph.js');
  async function render(percent,amplitude){const ctx=new OfflineAudioContext(1,48000,48000),osc=ctx.createOscillator(),level=ctx.createGain();level.gain.value=amplitude;osc.connect(level);createAudioGraph({context:ctx,source:level,percent});osc.start();const samples=(await ctx.startRendering()).getChannelData(0).slice(24000);return {rms:Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length),peak:Math.max(...samples.map(Math.abs))};}
  return {small:await Promise.all([100,150,500].map(p=>render(p,0.01))),loud:await render(500,0.8)};
 });
 const [base,oneHalf,five]=results.small;assert.ok(Math.abs(oneHalf.rms/base.rms-1.5)<0.03);assert.ok(Math.abs(five.rms/base.rms-5)<0.1);assert.ok(results.loud.peak<4);
 }finally{await a.close();}
});
