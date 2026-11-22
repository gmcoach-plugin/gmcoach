import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPlanTimeBudget,applySpeedianceDuration,speedianceDisplayMinutes} from '../time-budget.mjs';
test('app duration retains explicitly qualified model upper bound and known lower bound',()=>{
 const plan={confirmedSessionMinutes:10,exercises:[{id:1,entryId:1,sets:[{unit:'reps',reps:100,rest:0}]}]};
 const metadata=new Map([[1,{detail:{isLeftRight:0}}]]);
 const scope=assessPlanTimeBudget(plan,metadata).executionScopeDigest;
 plan.timeEstimation={version:1,executionScopeDigest:scope,repDurationRanges:[{exerciseIndex:0,executedSetIndex:0,minSeconds:2,maxSeconds:20,rationale:'Synthetic bounded logistical estimate',provenance:'caller-estimate'}],additionalSetupRange:{minSeconds:0,maxSeconds:0,rationale:'No additional setup in fixture',provenance:'caller-estimate'}};
 const model=assessPlanTimeBudget(plan,metadata);assert.equal(model.estimatedMinSeconds,200);assert.equal(model.estimatedMaxSeconds,2000);
 const wire={actionLibraryList:[{setsAndReps:'100',completionMethod:'1',breakTime:'0'}]};
 assert.equal(speedianceDisplayMinutes(wire),5);
 const result=applySpeedianceDuration(model,wire,plan);
 assert.equal(result.estimatedTypicalSeconds,300);assert.equal(result.estimatedMinSeconds,200);assert.equal(result.estimatedMaxSeconds,2000);assert.equal(result.definiteLowerBoundSeconds,0);assert.equal(result.limitCheck.code,'risk');assert.equal(result.estimateProvenance,model.estimateProvenance);assert.equal(result.assumptionsDigest,model.assumptionsDigest);
});
test('app range never falls below zero or already known executed time',()=>{
 const wire={actionLibraryList:[{setsAndReps:'0',completionMethod:'1',breakTime:'0'}]};
 for(const definite of [0,50]){const result=applySpeedianceDuration({estimatedMinSeconds:0,estimatedMaxSeconds:70,definiteLowerBoundSeconds:definite},wire);assert.ok(result.estimatedMinSeconds>=definite);assert.ok(result.estimatedMinSeconds>=0);assert.ok(result.estimatedMaxSeconds>=definite);}
});
