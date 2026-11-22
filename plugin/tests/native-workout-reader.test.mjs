import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeWorkoutReader } from '../native-workout-reader.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { annotateTimedWorkoutOutput } from '../workout-data.mjs';

test('public today dispatch distinguishes recorded history from calendar reservations', async () => {
  const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf("    case 'speediance_get_today': {");
  const end=source.indexOf("    case 'speediance_get_session_detail': {",start);
  for (const sessions of [[], [{training_id:'123',kind:'free'}], [{training_id:'123',kind:'free', detail:[{unit:'seconds',durationSeconds:30}]}]]) {
    const calls=[];
    const run=vm.runInNewContext(`(async args=>{switch('speediance_get_today'){${source.slice(start,end)}}})`,{
      resolveProfile:async()=> 'synthetic',
      readHistoryForProfile:async(args,profile)=>{calls.push({args:[...args],profile});return JSON.stringify(sessions);},
      annotateWorkoutForProfile:async value=>annotateTimedWorkoutOutput(value)
    });
    const result=await run({date:'2026-10-06'});
    assert.equal(result.dataKind,'recorded-session-history');
    assert.equal(result.calendarReservationsChecked,false);
    assert.equal(Array.isArray(result.sessions),true);
    assert.equal(JSON.stringify(result.sessions),JSON.stringify(sessions));
    const expected=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(sessions)));
    if (sessions[0]?.detail) assert.ok(result.gmCoachTimeInterpretation?.timedExercises.length > 0);
    for (const key of ['gmCoachTimeInterpretation','gmCoachSessionSummary']) assert.equal(JSON.stringify(result[key]),JSON.stringify(expected[key]));
    assert.equal(result.operationStatus,'read-only');
    assert.deepEqual(calls,[{args:['today','--date','2026-10-06','--json'],profile:'synthetic'}]);
    await assert.rejects(run({date:'2026-02-30'})); assert.equal(calls.length,1);
  }
});

const now = () => new Date(2026, 9, 5, 17, 30);
const envelope = data => ({ code: 0, data });
function mock(replies) {
  const paths = [];
  return { paths, apiRead: async path => {
    paths.push(path);
    if (path.includes('/trainingCalendar/monthNew') && !replies.length) {
      const month = new URL(`https://fixture.invalid${path}`).searchParams.get('date');
      const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth()+1,0);
      return envelope(Array.from({length:date.getUTCDate()},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,trainingPlanList:[]})));
    }
    const response = replies.shift(); if (response instanceof Error) throw response; return response;
  } };
}
function row(id, day, type = 5) { return { trainingId: id, type, startTimestamp: new Date(2026, 9, day, 12).getTime(), totalCapacity: 100 }; }
test('one invalid mobile record retains valid completed summaries with partial coverage', async () => {
  const valid=row(42,5);
  const reader=createNativeWorkoutReader({...mock([envelope([valid,{title:'missing identity'}])]),now});
  const report=await reader.workoutsReport(1);
  assert.equal(report.mobileSessions.length,1);
  assert.equal(report.mobileSessions[0].training_id,42);
  assert.equal(report.mobileHistoryCoverage.status,'partial');
  assert.equal(report.mobileHistoryCoverage.complete,false);
  assert.equal(report.mobileHistoryCoverage.rejectedRecordCount,1);
});
test('boolean health-import marker is excluded without treating imports as missing machine identities',async()=>{
 const valid=row(42,5);
 const imported={belongUserHealth:true,startTime:'2026-10-05 12:00:00',startTimestamp:new Date(2026,9,5,12).getTime()};
 const reader=createNativeWorkoutReader({...mock([envelope([valid,imported])]),now});
 const report=await reader.workoutsReport(1);
 assert.equal(report.mobileSessions.length,1);
 assert.equal(report.mobileHistoryCoverage.rejectedRecordCount,0);
 assert.equal(report.mobileHistoryCoverage.status,'read');
 assert.equal(report.mobileHistoryCoverage.scope,'returned-filtered-summary-subset');
 assert.equal(Object.hasOwn(report,'importedActivities'),false);
});
test('manual history list and today preserve summaries without wrong namespace GETs', async () => {
  const raw={...row(1,5,10),title:'Manual',trainingTime:30.5,calorie:0};
  const t=mock([envelope([raw]),envelope([raw])]); const reader=createNativeWorkoutReader({...t,now});
  const list=await reader.workouts(1), today=await reader.today();
  assert.equal(list[0].kind,'manual'); assert.deepEqual(list[0].reportedMetrics,{trainingTime:30.5,calorie:0});
  assert.deepEqual(today[0].summary,list[0]); assert.equal(today[0].detailStatus,'not-stored-by-speediance');
  assert.equal(Object.hasOwn(today[0],'detail'),false); assert.equal(t.paths.length,3);
  assert.ok(t.paths.filter(path=>!path.includes('trainingCalendar')).every(path=>path.startsWith('/mobile/v2/report/userTrainingDataRecord?')));
  for (const extra of [{id:2},{calorie:-1},{type:10.5}]) {
    const bad=mock([envelope([{...raw,...extra}])]); const report=await createNativeWorkoutReader({...bad,now}).todayReport(); assert.equal(report.mobileHistoryCoverage.complete,false); assert.equal(report.mobileHistoryCoverage.status,'unavailable'); assert.deepEqual(report.sessions,[]); assert.equal(bad.paths.length,2); assert.ok(bad.paths[1].includes('trainingCalendar'));
  }
});
test('actual downstream annotation preserves manual summaries without manufactured dose or tonnage', async () => {
  const raw={...row(1,5,10),title:'Manual',trainingTime:30.5,calorie:0};
  for (const operation of ['workouts','today']) {
    const t=mock([envelope([raw])]), reader=createNativeWorkoutReader({...t,now});
    const original=operation==='workouts'?await reader.workouts(1):await reader.today();
    const annotated=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(original)));
    assert.deepEqual(annotated,original);
    const summary=operation==='workouts'?annotated[0]:annotated[0].summary;
    assert.deepEqual(summary.reportedMetrics,{trainingTime:30.5,calorie:0});
    for (const key of ['duration_secs','calories','volume']) assert.equal(summary[key],null);
    for (const item of [annotated,annotated[0],summary]) {
      for (const key of ['gmCoachSessionSummary','gmCoachTimeInterpretation','exercises','sets','totalLiftedVolume','tonnage']) assert.equal(Object.hasOwn(item,key),false);
    }
    assert.equal(summary.metricUnitsVerified,false); assert.equal(summary.exerciseDetailAvailable,false);
  }
});
test('confirmed history type routing never turns course AI or unknown into Free Lift', async () => {
  for (const type of [1,6,7,3,5]) {
    const t=mock([envelope([row(1,5,type)]),envelope({}),envelope([])]);
    const result=await createNativeWorkoutReader({...t,now}).today();
    assert.equal(result[0].kind,[1,6,7].includes(type)?'free':'program');
    assert.ok(t.paths[1].includes([1,6,7].includes(type)?'/freeTraining/':'/cttTrainingInfo/'));
  }
  for (const type of [2,4,9]) {
    const t=mock([envelope([row(1,5,type)])]); const result=await createNativeWorkoutReader({...t,now}).today();
    assert.equal(result[0].detailStatus,'namespace-not-supported-by-reader'); assert.equal(t.paths.length,2);
  }
  for (const type of [8,11,999]) {
    const t=mock([envelope([row(1,5,type)])]);
    const result=await createNativeWorkoutReader({...t,now}).today();
    assert.equal(result[0].detailStatus,'mobile-report-namespace-unsupported'); assert.equal(t.paths.length,2);
  }
});

test('native workouts uses the pinned local midnight tomorrow-minus-days window', async () => {
  const transport = mock([envelope([])]);
  assert.deepEqual(await createNativeWorkoutReader({ ...transport, now }).workouts(3), []);
  assert.deepEqual(transport.paths, ['/mobile/v2/report/userTrainingDataRecord?startDate=2026-10-03&endDate=2026-10-06']);
});

test('native explicit namespaces use exactly two sequential GETs and preserve payloads and int64 ids', async () => {
  for (const [type, infoName, detailName] of [['program', 'cttTrainingInfo', 'cttTrainingInfoDetail'], ['free', 'freeTraining', 'freeTrainingDetail']]) {
    const info = { unknownFutureField: { deep: [1, 2] } };
    const detail = [];
    const transport = mock([envelope(info), envelope(detail)]);
    const id = '9223372036854775807';
    const result = await createNativeWorkoutReader(transport).session(id, type);
    assert.deepEqual(result, { training_id: id, kind: type, info, detail });
    assert.equal(result.info, info);
    assert.equal(result.detail, detail);
    assert.deepEqual(transport.paths, [`/app/trainingInfo/${infoName}/${id}`, `/app/trainingInfo/${detailName}/${id}`]);
  }
});

test('native today filters neighbouring and undated records, dispatches known kinds without fallback', async () => {
  const transport = mock([envelope([row(1, 4), row(2, 5, 5), row(3, 5, 1), { trainingId: 4, type: 5 }]), envelope({ a: 1 }), envelope([]), envelope({ b: 2 }), envelope([])]);
  const result = await createNativeWorkoutReader({ ...transport, now }).today();
  assert.deepEqual(result.map(item => [item.training_id, item.kind]), [['2', 'program'], ['3', 'free']]);
  assert.equal(transport.paths.length, 6);
  assert.equal(transport.paths[0], '/mobile/v2/report/userTrainingDataRecord?startDate=2026-10-05&endDate=2026-10-06');
  for (const item of result) {
    assert.equal(item.summary.training_id, Number(item.training_id));
    assert.equal(item.identityProvenance, item.summary.identityProvenance);
    assert.equal(item.identityProvenance.calendarIdentityVerified, false);
    assert.equal(item.identityProvenance.detailNamespaceVerified, false);
  }
});

test('today retains fallback and dual identities beside untouched raw detail without course AI probing', async () => {
  const records = [{ ...row(7, 5, 5), id: 99 }, { ...row(0, 5, 1), id: 8 }, row(9, 5, 4), row(10, 5, 2)];
  const detail = [{ completionMethod: 999, countType: 2, finishedReps: [{ finishedCount: 8, time: 30, trainingInfoDetail: { weights: [1, 2], unknown: true } }] }];
  const t = mock([envelope(records), envelope({ unknown: true }), envelope(detail), envelope({}), envelope(detail)]);
  const result = await createNativeWorkoutReader({ ...t, now }).today();
  assert.equal(result[0].detail, detail);
  assert.equal(result[1].detail, detail);
  assert.equal(result[0].identityProvenance.reportedRecordId, 99);
  assert.equal(result[0].identityProvenance.selectedIdentifierField, 'trainingId');
  assert.equal(result[1].identityProvenance.selectedIdentifierField, 'id');
  for (const item of result.slice(2)) {
    assert.equal(item.detailAvailable, false);
    assert.equal(item.summary.identityProvenance.calendarIdentityVerified, false);
  }
  assert.equal(t.paths.length, 6);
  assert.ok(t.paths.every(path => !path.includes('aiCourse') && !path.includes('courseTraining')));
});

test('native yesterday and explicit valid dates use exact day windows', async () => {
  for (const [date, start, end] of [['yesterday', '2026-10-04', '2026-10-05'], ['2024-02-29', '2024-02-29', '2024-03-01']]) {
    const transport = mock([envelope([])]);
    await createNativeWorkoutReader({ ...transport, now }).today(date);
    assert.equal(transport.paths[0], `/mobile/v2/report/userTrainingDataRecord?startDate=${start}&endDate=${end}`);
  }
});

test('native malformed inputs reject before API', async () => {
  const transport = mock([]);
  const reader = createNativeWorkoutReader({ ...transport, now });
  for (const value of [0, -1, 1.5, '3', 3651]) await assert.rejects(reader.workouts(value), TypeError);
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', 'bad', 42]) await assert.rejects(reader.today(value), TypeError);
  for (const value of ['0', '-1', '01', '9223372036854775808', '12.5', 12]) await assert.rejects(reader.session(value, 'free'), TypeError);
  await assert.rejects(reader.session('1', 'auto'), TypeError);
  assert.deepEqual(transport.paths, []);
});

test('native history never disguises failure or malformed data as empty history', async () => {
  for (const reply of [{ code: 91, data: [] }, { code: 0 }, { code: 0, data: null }, { code: 0, data: {} }, new Error('failure')]) {
    const transport = mock([reply]);
    await assert.rejects(createNativeWorkoutReader({ ...transport, now }).workouts(1));
    assert.equal(transport.paths.length, 1);
  }
});

test('unknown selected namespace remains summary-only while known detail is retained', async () => {
  const transport = mock([envelope([row(1, 5, 0), row(2, 5, 5)]),envelope({}),envelope([])]);
  const result=await createNativeWorkoutReader({ ...transport, now }).today();
  assert.equal(result[0].detailStatus,'mobile-report-namespace-unsupported');
  assert.equal(result[1].kind,'program');
  assert.equal(transport.paths.length, 4);
  assert.ok(transport.paths.every(path=>!path.endsWith('/1')));
});

test('detail failure stops selected namespace without probing or replay', async () => {
  const transport = mock([envelope({ id: 1 }), { code: 90, data: [] }]);
  await assert.rejects(createNativeWorkoutReader(transport).session('1', 'program'));
  assert.equal(transport.paths.length, 2);
});

test('request-local imports reuse one mobile GET and preserve machine subset coverage',async()=>{
 const imported={trainingId:null,belongUserHealth:1,title:'Walk',startTime:'2026-08-20 12:00:00',trainingTime:632,calorie:30};
 for(const rows of [[imported],[imported,{...imported,trainingId:8000,type:5},{trainingId:42,type:5,startTimestamp:1787227200,totalCapacity:0}]]){
 const calls=[];const reader=createNativeWorkoutReader({now:()=>new Date('2026-08-20T12:00:00'),apiRead:async path=>{calls.push(path);if(path.startsWith('/mobile/v2/report/userTrainingDataRecord'))return{code:0,data:rows};const month=new URL('https://fixture.invalid'+path).searchParams.get('date');return{code:0,data:Array.from({length:31},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,trainingPlanList:[]}))};}});
 const got=await reader.workoutsReport(1,{includeImportedActivities:true});assert.equal(calls.filter(x=>x.startsWith('/mobile/v2/report/userTrainingDataRecord')).length,1);assert.equal(got.importedActivities.rows[0].trainingTimeSeconds,632);assert.equal(got.importedActivities.rows[0].calorieUnit,'unknown');assert.equal(got.importedActivities.status,'partial');assert.equal(got.mobileHistoryCoverage.complete,true);assert.equal(got.mobileHistoryCoverage.status,'read');assert.equal(got.mobileHistoryCoverage.excludedImportedCount,rows.length===1?1:2);assert.equal(got.mobileSessions.length,rows.length===1?0:1);assert.equal(got.importedActivities.coverage.upstreamCompleteness,'unknown');
 const hidden=await reader.workoutsReport(1);assert.equal(Object.hasOwn(hidden,'importedActivities'),false);assert.equal(Object.hasOwn(hidden.mobileHistoryCoverage,'excludedImportedCount'),false);assert.doesNotMatch(JSON.stringify(hidden),/import|belongUserHealth/i);
 }
});


test('authorized imports survive invalid unclassified machine row without certifying history',async()=>{
 const reader=createNativeWorkoutReader({now:()=>new Date('2026-08-20T12:00:00'),apiRead:async path=>({code:0,data:path.startsWith('/mobile/v2/report/userTrainingDataRecord')?[{trainingId:null,title:'unclassified'},{trainingId:null,belongUserHealth:1,startTime:'2026-08-20 12:00:00',trainingTime:632}]:[]})});
 const got=await reader.workoutsReport(1,{includeImportedActivities:true});assert.equal(got.importedActivities.rows.length,1);assert.equal(got.importedActivities.coverage.unknownMarkerCount,1);assert.equal(got.mobileHistoryCoverage.complete,false);assert.equal(got.mobileHistoryCoverage.status,'unavailable');assert.equal(got.mobileHistoryCoverage.excludedImportedCount,1);
});


test('today and exact-date coverage keep generic uncertainty after filtered source without activity consent',async()=>{
 for(const mixed of [false,true])for(const date of ['today','2026-08-20']){
 const imported={trainingId:null,belongUserHealth:1,title:'Walk',startTime:'2026-08-20 12:00:00',trainingTime:632};
 const reader=createNativeWorkoutReader({now:()=>new Date('2026-08-20T12:00:00'),apiRead:async path=>({code:0,data:path.startsWith('/mobile/v2/report/userTrainingDataRecord')?[imported,...(mixed?[{trainingId:42,type:5,startTimestamp:1787227200,totalCapacity:0}]:[])]:[]})});
 const got=await reader.todayReport(date);assert.equal(got.mobileHistoryCoverage.complete,true);assert.equal(got.mobileHistoryCoverage.status,'read');assert.equal(got.mobileHistoryDetailCoverage.complete,true);assert.equal(got.mobileHistoryDetailCoverage.status,'available-for-returned-mobile-sessions');assert.equal(Object.hasOwn(got.mobileHistoryCoverage,'excludedImportedCount'),false);assert.doesNotMatch(JSON.stringify(got),/belongUserHealth|imported|Walk|632/);
 }
});
