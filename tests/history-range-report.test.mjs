import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeWorkoutReader} from '../plugin/native-workout-reader.mjs';
import {annotateTimedWorkoutOutput} from '../plugin/workout-data.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const envelope=data=>({code:0,data});
function monthData(month,entries={}) {
 const day=new Date(`${month}-01T12:00:00Z`);day.setUTCMonth(day.getUTCMonth()+1,0);
 return Array.from({length:day.getUTCDate()},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,trainingPlanList:entries[i+1]||[]}));
}
function reader({now=new Date(2026,9,5),mobile=[],months={},mobileFail=false,failMonths=[]}={}) {
 const paths=[];
 return {paths,reader:createNativeWorkoutReader({now:()=>now,apiRead:async path=>{
  paths.push(path);
  if(path.startsWith('/mobile/')) {if(mobileFail)throw Error('private');return envelope(mobile);}
  const month=new URL(`https://fixture.invalid${path}`).searchParams.get('date');
  if(failMonths.includes(month))throw Error('private');
  return envelope(months[month]??monthData(month));
 }})};
}
test('range report preserves separate mobile and calendar identity namespaces without detail GETs',async()=>{
 const t=reader({mobile:[{trainingId:77,type:3,startTimestamp:new Date(2026,9,5,12).getTime()}],months:{'2026-10':monthData('2026-10',{5:[{isFinish:1,type:2,trainingId:77},{isFinish:1,type:4,trainingId:78},{isFinish:1,type:99,trainingId:79}]})}});
 const r=await t.reader.workoutsReport(1);
 assert.equal(r.mobileSessions.length,1);assert.equal(r.calendarCompletedSessions.length,2);assert.equal(r.unsupportedCalendarSessions.length,1);
 assert.equal(r.uniqueSessionCount,null);assert.equal(r.mobileIdentityLinkageVerified,false);
 assert.equal(r.calendarCompletedSessions[0].identityProvenance.selectedIdentifierField,'trainingId');
 assert.equal(r.calendarCompletedSessions[0].detailStatus,'not-read-summary-only');assert.equal(t.paths.length,2);
});
test('range report independently preserves available sources and discloses failures',async()=>{
 for(const mobileFail of [false,true])for(const calendarFail of [false,true]){
  const t=reader({mobileFail,failMonths:calendarFail?['2026-10']:[],months:{'2026-10':monthData('2026-10',{5:[{isFinish:1,type:2,trainingId:88}]})}});
  const r=await t.reader.workoutsReport(1);
  assert.equal(r.mobileHistoryCoverage.complete,!mobileFail);assert.equal(r.calendarCompletedHistoryCoverage.complete,!calendarFail);
  assert.equal(r.calendarCompletedSessions.length,calendarFail?0:1);assert.equal(JSON.stringify(r).includes('private'),false);
 }
});
test('range report filters full calendar months across leap-day range and bounds newest months',async()=>{
 const t=reader({now:new Date(2024,2,1),months:{'2024-02':monthData('2024-02',{28:[{isFinish:1,type:2,trainingId:1}],29:[{isFinish:1,type:2,trainingId:2}]}),'2024-03':monthData('2024-03',{1:[{isFinish:1,type:4,trainingId:3}],2:[{isFinish:1,type:4,trainingId:4}]})}});
 const r=await t.reader.workoutsReport(2);assert.deepEqual(r.calendarCompletedSessions.map(x=>x.training_id),['2','3']);
 const long=reader();const result=await long.reader.workoutsReport(3650);
 assert.equal(long.paths.length,13);assert.equal(result.calendarCompletedHistoryCoverage.attemptedMonths.length,12);
 assert.ok(result.calendarCompletedHistoryCoverage.unreadMonths.length>0);assert.equal(result.calendarCompletedHistoryCoverage.complete,false);
 assert.equal(result.calendarCompletedHistoryCoverage.status,'partial');
});
test('invalid month is unavailable rather than selectively trusted; internal workouts remains mobile-only',async()=>{
 const t=reader({months:{'2026-10':[]}});const r=await t.reader.workoutsReport(1);
 assert.deepEqual(r.calendarCompletedHistoryCoverage.failedMonths,['2026-10']);
 const internal=reader();assert.deepEqual(await internal.reader.workouts(1),[]);assert.equal(internal.paths.length,1);
 for(const days of [0,3651,1.5,'1'])await assert.rejects(internal.reader.workoutsReport(days),TypeError);
});
test('range report excludes undated and neighbouring mobile rows with exact coverage disclosure',async()=>{
 const dated=(id,day)=>({trainingId:id,type:3,startTimestamp:new Date(2026,9,day,12).getTime()});
 const t=reader({mobile:[dated(1,4),dated(2,5),dated(3,6),{trainingId:4,type:3}]});
 const r=await t.reader.workoutsReport(1);
 assert.deepEqual(r.mobileSessions.map(row=>row.training_id),[2]);
 assert.equal(r.mobileHistoryCoverage.excludedOutOfRangeCount,2);
 assert.equal(r.mobileHistoryCoverage.undatedExcludedCount,1);
 assert.equal(r.unscopedMobileSessions.length,1);
 assert.equal(r.unscopedMobileSessions[0].scopeStatus,'date-unresolved-outside-scoped-count');
 assert.equal(r.unscopedMobileSessions[0].summary.training_id,4);
 assert.equal(r.unscopedMobileSessions[0].summary.date,null);
 assert.equal(r.unscopedMobileSessions[0].summary.identityProvenance.selectedIdentifierField,'trainingId');
 assert.equal(r.unscopedMobileSessions[0].summary.identityProvenance.reportedTrainingId,4);
 assert.equal(r.mobileHistoryCoverage.complete,false);assert.equal(r.mobileHistoryCoverage.status,'partial');
 assert.deepEqual(r.mobileHistoryCoverage.observedDates,['2026-10-05']);
 assert.deepEqual(r.mobileHistoryCoverage.selectedRange,{startDate:'2026-10-05',endDateExclusive:'2026-10-06'});
});
test('actual public list dispatch preserves empty and populated report annotation and read-only marker',async()=>{
 const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
 const start=source.indexOf("    case 'speediance_list_workouts': {");const end=source.indexOf("    case 'speediance_check_connection': {",start);
 assert.ok(start>=0 && end>start,'actual public case extraction boundaries');
 for(const hasData of [false,true]){
  const t=reader({months:{'2026-10':monthData('2026-10',hasData?{5:[{isFinish:1,type:2,trainingId:99}]}:{})}});
  const run=vm.runInNewContext(`(async args=>{switch('speediance_list_workouts'){${source.slice(start,end)}}})`,{
   resolveProfile:async()=> 'synthetic',readProfileConfig:async()=>({config:{deviceType:1}}),
   createNativeWorkoutReader:()=>t.reader,speedianceApiRequest:()=>{throw Error('unexpected');},
   annotateWorkoutForProfile:async raw=>annotateTimedWorkoutOutput(raw),
   markReadOnlyProgramResult:r=>({...r,operationStatus:'read-only',programCreatedByThisCall:false})
  });
  const r=await run({days:1});assert.equal(r.operationStatus,'read-only');assert.equal(r.programCreatedByThisCall,false);
  assert.equal(r.calendarCompletedSessions.length,hasData?1:0);assert.equal(r.dataKind,'recorded-session-history');assert.equal(r.uniqueSessionCount,null);
 }
});
