import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeWorkoutReader} from '../native-workout-reader.mjs';
import {annotateTimedWorkoutOutput} from '../workout-data.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const now=()=>new Date(2026,9,8,12);
const row=(id,type=3)=>({trainingId:id,type,startTimestamp:new Date(2026,9,8,12).getTime(),title:`Session ${id}`});
const calendar=entries=>Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===7?entries:[]}));
function fixture({mobile=[],mobileFail=false,calendarFail=false,entries=[],detailFail=[]}={}){
 const paths=[];
 const reader=createNativeWorkoutReader({now,apiRead:async path=>{
  paths.push(path);
  if(path.startsWith('/mobile/')){if(mobileFail)throw Error('private-error');return{code:0,data:mobile};}
  if(path.includes('trainingCalendar')){if(calendarFail)throw Error('private-error');return{code:0,data:calendar(entries)};}
  if(detailFail.some(id=>path.endsWith(`/${id}`)))throw Error('private-error');
  return{code:0,data:path.includes('Detail/')?[{unknownField:'preserved'}]:{unknownInfo:'preserved'}};
 }});return{reader,paths};
}
function publicRun(reader){
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
 const start=source.indexOf("    case 'speediance_get_today': {");const end=source.indexOf("    case 'speediance_get_session_detail': {",start);
 assert.ok(start>=0&&end>start);
 return vm.runInNewContext(`(async args=>{switch('speediance_get_today'){${source.slice(start,end)}}})`,{
  resolveProfile:async()=> 'synthetic',readHistoryForProfile:async args=>JSON.stringify(await reader.todayReport(args[2]||'today')),
  annotateWorkoutForProfile:async raw=>annotateTimedWorkoutOutput(raw)
 });
}
test('actual today dispatch preserves completed calendar detail when mobile source fails',async()=>{
 const t=fixture({mobileFail:true,entries:[{isFinish:1,type:2,trainingId:42}]});
 const r=await publicRun(t.reader)({date:'2026-10-08'});
 assert.equal(r.sessions.length,1);assert.equal(r.sessions[0].kind,'course');assert.equal(r.sessions[0].detail[0].unknownField,'preserved');
 assert.equal(r.mobileHistoryCoverage.status,'unavailable');assert.equal(r.mobileHistoryDetailCoverage.complete,false);
 assert.equal(r.calendarCompletedHistoryCoverage.complete,true);assert.equal(r.operationStatus,'read-only');assert.equal(r.calendarReservationsChecked,false);
 assert.equal(r.dateInterpretation.basis,'runtime-local-calendar-date');assert.equal(r.dateInterpretation.accountTimezoneVerified,false);
 assert.equal(JSON.stringify(r).includes('private-error'),false);
});
test('actual today dispatch retains successful details and failed detail summary independently',async()=>{
 const t=fixture({mobile:[row(1),row(2),row(3,1)],detailFail:[2]});const r=await publicRun(t.reader)({date:'2026-10-08'});
 assert.equal(r.sessions.length,3);assert.equal(r.sessions[0].detail[0].unknownField,'preserved');assert.equal(r.sessions[2].detail[0].unknownField,'preserved');
 assert.equal(r.sessions[1].summary.training_id,2);assert.equal(r.sessions[1].detailStatus,'mobile-session-detail-unavailable');
 assert.equal(r.mobileHistoryCoverage.complete,true);assert.equal(r.mobileHistoryDetailCoverage.complete,false);assert.equal(r.mobileHistoryDetailCoverage.unresolvedSessionCount,1);
 assert.equal(t.paths.filter(path=>path.includes('trainingCalendar')).length,1);
});
test('actual today dispatch retains unsupported calendar identities without guessed detail GETs',async()=>{
 const t=fixture({entries:[{isFinish:1,type:99,trainingId:43}]});const r=await publicRun(t.reader)({date:'2026-10-08'});
 assert.equal(r.sessions[0].kind,'unsupported');assert.equal(r.unsupportedCalendarSessions.length,1);assert.equal(r.sessions[0].detailStatus,'calendar-namespace-unsupported');
 assert.equal(r.sessions[0].identityProvenance.rawCalendarType,99);assert.equal(t.paths.length,2);
 assert.equal(r.calendarCompletedHistoryCoverage.scope,'completed-calendar-course-and-ai-identities-only');assert.equal(r.uniqueSessionCount,null);
});
test('actual today dispatch retains coverage when both sources unavailable and does not invent rest day',async()=>{
 const t=fixture({mobileFail:true,calendarFail:true});const r=await publicRun(t.reader)({date:'2026-10-08'});
 assert.equal(r.sessions.length,0);assert.equal(r.mobileHistoryCoverage.complete,false);assert.equal(r.calendarCompletedHistoryCoverage.complete,false);
 assert.equal(r.mobileHistoryDetailCoverage.status,'unavailable');assert.equal(r.calendarReservationsChecked,false);assert.equal(r.uniqueSessionCount,null);
 assert.equal(t.paths.length,2);assert.equal(Object.hasOwn(r,'restDay'),false);
});
test('today retains undated summaries separately and date bounds remain strict',async()=>{
 const t=fixture({mobile:[row(1),{trainingId:2,type:10,title:'Undated'}, {...row(3),startTimestamp:new Date(2026,9,7,12).getTime()}]});
 const r=await t.reader.todayReport('2026-10-08');assert.equal(r.sessions.length,1);assert.equal(r.unscopedMobileSessions[0].summary.training_id,2);
 assert.equal(r.unscopedMobileSessions[0].summary.date,null);assert.equal(r.mobileHistoryCoverage.complete,false);assert.equal(r.mobileHistoryCoverage.excludedOutOfRangeCount,1);
 const invalid=fixture();await assert.rejects(invalid.reader.todayReport('2026-02-30'));assert.equal(invalid.paths.length,0);
});
