import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createSpeedianceThrottle,isSpeedianceRateLimited,isRejectedBeforeExecution} from '../plugin/speediance-throttle.mjs';
import {createTrainingResearchRegistry} from '../plugin/training-research.mjs';
const clock=()=>{let t=1000;const sleeps=[];return {now:()=>t,sleep:async ms=>{sleeps.push(ms);t+=ms;},sleeps,advance:ms=>{t+=ms;}};};
test('limiter serializes requests per profile with minimum spacing (no bursts)',async()=>{
  const c=clock();const th=createSpeedianceThrottle({minIntervalMs:300,now:c.now,sleep:c.sleep});const at=[];
  await Promise.all([1,2,3,4].map(async()=>{await th.acquire('p');at.push(c.now());}));
  for(let i=1;i<at.length;i++)assert.ok(at[i]-at[i-1]>=300,'spacing '+at);
});
test('2001 is detected, backoff grows with jitter and exhaustion gives retry time',async()=>{
  assert.ok(isSpeedianceRateLimited({code:2001,message:'Request too frequent, please try again later'}));
  assert.ok(isRejectedBeforeExecution({code:2001,msg:'Request too frequent'}));assert.ok(!isRejectedBeforeExecution({code:2001,msg:'other'}));
  const th=createSpeedianceThrottle({random:()=>1,baseDelayMs:1000,maxDelayMs:5000});
  assert.deepEqual([0,1,2,3,4].map(th.delay),[1000,2000,4000,5000,5000]);
  const low=createSpeedianceThrottle({random:()=>0,baseDelayMs:1000});assert.equal(low.delay(0),500);
  const e=th.rateLimitError(5,true);assert.equal(e.code,'SPEEDIANCE_RATE_LIMITED');assert.ok(e.retryAfterSeconds>0);assert.match(e.message,/Spróbuj ponownie za około \d+ s/);assert.match(e.message,/niczego nie zapisano/);
});
test('fake 2001 transport: GET retried after backoff until success',async()=>{
  const c=clock();const th=createSpeedianceThrottle({now:c.now,sleep:c.sleep,random:()=>0.5});
  const replies=[{code:2001,message:'Request too frequent, please try again later'},{code:2001,message:'Request too frequent'},{code:0,data:[1]}];let calls=0,attempt=0,result;
  for(;;){await th.acquire('p');const env=replies[calls++];if(th.isRateLimited(env)){if(attempt<th.maxAttempts){await th.sleep(th.delay(attempt++));continue;}throw th.rateLimitError(attempt,false);}result=env;break;}
  assert.equal(calls,3);assert.deepEqual(result.data,[1]);assert.ok(c.sleeps.some(ms=>ms>=1000));
});
test('read cache: TTL, disk persistence across instances and write invalidation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-cache-'));const c=clock();
  try{const a=createSpeedianceThrottle({now:c.now,cacheDir:dir});
    a.cacheSet('s','/app/accessories/list',{code:0,data:[{id:1}]});a.cacheSet('s','/app/v5/trainingCalendar/monthNew?date=2026-11',{code:0,data:[]});
    assert.equal(a.cacheGet('s','/app/userinfo/info'),null);
    const b=createSpeedianceThrottle({now:c.now,cacheDir:dir});assert.deepEqual(b.cacheGet('s','/app/accessories/list').data,[{id:1}]);assert.equal(b.cacheGet('s2','/app/accessories/list'),null);
    a.invalidate('s');assert.equal(a.cacheGet('s','/app/v5/trainingCalendar/monthNew?date=2026-11'),null);
    c.advance(31*60_000);assert.equal(b.cacheGet('s','/app/accessories/list'),null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('research batches survive a restart from disk until expiry',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-research-'));const file=path.join(dir,'research-batches.json');let t=1000;
  try{const batch={batchId:'7d0b6c3e-7b0e-4c1e-9a52-111111111111',createdAt:t,expiresAt:t+24*3600_000,queries:[{category:'rest_intervals',context:'hypertrophy',query:'q',searchTier:'exact-context',sourceIds:['pubmed:123']}],sources:[{pmid:'123',title:'Rest intervals',year:'2020',matchedCategories:['rest_intervals']}]};
    fs.writeFileSync(file,JSON.stringify({version:1,batches:[batch]}));
    const restarted=createTrainingResearchRegistry({persistFile:file,now:()=>t,fetchImpl:async()=>{throw Error('no network');}});
    assert.equal(restarted.getBatch(batch.batchId).batchId,batch.batchId);
    t+=25*3600_000;assert.equal(restarted.getBatch(batch.batchId),null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('server wires throttle, cache and durable research batches',()=>{
  const src=fs.readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
  assert.match(src,/persistFile: path\.join\(PLUGIN_DATA, 'research-batches\.json'\), batchTtlMs: 24 \* 60 \* 60 \* 1000/);
  assert.match(src,/if \(throttle\) await throttle\.acquire\(profile\);/);assert.match(src,/throttle\.isRejectedBeforeExecution\(envelope\)/);assert.match(src,/throttle\.cacheGet\(cacheScope, apiPath\)/);
});

