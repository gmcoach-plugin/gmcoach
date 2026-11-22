import test from 'node:test';import assert from 'node:assert/strict';
import {boundedReadBatch} from '../bounded-read-batch.mjs';
import {createNativeHealthReader} from '../native-health-reader.mjs';
test('actual native nine-feed snapshot issues only three concurrent GETs then stable outputs',async()=>{
 let active=0,maxActive=0;const waits=[],paths=[];
 const apiRead=path=>new Promise(resolve=>{paths.push(path);active++;maxActive=Math.max(maxActive,active);waits.push(()=>{active--;resolve({code:0,data:path.includes('hasReal')?false:path.includes('Fatigue')||path.includes('dateRange')?[]:{}});});});
 const reader=createNativeHealthReader({apiRead,runReadBatch:operations=>boundedReadBatch({operations,parallelScope:f=>f(),serialScope:f=>f(),isExpired:()=>false,assertCurrent:async()=>{},concurrency:3})});
 const pending=reader.snapshot({date:'2026-10-12',start_date:'2026-10-12',end_date:'2026-10-12'});
 for(let round=0;round<30;round++){await new Promise(resolve=>setImmediate(resolve));while(waits.length)waits.shift()();if(paths.length===9&&active===0)break;}
 const result=await pending;assert.equal(maxActive,3);assert.equal(paths.length,9);assert.equal(paths.some(p=>p.includes('recovery/detail')||p.includes('/sleep?')),false);assert.ok(result.feeds.fatigue);assert.ok(result.feeds.sleep);
});
test('serial supervised expiry retries only subset after all original tasks drain',async()=>{
 let active=0,retries=0;const seen=[];const operations=Array.from({length:9},(_,i)=>()=>i);
 const r=await boundedReadBatch({operations,assertCurrent:async()=>{},concurrency:3,parallelScope:async f=>{active++;await Promise.resolve();active--;const value=f();if(value===2)throw Object.assign(Error('actual tagged expiry'),{code:'GM_COACH_READ_BATCH_VERIFIED_EXPIRY'});if(value===4)throw Error('displacement');return value;},serialScope:async f=>{assert.equal(active,0);retries++;seen.push(f());return f();},isExpired:e=>e.code==='GM_COACH_READ_BATCH_VERIFIED_EXPIRY'});
 assert.equal(retries,1);assert.deepEqual(seen,[2]);assert.equal(r[2].status,'fulfilled');assert.equal(r[4].status,'rejected');
});
test('invalid period sends zero GET and batch profile drift rejects no stale result',async()=>{
 let reads=0;const reader=createNativeHealthReader({apiRead:async()=>{reads++;return {code:0,data:{}};}});await assert.rejects(reader.snapshot({date:'bad',start_date:'2026-10-12',end_date:'2026-10-12'}));assert.equal(reads,0);
 let current=false;await assert.rejects(boundedReadBatch({operations:[()=>1],parallelScope:async f=>{current=true;return f();},serialScope:f=>f(),isExpired:()=>false,assertCurrent:async()=>{if(current)throw Error('profile drift');}}),/profile drift/);
});
test('deterministic equal-latency9 operations take9 waves serial vs3 waves cap3',async()=>{
 async function measure(concurrency){let waves=0,done=false,active=0,max=0;const waiting=[];const p=boundedReadBatch({operations:Array.from({length:9},()=>()=>new Promise(resolve=>{active++;max=Math.max(max,active);waiting.push(()=>{active--;resolve('ok');});})),parallelScope:f=>f(),serialScope:f=>f(),isExpired:()=>false,assertCurrent:async()=>{},concurrency}).then(x=>{done=true;return x;});
 while(!done){await new Promise(resolve=>setImmediate(resolve));if(waiting.length){waves++;const wave=waiting.splice(0);for(const release of wave)release();}}await p;return {waves,max,simulatedMilliseconds:waves*40};}
 assert.deepEqual(await measure(1),{waves:9,max:1,simulatedMilliseconds:360});assert.deepEqual(await measure(3),{waves:3,max:3,simulatedMilliseconds:120});
});
