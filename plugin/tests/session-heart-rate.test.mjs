import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSessionHeartUuid,normalizeSessionHeartGraph,readSessionHeartSummary} from '../session-heart-rate.mjs';
const detail=uuid=>({detail:[{finishedReps:[{trainingInfoDetail:{uuid}}]}]});
test('exact narrow UUID locations and conflicts',()=>{
 assert.equal(extractSessionHeartUuid(detail('u-1'),'program'),'u-1');
 assert.equal(extractSessionHeartUuid({info:{uuid:'u-1'}},'free'),'u-1');
 assert.equal(extractSessionHeartUuid({info:{uuid:'u-1'}},'program'),null);
 assert.throws(()=>extractSessionHeartUuid({...detail('u-2'),info:{uuid:'u-1'}},'free'),/Conflicting/);
 assert.throws(()=>extractSessionHeartUuid(detail('../bad'),'program'));
});
test('measurement average retained, absent/zero average never derived from peaks',()=>{
 assert.deepEqual(normalizeSessionHeartGraph({minHeartRate:80,avgHeartRate:100,maxHeartRate:130,heartRates:[1,2]}),{status:'reported',reportedMinBpm:80,reportedAvgBpm:100,reportedMaxBpm:130,reportedSampleCount:2,missingFields:[]});
 for(const avg of [undefined,null,0]) assert.equal(normalizeSessionHeartGraph({maxHeartRate:130,avgHeartRate:avg}).reportedAvgBpm,null);
 for(const graph of [{avgHeartRate:true},{avgHeartRate:'100'},{avgHeartRate:Infinity},{minHeartRate:150,maxHeartRate:100},{minHeartRate:100,avgHeartRate:90}])assert.throws(()=>normalizeSessionHeartGraph(graph));
});
test('bounded dense descriptors reject without executing getters',()=>{
 let hits=0;const graph={};Object.defineProperty(graph,'avgHeartRate',{get(){hits++;return 100;}});
 assert.throws(()=>normalizeSessionHeartGraph(graph));
 const p={};Object.defineProperty(p,'detail',{get(){hits++;return [];}});assert.throws(()=>extractSessionHeartUuid(p,'program'));
 const sparse=new Array(2);assert.throws(()=>normalizeSessionHeartGraph({heartRates:sparse}));
 assert.throws(()=>normalizeSessionHeartGraph({heartRates:new Array(100001)}));assert.equal(hits,0);
});
test('summary omits UUID/raw samples and graph failure stays explicit',async()=>{
 let reads=0;const base={payload:detail('secret-session'),type:'program',trainingId:'42',date:'2026-10-08',assertCurrent:async()=>{}};
 const result=await readSessionHeartSummary({...base,apiRead:async path=>{reads++;assert.equal(path,'/app/watchMsg/getHeartRateGraph?uuid=secret-session');return{code:0,data:{avgHeartRate:100,heartRates:[{secret:'sample'}]}};}});
 assert.equal(result.reportedAvgBpm,100);assert.doesNotMatch(JSON.stringify(result),/secret-session|sample"/);
 const missing=await readSessionHeartSummary({...base,payload:{},apiRead:async()=>{reads++;}});assert.equal(missing.status,'unavailable');assert.equal(reads,1);
 const failed=await readSessionHeartSummary({...base,apiRead:async()=>{throw Error('password');}});assert.equal(failed.diagnostic,'session-heart-read-failed');assert.doesNotMatch(JSON.stringify(failed),/password/);
});
