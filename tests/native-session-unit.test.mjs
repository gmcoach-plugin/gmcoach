import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateTimedWorkoutOutput} from '../plugin/workout-data.mjs';
import {collectPlanInputs} from '../plugin/plan-input-bundle.mjs';
import {projectSessionPlanningView} from '../plugin/session-planning-view.mjs';
test('native per-set weights retain resolved session unit when side telemetry suppresses aggregate display',()=>{
 for(const unit of ['kg','lb','unknown']){
  const input={training_id:42,kind:'program',detail:[{actionLibraryGroupId:116,title:'Row',completionMethod:1,finishedReps:[{finishedCount:2,targetCount:2,trainingInfoDetail:{actionLibraryId:901,weights:[28,28],leftWeights:[28,28],rightWeights:[28,28]}}]}]};
  const full=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:unit}));
  const result=projectSessionPlanningView(full).exercises[0].sets[0].nativeExecutionEvidence;
  assert.equal(result.nativeReportedLoad.unit,unit);
  assert.equal(result.nativeReportedLoad.lower,28);
  assert.equal(result.nativeReportedLoad.upper,28);
  assert.equal(result.nativeReportedLoad.fixedCustomizeSettingVerified,false);
  assert.equal(result.variantIdentity.id,901);
  assert.deepEqual(full.detail,input.detail);
 }
});

test('candidate native unit and independent scalar survive real plan-input compaction',async()=>{
 for(const [native,cable] of [[28,28],[61,30.5]]){
 const input={training_id:42,kind:'program',detail:[{actionLibraryGroupId:116,title:'Movement',completionMethod:1,finishedReps:[{finishedCount:2,targetCount:2,trainingInfoDetail:{actionLibraryId:901,weights:[native,native],leftWeights:[cable,cable],rightWeights:[cable,cable]}}]}]};
 const full=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:'kg'}));
 const planning=projectSessionPlanningView(full);
 const args={profile:'synthetic',month:'2026-11',program_codes:[],days:14,consent_to_read_history:true,include_recent_session_details:true};
 const result=await collectPlanInputs(args,{resolveProfile:async value=>value,readProfileConfig:async()=>({id:1}),accountFingerprint:x=>x.id,readTrainingProfile:async()=>({}),readCalendar:async()=>({}),readBaselines:async()=>({}),readAthlete:async()=>({history:{mobileSessions:[{training_id:42,kind:'program',date:'2026-11-09'}]}}),readDetail:async()=>planning});
 const set=result.recentSessionDetails.results[0].detail.exercises[0].sets[0];
 assert.deepEqual([set.nativeExecutionEvidence.nativeReportedLoad.lower,set.nativeExecutionEvidence.nativeReportedLoad.unit],[native,'kg']);
 assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.fixedCustomizeSettingVerified,false);
 assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.cableAggregation,'not-inferred');
 assert.equal(set.loadChannelPresentation.channels[0].minimum,cable);
 }
});
