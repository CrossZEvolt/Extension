import {mkdtemp,readdir,mkdir,rename,rm,access,readFile} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {verifyBuild} from './verify-build.js';
const exec=promisify(execFile);
export async function packageExtension({distDir,outputFile}) {
  const root=resolve(distDir),output=resolve(outputFile);
  if(!relative(root,output).startsWith('..'))throw new Error('Archive must be outside dist');
  await verifyBuild(root);
  for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await access(join(root,file));
  async function inspect(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      if(item.isSymbolicLink() || /^(?:\.env|\.git|node_modules$|src$|tests$)/.test(item.name))throw new Error(`Forbidden package entry: ${item.name}`);
      if(item.isDirectory())await inspect(join(dir,item.name));
    }
  }
  await inspect(root);await mkdir(dirname(output),{recursive:true});
  const staging=await mkdtemp(join(tmpdir(),'crossz-zip-'));
  try {
    const archive=join(staging,'release.zip');
    await exec('zip',['-q','-X','-r',archive,'.','-x','*.map'],{cwd:root});
    // Copy via a same-directory temporary file so replacement also works across filesystems.
    const {copyFile}=await import('node:fs/promises');
    const pending=output+'.pending';
    try{await copyFile(archive,pending);await rename(pending,output);}finally{await rm(pending,{force:true});}
  }finally{await rm(staging,{recursive:true,force:true});}
  return output;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  console.log(await packageExtension({distDir:'dist',outputFile:`artifacts/crossz-youtube-enhancer-${version}.zip`}));
}
