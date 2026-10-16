import {test} from 'node:test';
import assert from 'node:assert/strict';

test('local diagnostics keep the last 100 errors and redact URLs', async () => {
  const {createLocalReporter} = await import('../../src/scripts/libs/errors/local-reporter.js');
  let stored = [];
  const reporter = createLocalReporter({read:async()=>stored,write:async(value)=>{stored=value;}});
  for(let i=0;i<105;i++) await reporter.record(new Error(`error ${i} https://www.youtube.com/watch?v=private`));
  const exported = JSON.parse(await reporter.export());
  assert.equal(exported.length,100);
  assert.match(exported[0].message,/error 5 /);
  assert.doesNotMatch(JSON.stringify(exported),/private|https:\/\//);
});
