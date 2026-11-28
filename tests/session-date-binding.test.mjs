import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { annotateTimedWorkoutOutput } from '../plugin/workout-data.mjs';
import { createNativeWorkoutReader } from '../plugin/native-workout-reader.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    case 'speediance_get_session_detail': {");
const end=source.indexOf("    case 'speediance_search_exercises': {",start);
function mobile(date,type=5,id=42) { const [y,m,d]=date.split('-').map(Number);return{trainingId:id,type,startTimestamp:new Date(y,m-1,d,12).getTime()}; }
function fullMonth(month,entries=[]) {
  const end=new Date(`${month}-01T12:00:00Z`);end.setUTCMonth(end.getUTCMonth()+1,0);
  return Array.from({length:end.getUTCDate()},(_,index)=>({date:`${month}-${String(index+1).padStart(2,'0')}`,trainingPlanList:entries.filter(row=>row.date===`${month}-${String(index+1).padStart(2,'0')}`).map(({date,...row})=>row)}));
}
function harness({mobileRows=[],calendar=[],legacy=[{training_id:42,kind:'program',date:'2026-10-08'}]}={}) {
  const state={paths:[],profiles:0,details:0,legacyReads:0};
  const run=vm.runInNewContext(`(async args=>{switch('speediance_get_session_detail'){${source.slice(start,end)}}})`,{
    resolveProfile:async()=>{state.profiles++;return'synthetic';},readProfileConfig:async()=>({config:{deviceType:1}}),createNativeWorkoutReader,
    speedianceApiRequest:async(_profile,path)=>{
      state.paths.push(path);
      if(path.startsWith('/mobile/v2/report/'))return{code:0,data:mobileRows};
      if(path.startsWith('/app/v5/trainingCalendar/'))return{code:0,data:fullMonth(new URL(`https://fixture.invalid${path}`).searchParams.get('date'),calendar)};
      state.details++;return{code:0,data:[{opaque:'unchanged'}]};
    },readHistoryForProfile:async()=>{state.legacyReads++;return JSON.stringify(legacy);},parseCliJson:JSON.parse,annotateWorkoutForProfile:async value=>value,
    readSessionForProfile:async(_profile,id,type)=>{state.details++;return{payload:{training_id:id,kind:type,detail:[{opaque:true}]},source:'synthetic-detail',partial:false,fallback:{attempted:false}};}
  });
  return{run,state};
}
test('actual public dispatch rejects malformed calendar date before profile or API',async()=>{
  for(const date of ['2026-02-30','2026-13-01','2026-1-01',null,7,'2026-10-07x'])for(const type of [undefined,'program','free','course','ai']) {
    const h=harness();await assert.rejects(h.run({training_id:'42',type,date}));assert.equal(h.state.profiles,0);assert.equal(h.state.paths.length,0);assert.equal(h.state.details,0);
  }
});
test('explicit dated mobile namespace requires exact date ID and kind before details',async()=>{
  for(const rows of [[mobile('2025-01-14')],[mobile('2025-01-15',1)],[mobile('2025-01-15',5,43)],[mobile('2025-01-15'),mobile('2025-01-15')],[]]) {
    const h=harness({mobileRows:rows});await assert.rejects(h.run({training_id:'42',type:'program',date:'2025-01-15'}),/Dated session identity/);assert.equal(h.state.details,0);assert.equal(h.state.legacyReads,0);
    assert.deepEqual(h.state.paths,['/mobile/v2/report/userTrainingDataRecord?startDate=2025-01-15&endDate=2025-01-16']);
  }
});
test('old exact dated program/free resolve despite absent thirty-day history',async()=>{
  for(const [type,rawType] of [['program',5],['free',1]])for(const automatic of [false,true]) {
    const h=harness({mobileRows:[mobile('2025-01-15',rawType),mobile('2025-01-16',rawType,99)]});
    const result=await h.run({training_id:'42',...(automatic?{}:{type}),date:'2025-01-15'});
    assert.equal(result.kind,type);assert.equal(result.gmCoachSessionReadback.dateBinding.status,'checked');assert.equal(result.gmCoachSessionReadback.dateBinding.requestedDate,'2025-01-15');
    assert.equal(h.state.legacyReads,0);assert.equal(h.state.details,1);assert.equal(h.state.paths[0],'/mobile/v2/report/userTrainingDataRecord?startDate=2025-01-15&endDate=2025-01-16');
  }
});
test('automatic dated calendar uses exact day source and never guesses another namespace',async()=>{
  for(const [kind,rawType,endpoint] of [['course',2,'courseTrainingInfoDetail'],['ai',4,'aiCourseTrainingInfoDetail']]) {
    const h=harness({calendar:[{date:'2025-01-15',trainingId:42,type:rawType,isFinish:1}]});
    const result=await h.run({training_id:'42',date:'2025-01-15'});assert.equal(result.kind,kind);assert.equal(result.gmCoachSessionReadback.dateBinding.sourceEndpoint,'/app/v5/trainingCalendar/monthNew');assert.equal(h.state.legacyReads,0);
    assert.equal(h.state.paths.at(-1),`/app/trainingInfo/${endpoint}/42`);assert.equal(h.state.details,1);
  }
  const collision=harness({mobileRows:[mobile('2025-01-15')],calendar:[{date:'2025-01-15',trainingId:42,type:4,isFinish:1}]});
  await assert.rejects(collision.run({training_id:'42',date:'2025-01-15'}),/collides/);assert.equal(collision.state.details,0);
});
test('no date retains legacy explicit and recent automatic behavior, without date claim',async()=>{
  for(const type of ['program','free',undefined]) {
    const h=harness();const result=await h.run({training_id:'42',type});assert.equal(result.gmCoachSessionReadback.dateBinding.status,'not-requested');assert.equal(h.state.legacyReads,type===undefined?1:0);assert.equal(h.state.details,1);
    assert.equal(h.state.paths.some(path=>path.includes('/mobile/')),false);
  }
});
test('native exact-day helper filters undated and out-of-range records; invalid date issues zero GET',async()=>{
  const paths=[];const reader=createNativeWorkoutReader({apiRead:async path=>{paths.push(path);return{code:0,data:[mobile('2025-01-15'),mobile('2025-01-14',1,2),{trainingId:3,type:5}]};}});
  await assert.rejects(reader.summariesForDate('2025-02-30'));assert.equal(paths.length,0);
  const rows=await reader.summariesForDate('2025-01-15');assert.equal(rows.length,1);assert.equal(rows[0].training_id,42);
});

for(const displayUnit of ['kg','lb','unknown'])test(`actual public completed detail keeps measured samples visible with calculated-load preference false ${displayUnit}`,async()=>{
 const payload={training_id:'42',kind:'program',showCalculatedLoads:false,detail:[{actionLibraryGroupId:116,title:'Synthetic completed movement',unit:'reps',templatePresetId:1,weights:'3.5',counterweight:'13',finishedReps:[{finishedCount:8,targetCount:10,time:24,trainingInfoDetail:{weights:[60,61]}},{finishedCount:6,targetCount:8,time:20,trainingInfoDetail:{weights:[55,57]}}]}]};
 const annotationStart=source.indexOf('async function annotateWorkoutForProfile('),annotationEnd=source.indexOf('\nfunction sameTemplateName',annotationStart);assert.ok(annotationStart>=0&&annotationEnd>annotationStart);
 const annotate=vm.runInNewContext(`${source.slice(annotationStart,annotationEnd)};annotateWorkoutForProfile`,{getAccountWeightUnit:async()=>displayUnit,annotateTimedWorkoutOutput});
 const run=vm.runInNewContext(`(async args=>{switch('speediance_get_session_detail'){${source.slice(start,end)}}})`,{resolveProfile:async()=> 'synthetic',readProfileConfig:async()=>({config:{deviceType:1}}),createNativeWorkoutReader,parseCliJson:JSON.parse,annotateWorkoutForProfile:annotate,readSessionForProfile:async()=>({payload,source:'synthetic-completed-detail',partial:false,fallback:{attempted:false}})});
 const result=await run({training_id:'42',type:'program'});assert.equal(result.showCalculatedLoads,false);
 const sets=result.gmCoachSessionSummary.exercises[0].sets;
 assert.deepEqual(Array.from(sets,set=>[set.reps,set.elapsedSeconds,set.weightMin,set.weightMax,set.weightUnit]),[[8,24,60,61,displayUnit],[6,20,55,57,displayUnit]]);
 for(const set of sets){assert.equal(set.calculatedLoad,undefined);assert.equal(set.oneRepMax,undefined);assert.equal(set.targetPercent1RM,undefined);assert.notEqual(set.weightMin,3.5);assert.notEqual(set.weightMin,13);}
 assert.deepEqual(JSON.parse(JSON.stringify(result.detail)),payload.detail);
});
