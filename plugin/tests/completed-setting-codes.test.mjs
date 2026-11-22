import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateTimedWorkoutOutput} from '../workout-data.mjs';
import {scanCompletedExerciseHistory} from '../completed-exercise-history.mjs';
import {reportedCompletedSettingCodes as readCodes,safeReportedCompletedSettingCodes as safeCodes} from '../completed-setting-codes.mjs';
const payload=()=>({training_id:'42',kind:'program',showCalculatedLoads:false,info:{},detail:[{
 actionLibraryGroupId:116,templatePresetId:5,sportMode:'1,2',completionMethod:1,
 finishedReps:[{finishedCount:8,sportMode:0,trainingInfoDetail:{weights:[10,12],templatePresetId:-1}},
 {finishedCount:9,sportMode:1,trainingInfoDetail:{weights:[11],sportMode:2}},
 {finishedCount:10,trainingInfoDetail:{weights:[12]}}]}]});
test('actual completed summary preserves raw set settings without broadcasting exercise settings',()=>{
 const input=payload(),output=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:'kg'}));
 assert.deepEqual(output.detail,input.detail);
 const sets=output.gmCoachSessionSummary.exercises[0].sets;
 assert.deepEqual(sets[0].reportedSettingCodes.map(x=>x.code),[0,-1]);
 assert.equal(sets[0].reportedSettingCodes[1].evidence[0].path,'$.detail[0].finishedReps[0].trainingInfoDetail.templatePresetId');
 assert.equal(sets[1].reportedSettingCodes[0].status,'conflict');
 assert.equal(sets[1].reportedSettingCodes[0].code,undefined);
 assert.equal(sets[2].reportedSettingCodes,undefined);
 assert.equal(sets[0].reps,8);
});
test('actual completed exercise history forwards bounded generated code provenance',async()=>{
 const result=await scanCompletedExerciseHistory({groupId:116,summaries:[{training_id:'42',kind:'program',date:'2026-10-07'}],
 displayUnit:'kg',now:new Date('2026-10-08T12:00:00Z'),fetchSession:async()=>({payload:payload(),source:'speediance-api'})});
 const sets=result.matches[0].sets;
 assert.equal(sets[0].reportedSettingCodes[0].code,0);
 assert.equal(sets[1].reportedSettingCodes[0].status,'conflict');
 assert.equal(sets[2].reportedSettingCodes,undefined);
 assert.doesNotMatch(JSON.stringify(sets[0].reportedSettingCodes),/Standard|Strength|Customize|Gain Muscle/);
});
test('both actual completed boundaries retain snake detail and three-way conflicts',async()=>{
 const input=payload();
 input.detail[0].finishedReps[0].training_info_detail={sportMode:2,templatePresetId:99};
 input.detail[0].finishedReps[0].trainingInfoDetail.sportMode=1;
 input.detail[0].finishedReps[2].training_info_detail={sportMode:'bad'};
 const output=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:'kg'}));
 const codes=output.gmCoachSessionSummary.exercises[0].sets[0].reportedSettingCodes;
 assert.equal(codes[0].status,'conflict');
 assert.equal(codes[0].evidence.length,3);
 assert.equal(codes[1].status,'conflict');
 assert.equal(codes[1].evidence[1].path,'$.detail[0].finishedReps[0].training_info_detail.templatePresetId');
 assert.deepEqual(output.detail,input.detail);
 assert.equal(output.gmCoachSessionSummary.exercises[0].sets[2].reportedSettingCodes[0].status,'invalid-or-conflicting');
 const result=await scanCompletedExerciseHistory({groupId:116,summaries:[{training_id:'42',kind:'program',date:'2026-10-07'}],
 displayUnit:'kg',now:new Date('2026-10-08T12:00:00Z'),fetchSession:async()=>({payload:input,source:'speediance-api'})});
 assert.deepEqual(result.matches[0].sets[0].reportedSettingCodes,codes);
 assert.equal(result.matches[0].sets[2].reportedSettingCodes[0].status,'invalid-or-conflicting');
});
test('alternate finished_reps uses the actual field path in completed summary and scan',async()=>{
 const input=payload();
 input.detail[0].finished_reps=input.detail[0].finishedReps;
 delete input.detail[0].finishedReps;
 const output=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:'kg'}));
 const codes=output.gmCoachSessionSummary.exercises[0].sets[0].reportedSettingCodes;
 assert.equal(codes[0].evidence[0].path,'$.detail[0].finished_reps[0].sportMode');
 assert.deepEqual(output.detail,input.detail);
 const result=await scanCompletedExerciseHistory({groupId:116,summaries:[{training_id:'42',kind:'program',date:'2026-10-07'}],
 displayUnit:'kg',now:new Date('2026-10-08T12:00:00Z'),fetchSession:async()=>({payload:input,source:'speediance-api'})});
 assert.deepEqual(result.matches[0].sets[0].reportedSettingCodes,codes);
});
test('producer and history consumer agree at exact evidence path bound',()=>{
 const path='x'.repeat(1024-'.training_info_detail.templatePresetId'.length);
 const codes=readCodes({training_info_detail:{templatePresetId:2147483647,sportMode:'bad'}},path);
 assert.equal(codes[1].evidence[0].path.length,1024);
 assert.deepEqual(safeCodes(codes),codes);
 assert.equal(readCodes({sportMode:0},path+'x'),undefined);
 const tooLong=structuredClone(codes);tooLong[1].evidence[0].path+='x';
 assert.equal(safeCodes(tooLong),undefined);
});
test('strict integer codes preserve zero and minus one but reject malformed values',()=>{
 for(const value of [0,-1,'0','-1',2147483647,-2147483648]){
  const codes=readCodes({sportMode:value},'$.set');
  assert.equal(codes[0].status,'reported-code');
  assert.equal(codes[0].code,Number(value));
  assert.deepEqual(safeCodes(codes),codes);
 }
 for(const value of [true,false,null,undefined,1.5,'1,2','1e1',' 1',2147483648,-2147483649,[],{}]){
  const codes=readCodes({sportMode:value},'$.set');
  assert.equal(codes[0].status,'invalid-or-conflicting');
  assert.equal(codes[0].code,undefined);
  assert.deepEqual(safeCodes(codes),codes);
 }
});
test('history consumer rejects forged status, code, duplicates and cardinality',()=>{
 const valid=readCodes({sportMode:0},'$.set');
 const wrongCode=structuredClone(valid);wrongCode[0].code=1;
 assert.equal(safeCodes(wrongCode),undefined);
 const wrongStatus=structuredClone(valid);wrongStatus[0].status='conflict';
 assert.equal(safeCodes(wrongStatus),undefined);
 const empty=structuredClone(valid);empty[0].evidence=[];
 assert.equal(safeCodes(empty),undefined);
 const excess=structuredClone(valid);excess[0].evidence=Array(4).fill(excess[0].evidence[0]);
 assert.equal(safeCodes(excess),undefined);
 assert.equal(safeCodes([valid[0],valid[0]]),undefined);
});
