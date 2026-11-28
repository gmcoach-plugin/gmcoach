import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createNativeWorkoutReader} from '../plugin/native-workout-reader.mjs';
import {scanCompletedExerciseHistory} from '../plugin/completed-exercise-history.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
function harness(mobileFails=false) {
 const paths=[];let locks=0;
 const start=source.indexOf("    case 'gm_coach_get_athlete_snapshot': {");const end=source.indexOf("    case 'gm_coach_save_training_profile':",start);
 const run=vm.runInNewContext(`(async args=>{switch('gm_coach_get_athlete_snapshot'){${source.slice(start,end)}}})`,{
  resolveProfile:async()=> 'synthetic',withProfileMutationLock:async(_p,fn)=>{locks++;return fn();},readTrainingProfileRecord:async()=>null,
  readProfileConfig:async()=>({config:{deviceType:1}}),createNativeWorkoutReader,
  speedianceApiRequest:async(_p,path)=>{paths.push(path);if(path.startsWith('/mobile/')){if(mobileFails)throw Error('Unavailable');return{code:0,data:[]};}
   const month=new URL(`https://fixture.invalid${path}`).searchParams.get('date');const last=new Date(`${month}-01T12:00:00Z`);last.setUTCMonth(last.getUTCMonth()+1,0);
   return{code:0,data:Array.from({length:last.getUTCDate()},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===new Date().getDate()-1?[{trainingId:42,type:4,isFinish:1}]:[]}))};},
  annotateWorkoutForProfile:async raw=>raw,parseCliJson:JSON.parse,readCoachingMemory:async()=>({}),activeCoachingMemory:()=>({facts:[],digest:'synthetic'}),buildCoachAthleteContext:()=>({savedProfile:false})
 });return{run,paths,get locks(){return locks;}};
}
test('actual athlete snapshot retains separate completed calendar coverage and health consent distinction',async()=>{
 const h=harness();const result=await h.run({consent_to_read_history:true,days:1});
 assert.equal(result.historySource,'separate-mobile-report-and-completed-calendar-sources');
 assert.equal(result.history.calendarCompletedSessions.length,1);assert.equal(result.history.uniqueSessionCount,null);
 assert.equal(result.history.mobileIdentityLinkageVerified,false);assert.equal(result.health.status,'not-read');assert.equal(result.recovery.separateConsentRequired,true);
 assert.ok(h.paths.every(path=>!path.includes('TrainingInfo')&&!path.includes('health')));
});
test('actual athlete history consent fails before profile or source reads',async()=>{
 const h=harness();await assert.rejects(h.run({days:1}),/zgody/);assert.equal(h.paths.length,0);assert.equal(h.locks,0);
});
test('actual athlete snapshot preserves mobile unavailable instead of claiming empty full history',async()=>{
 const h=harness(true);const result=await h.run({consent_to_read_history:true,days:1});
 assert.equal(result.history.mobileHistoryCoverage.status,'unavailable');assert.equal(result.history.mobileHistoryCoverage.complete,false);
 assert.equal(result.history.calendarCompletedHistoryCoverage.complete,true);assert.equal(result.history.uniqueSessionCount,null);
});
test('actual exercise-history scan block routes calendar course/AI independently with exact date evidence',async()=>{
 const begin=source.indexOf('        let sessionHistory;',source.indexOf("case 'gm_coach_get_exercise_history':"));
 const finish=source.indexOf('        return {',begin);assert.ok(begin>0&&finish>begin);
 const today=new Date();const date=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const paths=[];const entries=[{trainingId:42,type:2,isFinish:1},{trainingId:43,type:4,isFinish:1}];
 const run=vm.runInNewContext(`(async()=>{${source.slice(begin,finish)} return sessionHistory;})`,{
  includeSessions:true,profile:'synthetic',sessionDays:1,sessionLimit:2,exercise:{id:77},Date,
  createNativeWorkoutReader,scanCompletedExerciseHistory,readProfileConfig:async()=>({config:{deviceType:1}}),getAccountWeightUnit:async()=> 'kg',
  speedianceApiRequest:async(_profile,path)=>{
   paths.push(path);if(path.startsWith('/mobile/'))return{code:0,data:[]};
   if(path.includes('monthNew')){const month=date.slice(0,7),last=new Date(`${month}-01T12:00:00Z`);last.setUTCMonth(last.getUTCMonth()+1,0);return{code:0,data:Array.from({length:last.getUTCDate()},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===today.getDate()-1?entries:[]}))};}
   return{code:0,data:[{opaque:'unsupported-detail-schema'}]};
  },readSessionForProfile:()=>{throw Error('Must not route calendar through mobile session reader');}
 });
 const result=await run();assert.equal(result.calendarSessionHistory.scannedSessionCount,2);assert.equal(result.calendarSessionHistory.partial,true);
 assert.equal(result.sourceCoverage.calendarDetailsScanned,true);assert.equal(result.sourceCoverage.uniqueSessionCount,null);
 assert.ok(paths.includes('/app/trainingInfo/courseTrainingInfoDetail/42'));assert.ok(paths.includes('/app/trainingInfo/aiCourseTrainingInfoDetail/43'));
 assert.ok(!paths.some(path=>path.includes('cttTraining')||path.includes('freeTraining')));
 assert.equal(result.calendarSessionHistory.matches.length,0);
});
test('calendar scanner refuses response date/namespace evidence drift before normalization',async()=>{
 const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const provenance={calendarIdentityVerified:true,sourceEndpoint:'/app/v5/trainingCalendar/monthNew'};
 for(const mutation of [{date:'2020-01-01'},{kind:'program'},{identityProvenance:{calendarIdentityVerified:false}}]) {
  const result=await scanCompletedExerciseHistory({summaries:[{training_id:'42',kind:'course',date,identityProvenance:provenance}],groupId:77,days:1,calendarCompletedOnly:true,
   fetchSession:async()=>({payload:{training_id:'42',kind:'course',date,identityProvenance:provenance,...mutation,detail:[]}})});
  assert.equal(result.matches.length,0);assert.ok(result.diagnostics.some(item=>item.reason==='session-response-identity-mismatch'));
 }
});
test('positive course and AI finished sets preserve exact dated group/variant evidence',async()=>{
 const now=new Date('2026-10-08T12:00:00Z'),date='2026-10-07';
 const identityProvenance={calendarIdentityVerified:true,sourceEndpoint:'/app/v5/trainingCalendar/monthNew'};
 for(const kind of ['course','ai']) {
  const calls=[],paths=[];
  const reader=createNativeWorkoutReader({now:()=>now,apiRead:async path=>{
   paths.push(path);
   if(path.includes('monthNew'))return{code:0,data:Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===6?[{trainingId:42,type:kind==='course'?2:4,isFinish:1}]:[]}))};
   return{code:0,data:[{actionLibraryGroupId:116,actionLibraryId:7,actionLibraryName:'Bench',completionMethod:1,countType:2,finishedReps:[{finishedCount:8,targetCount:10,time:24,trainingInfoDetail:{weights:[60,61]}}]}]};
  }});
  const result=await scanCompletedExerciseHistory({now,days:7,groupId:116,actionLibraryId:7,displayUnit:'kg',calendarCompletedOnly:true,
   summaries:[{training_id:'42',kind,date,identityProvenance}],fetchSession:async descriptor=>{calls.push(descriptor);return{source:'validated-calendar-detail',payload:await reader.calendarSession(descriptor.trainingId,descriptor.type,descriptor.date)};}});
  assert.deepEqual(calls,[{trainingId:'42',type:kind,date}]);assert.equal(result.matches.length,1);
  const match=result.matches[0];assert.equal(match.date,date);assert.equal(match.sessionType,kind);assert.equal(match.actionLibraryId,7);
  assert.equal(match.sets[0].unit,'reps');assert.equal(match.sets[0].reps,8);assert.equal(match.evidence.dateSource,'validated-completed-calendar.date');assert.equal(match.evidence.inferredRir,false);
  assert.equal(paths.at(-1),`/app/trainingInfo/${kind==='course'?'courseTrainingInfoDetail':'aiCourseTrainingInfoDetail'}/42`);
 }
});
test('actual scanner UTF-8 byte limit rejects multibyte payload before JSON parsing',async()=>{
 const payload='{"training_id":"42","kind":"program","oversized":"'+'ą'.repeat(2_000_001)+'"}';
 assert.ok(payload.length<4_000_000);assert.ok(Buffer.byteLength(payload,'utf8')>4_000_000);
 const result=await scanCompletedExerciseHistory({now:new Date('2026-10-08T12:00:00Z'),days:7,groupId:116,
  summaries:[{training_id:'42',kind:'program',date:'2026-10-07'}],fetchSession:async()=>({payload})});
 assert.equal(result.matches.length,0);assert.equal(result.errorCount,1);assert.equal(result.partial,true);
 assert.ok(result.diagnostics.some(item=>item.reason==='session-read-or-normalization-failed'));
});
test('actual exercise scan shares count, wall-clock and returned-set budgets across sources',async()=>{
 const begin=source.indexOf('        let sessionHistory;',source.indexOf("case 'gm_coach_get_exercise_history':")),finish=source.indexOf('        return {',begin);
 const coverage={complete:true};
 for(const limit of ['count','time','sets','remaining']) {
  let calls=0,detailReads=0;const clock=[1000,limit==='time'?46000:1000];
  const result=await vm.runInNewContext(`(async()=>{${source.slice(begin,finish)}return sessionHistory;})`,{
   includeSessions:true,profile:'synthetic',sessionDays:1,sessionLimit:2,exercise:{id:116},Date:{now:()=>clock.shift()??1000},
   readProfileConfig:async()=>({config:{deviceType:1}}),getAccountWeightUnit:async()=> 'kg',
   createNativeWorkoutReader:()=>({workoutsReport:async()=>({mobileSessions:[],calendarCompletedSessions:[{}],unsupportedCalendarSessions:[],mobileHistoryCoverage:coverage,calendarCompletedHistoryCoverage:coverage}),calendarSession:async()=>{detailReads++;return{};}}),
   scanCompletedExerciseHistory:async args=>{calls++;if(calls===1)return{scannedSessionCount:limit==='count'?2:1,matches:limit==='sets'?[{sets:Array(2000).fill({})}]:[{sets:[{}]}],partial:false};assert.equal(args.maxSessions,1);assert.equal(args.maxTotalSets,1999);assert.equal(args.maxScanWallMs,45000);await args.fetchSession({trainingId:'42',type:'course',date:'2026-10-07'});return{scannedSessionCount:1,matches:[],partial:false};},
   readSessionForProfile:()=>{throw Error('No mobile details in budget fixture');}
  })();
  assert.equal(calls,limit==='remaining'?2:1);assert.equal(detailReads,limit==='remaining'?1:0);
  if(limit!=='remaining')assert.equal(result.partial,true);
 }
});
test('calendar returned-set cap is configurable only downward and preserves original completed set positions',async()=>{
 const identityProvenance={calendarIdentityVerified:true,sourceEndpoint:'/app/v5/trainingCalendar/monthNew'};
 const args={now:new Date('2026-10-08T12:00:00Z'),days:7,groupId:116,calendarCompletedOnly:true,maxTotalSets:1,
  summaries:[{training_id:'42',kind:'course',date:'2026-10-07',identityProvenance}],fetchSession:async()=>({payload:{training_id:'42',kind:'course',date:'2026-10-07',identityProvenance,detail:[{groupId:116,completionMethod:1,finishedReps:[{finishedCount:8},{finishedCount:9}]}]}})};
 const result=await scanCompletedExerciseHistory(args);assert.equal(result.matches[0].sets.length,1);assert.equal(result.matches[0].sets[0].reps,8);assert.equal(result.omittedSetCount,1);assert.equal(result.partial,true);
 for(const maxTotalSets of [0,2001,NaN])await assert.rejects(scanCompletedExerciseHistory({...args,maxTotalSets}),/budget/);
});
