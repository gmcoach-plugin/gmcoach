import test from 'node:test';import assert from 'node:assert/strict';
import {scanCompletedExerciseHistory} from '../plugin/completed-exercise-history.mjs';
test('exercise history returns native per-set values without doubling cable channels',async()=>{
 for(const unit of ['kg','lb','unknown']){
 const payload={training_id:42,kind:'program',detail:[{actionLibraryGroupId:116,completionMethod:1,title:'Row',finishedReps:[{finishedCount:2,targetCount:2,trainingInfoDetail:{actionLibraryId:901,weights:[28,28],leftWeights:[28,28],rightWeights:[28,28]}}]}]};
 const result=await scanCompletedExerciseHistory({groupId:116,displayUnit:unit,now:new Date('2026-11-11T12:00:00Z'),summaries:[{training_id:42,date:'2026-11-10',kind:'program'}],fetchSession:async()=>({payload,source:'cli-session-detail'})});
 const row=result.matches[0].sets[0].nativeExecutionEvidence;
 assert.equal(row.variantIdentity.id,901);assert.equal(row.nativeReportedLoad.lower,28);assert.equal(row.nativeReportedLoad.unit,unit);assert.equal(row.nativeReportedLoad.fixedCustomizeSettingVerified,false);
 assert.ok(!JSON.stringify(row).includes('samples'));
 }
});
