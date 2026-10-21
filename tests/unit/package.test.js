import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,cp,writeFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);
test('ZIP contains the selected fresh build, attribution and no development files',async()=>{
 const {packageExtension}=await import('../../tools/package.js');const dir=await mkdtemp(join(tmpdir(),'crossz-package-'));
 try{
  const distDir=join(dir,'dist'),outputFile=join(dir,'release.zip');await cp('dist',distDir,{recursive:true});await writeFile(join(distDir,'selected-target.txt'),'current-run');
  const started=Date.now();await packageExtension({distDir,outputFile});
  const entries=(await exec('unzip',['-Z1',outputFile])).stdout.split('\n');
  assert.ok(entries.includes('manifest.json'));assert.ok(entries.includes('LICENSE'));assert.ok(entries.includes('THIRD_PARTY_NOTICES.md'));assert.ok(entries.includes('selected-target.txt'));
  assert.ok(entries.includes('models/fsrcnn-small-x2.json'));assert.ok(entries.includes('models/fsrcnn-small-x3.json'));assert.ok(entries.includes('models/LICENSE-FSRCNN.txt'));
  assert.ok(entries.includes('scripts/ads-main.js'));assert.ok(entries.includes('scripts/ads-main-disabled.js'));
  assert.ok(entries.every(p=>!/(^|\/)(\.env|\.git|node_modules|src\/|tests\/)|\.map$/.test(p)));
  assert.ok((await stat(outputFile)).mtimeMs>=started-1000);
  await rm(join(distDir,'selected-target.txt'));await packageExtension({distDir,outputFile});
  assert.ok(!(await exec('unzip',['-Z1',outputFile])).stdout.includes('selected-target.txt'));
  await writeFile(join(distDir,'.env'),'test fixture, not a secret');await assert.rejects(packageExtension({distDir,outputFile}),/Forbidden/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
