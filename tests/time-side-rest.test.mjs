import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPlanTimeBudget} from '../plugin/time-budget.mjs';
import {expandPlanForSerialization,normalizeSupersetBlocks} from '../plugin/superset-serialization.mjs';
import {expandUnilateralPrescription} from '../plugin/unilateral-prescription.mjs';
const range={minSeconds:1,maxSeconds:1,rationale:'Synthetic timing only',provenance:'caller-estimate'};
function assess(plan,unilateral){
 const metadata=new Map(plan.exercises.map(e=>[e.id,{detail:{isLeftRight:unilateral?1:0}}]));
 const rows=expandPlanForSerialization(plan).flatMap(entry=>expandUnilateralPrescription(entry.exercise,entry.sets,{isUnilateral:unilateral,superset:entry.superset}));
 const first=assessPlanTimeBudget(plan,metadata);
 plan.timeEstimation={version:1,executionScopeDigest:first.executionScopeDigest,repDurationRanges:rows.flatMap((s,i)=>s.unit==='reps'?[{...range,exerciseIndex:plan.exercises.findIndex(e=>e.entryId===s.fixtureEntry),executedSetIndex:i}]:[]),additionalSetupRange:{...range,minSeconds:0,maxSeconds:0}};
 return {value:assessPlanTimeBudget(plan,metadata),rows};
}
const exercise=(entryId,sets,extra={})=>({id:1,entryId,actionLibraryId:101,title:'Synthetic',loadType:'bodyweight',sets:sets.map(s=>({...s,fixtureEntry:entryId})),...extra});
test('paired explicit side transitions match serialized rests exactly once',()=>{
 const p={exercises:[exercise(1,[{unit:'reps',reps:8,rest:90},{unit:'reps',reps:8,rest:90}],{sideTransitionSeconds:5,sideTransitionRationale:'Operational change'})]};
 const {value,rows}=assess(p,true);assert.deepEqual(rows.map(s=>s.rest),[5,90,5,90]);assert.equal(value.definiteLowerBoundSeconds,100);assert.equal(value.estimatedMinSeconds,132);assert.equal(value.estimatedMaxSeconds,132);assert.ok(!value.sessionEstimate.defaultsApplied.includes('side-transition'));
});
test('explicit asymmetric timed sides add no guessed transition beyond own rests',()=>{
 const p={exercises:[exercise(1,[{side:1,unit:'reps',reps:8,rest:7},{side:2,unit:'sec',durationSeconds:30,rest:90}],{unilateralPrescription:'explicit-sides'})]};
 const {value}=assess(p,true);assert.equal(value.definiteLowerBoundSeconds,37);assert.equal(value.estimatedMinSeconds,45);assert.equal(value.estimatedMaxSeconds,45);
});
test('bilateral and paired default rest preserve terminal rest exclusion',()=>{
 for(const unilateral of [false,true]){const p={exercises:[exercise(1,[{unit:'reps',reps:8,rest:90},{unit:'reps',reps:8,rest:90}])]};const {value,rows}=assess(p,unilateral);assert.deepEqual(rows.map(s=>s.rest),unilateral?[1,90,1,90]:[90,90]);assert.equal(value.definiteLowerBoundSeconds,unilateral?92:90);assert.equal(value.estimatedMinSeconds,unilateral?124:106);}
});
test('actual superset normalization interleaves rests without extra side or setup time',()=>{
 const p={exercises:[exercise(10,[{unit:'reps',reps:8,rest:90},{unit:'reps',reps:8,rest:90}]),exercise(11,[{unit:'reps',reps:6,rest:90},{unit:'reps',reps:6,rest:90}])]};
 p.supersetBlocks=normalizeSupersetBlocks([{members:[{exerciseId:10,setupKey:'mat'},{exerciseId:11,setupKey:'mat'}],rounds:2,transitionRestSeconds:5,recoveryRestSeconds:90}],p.exercises);
 const {value,rows}=assess(p,false);assert.deepEqual(rows.map(s=>s.rest),[5,90,5,90]);assert.equal(value.definiteLowerBoundSeconds,100);assert.equal(value.estimatedMinSeconds,128);assert.equal(value.estimatedMaxSeconds,128);
});
