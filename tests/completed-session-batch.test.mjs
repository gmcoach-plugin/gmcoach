import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCompletedSessionBatch} from '../plugin/completed-session-batch.mjs';

const key=(training_id,date)=>({training_id,type:'program',date});
const rows=[key('101','2026-11-01'),key('102','2026-11-02'),key('103','2026-11-03')];
const base={profile:'example-profile',sessions:rows,consent_to_read_history:true};

test('bounded exact history batch reads planning details concurrently and keeps partial errors',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);let active=0,peak=0;
  const resultPromise=readCompletedSessionBatch(base,{resolveProfile:async value=>value,readProfileConfig:async()=>({account:'A'}),accountFingerprint:value=>value.account,readDetail:async value=>{active++;peak=Math.max(peak,active);await gate;active--;if(value.training_id==='102')throw Object.assign(new Error('failed'),{code:'API_ERROR'});return {id:value.training_id,view:value.output_view};}});
  await new Promise(resolve=>setImmediate(resolve));release();
  const result=await resultPromise;
  assert.equal(peak,3);assert.equal(result.completeCount,2);assert.equal(result.partial,true);
  assert.deepEqual(result.results.map(item=>item.status),['complete','error','complete']);
  assert.equal(result.results[0].detail.view,'planning');assert.equal(result.results[1].error,'API_ERROR');
  assert.deepEqual(result.results.map(item=>item.key),rows);
  assert.equal(result.writeAuthorized,false);assert.equal(result.healthRead,false);
});

test('rejects absent consent, invalid dates, duplicates and account drift',async()=>{
  const deps={resolveProfile:async value=>value,readProfileConfig:async()=>({account:'A'}),accountFingerprint:value=>value.account,readDetail:async()=>({})};
  await assert.rejects(readCompletedSessionBatch({...base,consent_to_read_history:false},deps),/consent/);
  await assert.rejects(readCompletedSessionBatch({...base,sessions:[key('101','2026-02-30')]},deps),/Invalid exact/);
  await assert.rejects(readCompletedSessionBatch({...base,sessions:[rows[0],rows[0]]},deps),/Duplicate/);
  let count=0;
  await assert.rejects(readCompletedSessionBatch({...base,sessions:[rows[0]]},{...deps,readProfileConfig:async()=>({account:++count===1?'A':'B'})}),/Account changed/);
});

test('public MCP registration and dispatch preserve exact bounded path',()=>{
  const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
  assert.match(source,/name: 'gm_coach_get_completed_session_details'/);
  assert.match(source,/case 'gm_coach_get_completed_session_details': \{[\s\S]*?readCompletedSessionBatch\(args,[\s\S]*?dispatchWithCoachingMemory\('speediance_get_session_detail',detailArgs\)/);
});
