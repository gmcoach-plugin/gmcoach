import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createNativeWorkoutReader } from '../native-workout-reader.mjs';
const month=entry=>Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===6?[entry]:[]}));
test('actual session schema date pattern accepts ISO spelling rather than literal backslash tokens',()=>{
  const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf("    name: 'speediance_get_session_detail',");
  const end=source.indexOf("    name: 'speediance_search_exercises',",start);
  const section=source.slice(start,end);
  const startDate=section.indexOf("date: { type: 'string'");
  const property=section.slice(startDate,section.indexOf('},',startDate)+1);
  const schema=vm.runInNewContext(`({${property}})`);
  const pattern=new RegExp(schema.date.pattern);
  assert.equal(pattern.test('2026-10-08'),true);
  for(const invalid of ['2026-1-08','2026/10/08','x2026-10-08','2026-10-08x','\\dddd-\\dd-\\dd']) assert.equal(pattern.test(invalid),false);
});
test('actual public dispatch binds explicit calendar namespace and preserves raw detail',async()=>{
  const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf("    case 'speediance_get_session_detail': {");
  const end=source.indexOf("    case 'speediance_search_exercises': {",start);
  for(const [type,rawType,endpoint] of [['course',2,'courseTrainingInfoDetail'],['ai',4,'aiCourseTrainingInfoDetail']]){
    const paths=[], detail=[{completionMethod:999,finishedReps:[{finishedCount:8,time:30}]}];
    const run=vm.runInNewContext(`(async args=>{switch('speediance_get_session_detail'){${source.slice(start,end)}}})`,{
      resolveProfile:async()=> 'synthetic',readProfileConfig:async()=>({config:{deviceType:1}}),createNativeWorkoutReader,
      speedianceApiRequest:async(profile,path)=>{assert.equal(profile,'synthetic');paths.push(path);return{code:0,data:paths.length===1?month({trainingId:42,type:rawType,isFinish:1}):detail};},
      annotateWorkoutForProfile:async raw=>raw,parseCliJson:JSON.parse,
      readSessionForProfile:()=>{throw Error('Wrong legacy route');}
    });
    const result=await run({training_id:'42',type,date:'2026-10-07'});
    assert.equal(JSON.stringify(result.detail),JSON.stringify(detail));
    assert.equal(result.gmCoachSessionReadback.identityProvenance.calendarIdentityVerified,true);
    assert.equal(paths.length,2);assert.equal(paths[1],`/app/trainingInfo/${endpoint}/42`);
  }
});
test('calendar unavailable retains valid native today details and marks incomplete coverage',async()=>{
  const replies=[{code:0,data:[{trainingId:1,type:5,startTimestamp:new Date(2026,9,7,12).getTime()}]},{code:0,data:{}},{code:0,data:[{unknown:true}]},{code:1002,data:[]}];
  const result=await createNativeWorkoutReader({now:()=>new Date(2026,9,7),apiRead:async()=>replies.shift()}).today();
  assert.deepEqual(result[0].detail,[{unknown:true}]);
  assert.equal(result[0].calendarCompletedHistoryCoverage.complete,false);
});
test('empty today still discloses unavailable calendar coverage in report',async()=>{
  const replies=[{code:0,data:[]},{code:1002,data:[]}];
  const report=await createNativeWorkoutReader({now:()=>new Date(2026,9,7),apiRead:async()=>replies.shift()}).todayReport();
  assert.deepEqual(report.sessions,[]);
  assert.equal(report.calendarCompletedHistoryCoverage.complete,false);
  assert.equal(report.calendarCompletedHistoryCoverage.status,'unavailable');
});
test('mixed known and unknown mobile kinds preserve safe summaries without guessed detail GET',async()=>{
  const paths=[], replies=[{code:0,data:[{trainingId:1,type:5,startTimestamp:new Date(2026,9,7,12).getTime()},{trainingId:2,type:999,startTimestamp:new Date(2026,9,7,12).getTime()}]},
    {code:0,data:{}},{code:0,data:[{unknown:true}]},{code:0,data:month({trainingId:43,type:4,isFinish:0})}];
  const report=await createNativeWorkoutReader({now:()=>new Date(2026,9,7),apiRead:async path=>{paths.push(path);return replies.shift();}}).todayReport();
  assert.equal(report.sessions.length,2); assert.deepEqual(report.sessions[0].detail,[{unknown:true}]);
  assert.equal(report.sessions[1].detailStatus,'mobile-report-namespace-unsupported');
  assert.equal(report.mobileHistoryDetailCoverage.complete,false);
  assert.equal(report.calendarCompletedHistoryCoverage.complete,true);
  assert.equal(paths.length,4); assert.ok(paths.every(path=>!path.endsWith('/2')));
});
test('automatic mobile resolution checks calendar collisions and applies exact date before any detail',async()=>{
  for(const [calendarEntry,mobile,date,reject] of [
    [{trainingId:42,type:4,isFinish:1},[{training_id:42,kind:'program',date:'2026-10-07'}],'2026-10-07',true],
    [{trainingId:43,type:4,isFinish:0},[{training_id:42,kind:'free',date:'2026-10-06'}],'2026-10-07',true],
    [{trainingId:43,type:4,isFinish:0},[{training_id:42,kind:'free',date:'2026-10-07'}],'2026-10-07',false]
  ]){
    const paths=[];const reader=createNativeWorkoutReader({apiRead:async path=>{paths.push(path);return{code:0,data:month(calendarEntry)};}});
    if(reject) await assert.rejects(reader.resolveAutomaticSession('42',mobile,date));
    else assert.equal((await reader.resolveAutomaticSession('42',mobile,date)).type,'free');
    assert.equal(paths.length,1);assert.ok(paths[0].includes('trainingCalendar'));
  }
});
