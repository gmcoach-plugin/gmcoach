import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSessionPlanningView} from '../session-planning-view.mjs';

test('planning view preserves completed dose and load uncertainty without raw telemetry',()=>{
  const source={training_id:'sample',kind:'program',weightUnit:'kg',detail:[{actionLibraryGroupId:57,actionLibraryId:901}],gmCoachSessionReadback:{partial:false},gmCoachSessionSummary:{exercises:[{exercise:'Barbell Squat',path:'$.detail[0]',sets:[{set:1,reps:8,unit:'reps',elapsedSeconds:38,side:0,reportedCablePeakLoad:44,reportedCablePeakLoadStatus:'reported-telemetry-peak',reportedLoadSequences:[{channel:'left-cable',unit:'kg',status:'reported',sampleToRepetitionMapping:'unverified',samples:[22,22,22],observedSampleSummary:{minimumReportedSample:22,maximumReportedSample:22,constantReportedSamples:true,workingLoadInferred:false}}]}]}]}};
  const result=projectSessionPlanningView(source);
  assert.equal(result.exercises[0].groupId,57);
  assert.equal(result.exercises[0].actionLibraryId,901);
  assert.equal(result.exercises[0].actionLibraryIdStatus,'reported-in-session');
  assert.equal(result.exercises[0].sets[0].reps,8);
  assert.equal(result.exerciseCount,1);
  assert.equal(result.setCount,1);
  assert.equal(result.exercises[0].sets[0].reportedLoadChannels[0].workingLoadInferred,false);
  assert.equal(result.exercises[0].sets[0].observedLoadAnchor.status,'reported-set-range');
  assert.equal(result.exercises[0].sets[0].observedLoadAnchor.channels[0].upper,22);
  assert.equal(JSON.stringify(result).includes('"samples"'),false);
  assert.equal(result.planningView,true);
  assert.throws(()=>projectSessionPlanningView({}),/unavailable/);
});

test('planning view never guesses missing or conflicting catalogue identities',()=>{
  const source={detail:[{actionLibraryGroupId:57,group_id:58,actionLibraryId:901,action_library_id:902}],gmCoachSessionSummary:{exercises:[{exercise:'Movement',path:'$.detail[0]',sets:[]}]}};
  const conflicting=projectSessionPlanningView(source).exercises[0];
  assert.equal(conflicting.groupId,undefined);
  assert.equal(conflicting.groupIdStatus,'conflicting-or-invalid');
  assert.equal(conflicting.actionLibraryId,undefined);
  assert.equal(conflicting.actionLibraryIdStatus,'conflicting-or-invalid');
  const missing=projectSessionPlanningView({...source,detail:[{actionLibraryGroupId:57}]}).exercises[0];
  assert.equal(missing.actionLibraryId,undefined);
  assert.equal(missing.actionLibraryIdStatus,'unavailable');
});

test('count-aligned reported rep resistance is usable as a bounded anchor without claiming a fixed setting',()=>{
  const raw={detail:[{templatePresetId:5,finishedReps:[{trainingInfoDetail:{weights:[20,22,22,25]}}]}],gmCoachSessionSummary:{exercises:[{exercise:'Press',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:4,weightUnit:'kg'}]}]}};
  const evidence=projectSessionPlanningView(raw).exercises[0].sets[0].observedRepLoadEvidence;
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].maximumReportedLoad,25);
  assert.equal(evidence[0].minimumReportedLoad,20);
  assert.equal(evidence[0].fixedCustomizeSettingVerified,false);
  assert.equal(evidence[0].status,'count-aligned-reported-rep-resistance');
  assert.equal(projectSessionPlanningView(raw).exercises[0].sets[0].observedLoadAnchor.historicalLoadTypeRequired,false);
  assert.equal(projectSessionPlanningView(raw).exercises[0].sets[0].observedLoadAnchor.channels[0].upper,25);
  const mismatch=projectSessionPlanningView({...raw,gmCoachSessionSummary:{exercises:[{exercise:'Press',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:5,weightUnit:'kg'}]}]}});
  assert.deepEqual(mismatch.exercises[0].sets[0].observedRepLoadEvidence,[]);
  assert.equal(mismatch.exercises[0].sets[0].observedLoadAnchor.status,'unavailable');
  const twoCables=projectSessionPlanningView({...raw,detail:[{finishedReps:[{trainingInfoDetail:{weights:[50,50,50,50],leftWeights:[20,22,22,25],rightWeights:[19,20,21,23]}}]}]}).exercises[0].sets[0].observedRepLoadEvidence;
  assert.deepEqual(twoCables.map(item=>item.channel),['left-cable','right-cable']);
  assert.equal(twoCables[0].maximumReportedLoad,25);
  assert.equal(twoCables[1].maximumReportedLoad,23);
  const range=projectSessionPlanningView({...raw,detail:[{finishedReps:[{trainingInfoDetail:{weights:[20,22,22]}}]}],gmCoachSessionSummary:{exercises:[{exercise:'Press',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:4,weightUnit:'kg',weightMin:20,weightMax:22}]}]}}).exercises[0].sets[0].observedLoadAnchor;
  assert.equal(range.status,'reported-set-range');
  assert.equal(range.channels[0].upper,22);
});
test('bilateral cable sums are explicit and one-sided loads are never doubled',()=>{
  const raw={detail:[{finishedReps:[{trainingInfoDetail:{leftWeights:[20,21,22],rightWeights:[19,20,21],leftTimestamps:[1,2,3],rightTimestamps:[1,2,3]}}]}],gmCoachSessionSummary:{exercises:[{exercise:'Press',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:3,side:0,weightUnit:'kg'}]}]}};
  const bilateral=projectSessionPlanningView(raw).exercises[0].sets[0];
  assert.deepEqual([bilateral.reportedCableSum.lower,bilateral.reportedCableSum.upper],[39,43]);
  assert.equal(bilateral.reportedCableSum.status,'derived-from-paired-reported-samples');
  assert.equal(bilateral.reportedLoadScope,'bilateral-reported');
  const oneSide=projectSessionPlanningView({...raw,gmCoachSessionSummary:{exercises:[{exercise:'Press',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:3,side:1,weightUnit:'kg'}]}]}}).exercises[0].sets[0];
  assert.equal(oneSide.reportedCableSum,undefined);
  assert.equal(oneSide.reportedLoadScope,'left-side-reported');
  assert.deepEqual(oneSide.observedLoadAnchor.channels.map(row=>row.channel),['left-cable']);
  const incomplete=projectSessionPlanningView({...raw,detail:[{finishedReps:[{trainingInfoDetail:{leftWeights:[20,21,22],rightWeights:[19,20]}}]}]}).exercises[0].sets[0];
  assert.equal(incomplete.reportedCableSum,undefined);
});

test('variable resistance history exposes mode code without inventing lifting or lowering load',()=>{
  const source={detail:[{finishedReps:[{trainingInfoDetail:{leftWeights:[20,28,20],rightWeights:[20,28,20]}}]}],gmCoachSessionSummary:{exercises:[{exercise:'Row',path:'$.detail[0]',sets:[{set:1,unit:'reps',reps:3,side:0,weightUnit:'kg',reportedSettingCodes:[{field:'sportMode',status:'reported-code',code:3}]}]}]}};
  const set=projectSessionPlanningView(source).exercises[0].sets[0];
  assert.equal(set.reportedSettingCodes[0].code,3);
  assert.equal(set.phaseLoadStatus,'concentric-and-eccentric-loads-not-separated-by-reported-samples');
  assert.deepEqual([set.reportedCableSum.lower,set.reportedCableSum.upper],[40,56]);
  assert.equal(set.reportedCableSum.fixedCustomizeSettingVerified,false);
});

const view=(detail,unit='kg')=>projectSessionPlanningView({detail:[{finishedReps:[{trainingInfoDetail:detail}]}],gmCoachSessionSummary:{exercises:[{exercise:'Row',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:unit,side:0}]}]}}).exercises[0].sets[0];
test('preserves native row28 independently of two cable28 readings and reports nested variant',()=>{
 const source={actionLibraryId:424950719250433,weights:[28,28],leftWeights:[28,28],rightWeights:[28,28]};
 const before=JSON.stringify(source),r=view(source).nativeExecutionEvidence;
 assert.equal(r.variantIdentity.id,424950719250433);
 assert.deepEqual([r.nativeReportedLoad.lower,r.nativeReportedLoad.upper],[28,28]);
 assert.equal(r.nativeReportedLoad.cableAggregation,'not-inferred');
 assert.equal(r.nativeReportedLoad.fixedCustomizeSettingVerified,false);
 assert.equal(JSON.stringify(source),before);
});
test('variable native samples remain ranges with actual count, not exercise maximum',()=>{
 const r=view({weights:[20,28]}).nativeExecutionEvidence.nativeReportedLoad;
 assert.deepEqual([r.lower,r.upper,r.sampleCount],[20,28,2]);
 assert.equal(r.sampleCountMatchesAchievedReps,true);
});
test('missing units remain unknown and malformed samples never become loads',()=>{
 assert.equal(view({weights:[28,28]},'unknown').nativeExecutionEvidence.nativeReportedLoad.unit,'unknown');
 for(const weights of [[null,null],[true,true],['28junk','28'],[Infinity,28],[],Array(101).fill(28)]){
  assert.equal(view({weights}).nativeExecutionEvidence.nativeReportedLoad.status,'invalid-or-unsupported');
 }
 const r=view({actionLibraryId:11,action_library_id:12,weights:[28,28]}).nativeExecutionEvidence;
 assert.equal(r.variantIdentity.status,'conflicting-or-invalid');
 assert.equal(r.variantIdentity.id,undefined);
});
