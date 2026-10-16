import {test} from 'node:test';import assert from 'node:assert/strict';
test('invalid configuration is rejected atomically without accepting capture state',async()=>{
 const {parseImportedPreferences,validateAmbientImport}=await import('../../src/scripts/features/shared/preferences.js');
 for(const value of ['null','[]','{"schemaVersion":1,"adBlockingEnabled":"yes"}','{"schemaVersion":1,"adBlockingEnabled":true,"audio":500}','{"__proto__":{}}']) assert.throws(()=>parseImportedPreferences(value));
 assert.deepEqual(parseImportedPreferences('{"schemaVersion":1,"adBlockingEnabled":false}'),{schemaVersion:1,adBlockingEnabled:false});
 const config=[{name:'enabled',type:'checkbox'},{name:'blur2',type:'list',min:0,max:100,step:1}];
 assert.deepEqual(validateAmbientImport({enabled:true,blur:20},config),{'setting-enabled':true,'setting-blur2':20});
 assert.throws(()=>validateAmbientImport({enabled:true,blur:1000},config));
 assert.throws(()=>validateAmbientImport({unknown:true},config));
});

test('raw Ambient shortcut metadata survives import and export',async()=>{
 const {validateAmbientImport,exportAmbientSettings}=await import('../../src/scripts/features/shared/preferences.js');
 const config=[{name:'enabled',type:'checkbox',defaultKey:'G'}];
 assert.deepEqual(validateAmbientImport({'enabled-key':'H',enabled:false},config),{'setting-enabled-key':'H','setting-enabled':false});
 assert.deepEqual(exportAmbientSettings({'setting-enabled-key':'H','setting-enabled':false,'crossz-local-errors':['private']},config),{'enabled-key':'H',enabled:false});
 assert.throws(()=>validateAmbientImport({'enabled-key':'not a shortcut'},config));
});

test('Ambient numeric imports enforce steps and accept valid decimal controls',async()=>{
 const {validateAmbientImport}=await import('../../src/scripts/features/shared/preferences.js');
 const config=[{name:'frameSync',type:'list',min:0,max:2,step:1},{name:'decimal',type:'list',min:0,max:1,step:0.1}];
 assert.throws(()=>validateAmbientImport({frameSync:1.5},config));
 assert.deepEqual(validateAmbientImport({frameSync:2,decimal:0.3},config),{'setting-frameSync':2,'setting-decimal':0.3});
});
