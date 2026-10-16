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
