import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const {version}=JSON.parse(readFileSync('package.json','utf8'));
const manifest=JSON.parse(readFileSync('src/manifest.json','utf8'));
manifest.version=version;
mkdirSync('dist',{recursive:true});
writeFileSync('dist/manifest.json',JSON.stringify(manifest,null,2)+'\n');
