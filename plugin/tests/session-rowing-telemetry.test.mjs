import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSessionRowingGraph as parse} from '../session-rowing-telemetry.mjs';
const point=(time,spm=20)=>({time,spm,pace:250,power:100,minSpm:18,maxSpm:22});
test('keeps reported sample means and bands without asserting units or duration',()=>{
 const out=parse({pointDataList:[point(0),point(3),{...point(6,0),pace:900}]});
 assert.equal(out.summary.pace.sampleMean,250);assert.equal(out.summary.reportedZeroSpmSampleCount,1);
 assert.equal(out.summary.inTargetSamplePercent,100);assert.equal(out.durationCalculated,false);
 assert.equal(out.paceUnit,'unverified');assert.equal(out.observedTimestampStep,3);
});
test('irregular single duplicate and reversed times never infer cadence or duration',()=>{
 for(const list of [[point(0)],[point(0),point(3),point(9)],[point(0),point(0)]]) {
  const out=parse(list);assert.equal(out.observedTimestampStep,null);assert.equal(out.durationCalculated,false);
 }
 const out=parse([point(3),point(0)]);assert.equal(out.originalTimestampOrderNondecreasing,false);
 assert.equal(parse([point(0),point(0)]).partial,true);
});
test('zero preserved missing excluded invalid bounded points diagnosed',()=>{
 const out=parse([point(0,0),{time:1,spm:null,power:0},{...point(2),power:Infinity},{...point(3),minSpm:30,maxSpm:10}]);
 assert.equal(out.invalidSampleCount,2);assert.equal(out.summary.unknownSpmSampleCount,1);
 assert.equal(out.points[1].power,0);assert.equal(out.summary.inTargetSamplePercent,null);
});
test('rejects sparse arrays accessors symbols class records and excessive data without calling getter',()=>{
 let called=0;const getter={get pointDataList(){called++;return [];}};
 for(const raw of [getter,new Array(2),Array.from({length:10001},()=>point(0)),{pointDataList:[new Date()]},{pointDataList:[],[Symbol()]:1}]) assert.throws(()=>parse(raw));
 assert.equal(called,0);
});

import {readSessionRowingSummary} from '../session-rowing-telemetry.mjs';
test('bound reader exactflag UUID schema zero healthleaks and unavailable paths',async()=>{
 for(const [flag,uuid,status] of [[true,'u','reported-samples'],[false,'u','unavailable'],[undefined,'u','unavailable'],['true','u','unsupported-schema'],[true,null,'unavailable']]) {
  let calls=0;const out=await readSessionRowingSummary({payload:{info:{uuid,existBoatingSkiDataGraph:flag}},type:'free',trainingId:'42',date:'2026-10-08',assertCurrent:async()=>{},apiRead:async path=>{calls++;assert.equal(path,'/app/boatingSkiDataGraph/u');return {code:0,data:{pointDataList:[{time:0,spm:20,power:0,heartRate:120}],patient:'private'}};}});
  assert.equal(out.status,status);assert.equal(calls,status==='reported-samples'?1:0);assert.doesNotMatch(JSON.stringify(out),/heartRate|patient|private|"points"|"uuid"/);
 }
});
test('boundreader conflicting UUID zero reads and late account drift throws',async()=>{
 let calls=0;const base={type:'free',trainingId:'42',date:'2026-10-08',assertCurrent:async()=>{},apiRead:async()=>{calls++;return {code:0,data:{pointDataList:[]}};}};
 const payload={info:{uuid:'a',existBoatingSkiDataGraph:true},detail:[{finishedReps:[{trainingInfoDetail:{uuid:'b'}}]}]};
 assert.equal((await readSessionRowingSummary({...base,payload})).status,'unsupported-schema');assert.equal(calls,0);
 let checks=0;await assert.rejects(readSessionRowingSummary({...base,payload:{info:{uuid:'a',existBoatingSkiDataGraph:true}},assertCurrent:async()=>{if(++checks>1)throw new Error('account-drift');}}),/account-drift/);
});
test('public summary caps alternating bands while global aggregates cover all samples',async()=>{
 const points=Array.from({length:101},(_,i)=>({time:i,spm:20,power:i,minSpm:i%2?19:18,maxSpm:22,heartRate:123,uuid:'private-uuid'}));
 const out=await readSessionRowingSummary({payload:{info:{uuid:'bound-u',existBoatingSkiDataGraph:true}},type:'free',trainingId:'42',date:'2026-10-08',assertCurrent:async()=>{},apiRead:async()=>({code:0,data:{pointDataList:points}})});
 assert.equal(out.totalReportedBlockCount,101);assert.equal(out.returnedBlockCount,64);assert.equal(out.blocks.length,64);assert.equal(out.blocksTruncated,true);
 assert.equal(out.summary.sampleCount,101);assert.equal(out.summary.power.sampleMean,50);assert.deepEqual(out.reportedSampleTimeRange,[0,100]);
 assert.equal(out.blockOutputLimitSemantics,'public-response-resource-bound-not-api-or-physiological-limit');
 assert.doesNotMatch(JSON.stringify(out),/heartRate|private-uuid|bound-u|"points"|"uuid"/);
});
