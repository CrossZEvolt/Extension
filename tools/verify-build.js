import {readFile,access,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function verifyBuild(distDir='dist') {
  const root=resolve(distDir);
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  if(manifest.manifest_version!==3 || manifest.version!==version) throw new Error('Invalid release manifest');
  const refs=[manifest.background?.service_worker,manifest.action?.default_popup,manifest.options_ui?.page,...Object.values(manifest.icons || {})];
  // Persistent registrations select these files at runtime, so they are absent from static entries.
  refs.push('scripts/ads-main.js','scripts/ads-main-disabled.js');
  for(const item of manifest.content_scripts || []) refs.push(...item.js || [],...item.css || []);
  for(const item of manifest.web_accessible_resources || []) refs.push(...item.resources);
  for(const item of manifest.declarative_net_request?.rule_resources || []) refs.push(item.path);
  for(const path of refs.filter(Boolean)) await access(join(root,path));
  async function visit(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,item.name);
      if(item.isDirectory()){await visit(path);continue;}
      if(item.name.endsWith('.html')) {
        const html=await readFile(path,'utf8');
        for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
          if(/^(https?:|#|data:)/.test(match[1])) continue;
          await access(resolve(dir,match[1]));
        }
        if(/<script[^>]+src=["']https?:/.test(html)) throw new Error('Remote executable resource');
      }
      if(item.name.endsWith('.js')) {
        const script=await readFile(path,'utf8');
        if(/ingest\.(?:us\.)?sentry\.io|docs\.google\.com\/forms/.test(script)) throw new Error('Upstream reporting endpoint remains');
      }
    }
  }
  await visit(root);
  return manifest;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  await verifyBuild(process.argv[2] || 'dist');
  console.log('Build resources and MV3 manifest verified.');
}
