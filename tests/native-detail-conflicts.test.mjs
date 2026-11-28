import test from 'node:test';import assert from 'node:assert/strict';import {projectSessionPlanningView} from '../plugin/session-planning-view.mjs';
const view=(set,parent={})=>projectSessionPlanningView({detail:[{...parent,finishedReps:[set]}],gmCoachSessionSummary:{weightUnit:'kg',exercises:[{exercise:'Any',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:'kg',side:0}]}]}}).exercises[0].sets[0];
test('conflicting detail containers cannot select a native scalar or pair',()=>{
 const set=view({trainingInfoDetail:{actionLibraryId:902,weights:[28,28],leftWeights:[14,14],rightWeights:[14,14]},training_info_detail:{actionLibraryId:903,weights:[99,99]}});
 assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.status,'conflicting-or-invalid');assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.lower,undefined);assert.equal(set.reportedCableSum,undefined);assert.deepEqual(set.observedRepLoadEvidence,[]);
});
test('parent and nested variant conflicts withhold native setting evidence',()=>{
 const set=view({trainingInfoDetail:{actionLibraryId:902,weights:[28,28]}},{actionLibraryId:901});assert.equal(set.nativeExecutionEvidence.variantIdentity.status,'conflicting-or-invalid');assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.lower,undefined);
});
test('identical containers and agreeing variant preserve native evidence',()=>{
 const d={actionLibraryId:902,weights:[28,28]};const set=view({trainingInfoDetail:d,training_info_detail:{...d}},{actionLibraryId:902});assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.lower,28);
});

test('explicit unknown set unit identifies its own provenance separately from session context',()=>{
 const input={detail:[{finishedReps:[{trainingInfoDetail:{weights:[28,28]}}]}],gmCoachSessionSummary:{weightUnit:'kg',weightUnitSource:'profile',exercises:[{exercise:'Any',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:'unknown',side:0}]}]}};
 const row=projectSessionPlanningView(input).exercises[0].sets[0].nativeExecutionEvidence.nativeReportedLoad;
 assert.equal(row.unit,'unknown');assert.equal(row.unitSource,'normalized-set-weightUnit');assert.equal(row.sessionContextUnitSource,'profile');assert.equal(row.historicalUnitIndependentlyVerified,false);
});

test('actual normalized conflicting identities withhold every numeric planning anchor and pair',async()=>{
 const {annotateTimedWorkoutOutput}=await import('file:///C:/TQ3D/07-Pluginy/GM%20Coach/aktualna/workout-data.mjs');
 const a={actionLibraryId:901,weights:[28,28],leftWeights:[10,20],rightWeights:[20,10],leftTimestamps:[100,200],rightTimestamps:[100,200]};
 for(const mode of ['containers','variant']){
 const rawSet={finishedCount:2,targetCount:2,leftRight:0,trainingInfoDetail:a,...(mode==='containers'?{training_info_detail:{action_library_id:902,weights:[61,61],left_weights:[30,40],right_weights:[40,30],left_timestamps:[100,200],right_timestamps:[100,200]}}:{})};
 const payload={detail:[{actionLibraryGroupId:116,actionLibraryId:902,title:'Any',completionMethod:1,finishedReps:[rawSet]}]};
 const full=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(payload),{displayUnit:'kg'}));
 const set=projectSessionPlanningView(full).exercises[0].sets[0];
 assert.equal(set.nativeExecutionEvidence.variantIdentity.status,'conflicting-or-invalid');
 assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.lower,undefined);
 assert.deepEqual(set.observedRepLoadEvidence,[]);assert.equal(set.observedLoadAnchor.status,'unavailable');assert.equal(set.observedLoadAnchor.channels,undefined);assert.equal(set.reportedCableSum,undefined);
 }
});
