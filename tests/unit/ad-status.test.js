import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installWorker} from '../../src/scripts/features/worker.js';

test('worker exposes actual ad bootstrap readiness instead of inferring it from the preference',async()=>{
  let status={state:'starting',error:null};
  const api={
    runtime:{getURL:path=>'chrome-extension://abc/'+path,onMessage:{addListener:()=>{}}},
    storage:{local:{get:async()=>({})}},
  };
  const setAdEnabled=async()=>{};
  setAdEnabled.status=()=>status;
  const worker=installWorker(api,{setAdEnabled});
  assert.deepEqual((await worker.getSnapshot(null)).adFilter,status);
  status={state:'error',error:'Không có quyền truy cập YouTube.'};
  const failed=await worker.getSnapshot(null);
  assert.equal(failed.adBlockingEnabled,true);
  assert.deepEqual(failed.adFilter,status);
  status={state:'ready',error:null};
  assert.deepEqual((await worker.getSnapshot(null)).adFilter,status);
});
