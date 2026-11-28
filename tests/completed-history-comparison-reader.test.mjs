import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletedHistoryComparison} from '../plugin/completed-history-comparison-reader.mjs';
const selection=(id,date)=>({training_id:id,type:'program',date});
test('calendar comparison reuses one verified monthly read for both selected sessions',async()=>{
 const calls=[];let checks=0;
 const month=Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===7||i===8?[{trainingId:i===7?41:42,type:2,isFinish:1}]:[]}));
 const result=await readCompletedHistoryComparison({sessionA:{training_id:'41',type:'course',date:'2026-10-08'},sessionB:{training_id:'42',type:'course',date:'2026-10-09'},groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{checks++;},apiRead:async path=>{
  calls.push(path);
  return {code:0,data:path.includes('monthNew')?month:path.includes('InfoDetail')?[{actionLibraryGroupId:116,actionLibraryId:10,completionMethod:'1',countType:'2',finishedReps:[{finishedCount:path.endsWith('/41')?8:12,leftRight:0}]}]:{}};
 }});
 assert.equal(calls.filter(path=>path.includes('monthNew')).length,1);
 assert.equal(calls.filter(path=>path.includes('InfoDetail')).length,2);
 assert.deepEqual(result.coverage.map(row=>row.status),['scanned','scanned']);
 assert.ok(result.changes.some(row=>row.metric==='reps'&&row.deltaBMinusA===4));
 assert.ok(checks>=calls.length*2+3);
});
test('real native summary and completed exercise normalizers produce observed series changes',async()=>{
 const paths=[];
 const result=await readCompletedHistoryComparison({sessionA:selection('41','2026-10-08'),sessionB:selection('42','2026-10-09'),groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{},apiRead:async path=>{
  paths.push(path);let data;
  if(path.includes('userTrainingDataRecord')){const date=path.includes('2026-10-08')?'2026-10-08':'2026-10-09';data=[{trainingId:date.endsWith('08')?41:42,type:5,startTimestamp:new Date(date+'T12:00:00').getTime()}];}
  else if(path.includes('InfoDetail'))data=[{actionLibraryGroupId:116,actionLibraryId:10,completionMethod:'1',countType:'2',finishedReps:[{finishedCount:path.endsWith('/41')?8:12,leftRight:0}]}];
  else data={};return {code:0,data};
 }});
 assert.equal(result.coverage.length,2);assert.equal(result.coverage[0].matchedExerciseOccurrences,1);
 assert.ok(result.changes.some(row=>row.metric==='reps'&&row.deltaBMinusA===4));
 assert.equal(result.physiologicalProgressionConfirmed,false);
 assert.equal(paths.filter(path=>path.includes('userTrainingDataRecord')).length,2);
});
test('initial and postresponse drift checks throw instead of returning partial comparison',async()=>{
 let drift=false,calls=0;
 await assert.rejects(readCompletedHistoryComparison({sessionA:selection('41','2026-10-08'),sessionB:selection('42','2026-10-09'),groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{if(drift)throw new Error('account drift');},apiRead:async()=>{calls++;drift=true;return {code:0,data:[]};}}),/account drift/);
 assert.equal(calls,1);
});
test('actual scan 201 and 1000 sets composes with comparison bounds and explicitly reports omitted sets',async()=>{
 for(const count of [201,1000]){
  const result=await readCompletedHistoryComparison({sessionA:selection('41','2026-10-08'),sessionB:selection('42','2026-10-09'),groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{},apiRead:async path=>{
   let data={};if(path.includes('userTrainingDataRecord')){const date=path.includes('2026-10-08')?'2026-10-08':'2026-10-09';data=[{trainingId:date.endsWith('08')?41:42,type:5,startTimestamp:new Date(date+'T12:00:00').getTime()}];}
   else if(path.includes('InfoDetail'))data=[{actionLibraryGroupId:116,actionLibraryId:10,completionMethod:'1',countType:'2',finishedReps:Array.from({length:count},()=>({finishedCount:8,leftRight:0}))}];
   return {code:0,data};
  }});
  assert.equal(result.partial,true);assert.ok(result.coverage.some(row=>row.scannerOmittedSetCount===count-200));assert.ok(result.changes.length<=64);
 }
});
test('actual target30 elapsed20 compares elapsed without inferring work dose',async()=>{
 const result=await readCompletedHistoryComparison({sessionA:selection('41','2026-10-08'),sessionB:selection('42','2026-10-09'),groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{},apiRead:async path=>{
  let data={};if(path.includes('userTrainingDataRecord')){const date=path.includes('2026-10-08')?'2026-10-08':'2026-10-09';data=[{trainingId:date.endsWith('08')?41:42,type:5,startTimestamp:new Date(date+'T12:00:00').getTime()}];}
  else if(path.includes('InfoDetail'))data=[{actionLibraryGroupId:116,actionLibraryId:10,completionMethod:'2',countType:'1',finishedReps:[{finishedCount:20,targetCount:30,time:20,leftRight:0}]}];return {code:0,data};
 }});
 const elapsed=result.changes.find(row=>row.metric==='elapsedSeconds');assert.equal(elapsed.a,20);assert.equal(elapsed.interpretation,'reported-elapsed-time-not-confirmed-work-dose');assert.ok(!result.changes.some(row=>row.metric==='durationSeconds'));
});


test('comparison reader uses only current userinfo info route and preserves conflicting-unit qualification',async()=>{
 const days=['2026-10-08','2026-10-09'];
 const expected=['/app/userinfo/info',...days.map(date=>`/mobile/v2/report/userTrainingDataRecord?startDate=${date}&endDate=2026-10-${date.endsWith('08')?'09':'10'}`)];
 for(const scenario of [{data:{unit:0},unit:'kg'},{data:{unit:0,weightUnit:0},unit:'unknown'},{code:12,data:{},unit:'unknown'}]){
  const calls=[];let identityChecks=0;
  const result=await readCompletedHistoryComparison({sessionA:selection('41',days[0]),sessionB:selection('42',days[1]),groupId:116,actionLibraryId:10,deviceType:1,now:new Date('2026-10-11T12:00:00Z'),assertCurrent:async()=>{identityChecks++;},apiRead:async path=>{
   calls.push(path);assert.notEqual(path,'/app/userinfo','unsupported bare endpoint must never be retried');assert.ok(expected.includes(path),'unexpected read '+path);
   if(path==='/app/userinfo/info')return {code:scenario.code??0,data:scenario.data};
   return {code:0,data:[]};
  }});
  assert.deepEqual(calls,expected);assert.equal(calls.filter(path=>path==='/app/userinfo/info').length,1);assert.equal(calls.filter(path=>path==='/app/userinfo').length,0);
  assert.equal(result.loadUnitEvidence.currentAccountUnit,scenario.unit);assert.equal(result.loadUnitEvidence.historicUnitVerified,false);assert.equal(result.operationStatus,'read-only');assert.ok(identityChecks>=calls.length*2);
  if(scenario.data.weightUnit!==undefined)assert.equal(result.loadUnitEvidence.inspection.status,'conflicting-recognized-account-unit-fields');
  if(scenario.code===12)assert.equal(result.loadUnitEvidence.inspection.status,'api-unavailable');
 }
});
