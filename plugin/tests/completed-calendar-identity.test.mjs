import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCompletedCalendarIdentities, resolveCompletedCalendarIdentity } from '../completed-calendar-identity.mjs';
import { createNativeWorkoutReader } from '../native-workout-reader.mjs';
const month = entries => Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===6?structuredClone(entries):[]}));
const entries = [{trainingId:'9223372036854775807',type:4,isFinish:1},{trainingId:42,type:2,isFinish:1},{trainingId:43,type:4,isFinish:0}];
test('calendar completed identities exclude reservation and retain independent source evidence',()=>{
  const rows=inspectCompletedCalendarIdentities(month(entries),{month:'2026-10',deviceType:1});
  assert.deepEqual(rows.map(x=>x.kind),['ai','course']);
  assert.equal(rows[0].training_id,'9223372036854775807');
  assert.equal(rows[0].identityProvenance.mobileIdentityLinkageVerified,false);
  assert.throws(()=>resolveCompletedCalendarIdentity(rows,{trainingId:'43'}));
  assert.throws(()=>resolveCompletedCalendarIdentity([...rows,{...rows[1],kind:'ai'}],{trainingId:'42',type:'course'}));
  assert.throws(()=>resolveCompletedCalendarIdentity([{training_id:'42',kind:'course'}],{trainingId:'42'}));
  const collision=inspectCompletedCalendarIdentities(month([{trainingId:42,type:2,isFinish:1},{trainingId:42,type:3,isFinish:1}]),{month:'2026-10',deviceType:1});
  assert.throws(()=>resolveCompletedCalendarIdentity(collision,{trainingId:'42',type:'course'}));
  for(const bad of [[{id:42,type:2,isFinish:1}],[{trainingId:42,type:2,isFinish:1,deviceType:2}]]) assert.throws(()=>inspectCompletedCalendarIdentities(month(bad),{month:'2026-10',deviceType:1}));
  assert.throws(()=>inspectCompletedCalendarIdentities(month(entries).slice(1),{month:'2026-10',deviceType:1}));
});
test('validated routing identity cannot be mutated to redirect namespace id date or provenance',()=>{
  const rows=inspectCompletedCalendarIdentities(month(entries),{month:'2026-10',deviceType:1});
  const identity=resolveCompletedCalendarIdentity(rows,{trainingId:'42',type:'course',date:'2026-10-07'});
  for(const [field,value] of [['training_id','43'],['kind','ai'],['date','2026-10-08'],['identityProvenance',{}]]) {
    assert.throws(()=>{identity[field]=value;},TypeError);
  }
  for(const [field,value] of [['calendarIdentityVerified',false],['rawCalendarType',4],['selectedDeviceType',2]]) {
    assert.throws(()=>{identity.identityProvenance[field]=value;},TypeError);
  }
  identity.summary.trainingId=999;
  identity.summary.type=4;
  assert.equal(resolveCompletedCalendarIdentity(rows,{trainingId:'42',type:'course',date:'2026-10-07'}),identity);
  assert.equal(identity.training_id,'42'); assert.equal(identity.kind,'course');
  assert.throws(()=>inspectCompletedCalendarIdentities(month([{trainingId:42,type:2,isFinish:1,deviceType:'1'}]),{month:'2026-10',deviceType:1}));
});
test('calendar namespace detail uses exact proven id with no invented info GET',async()=>{
  for(const [trainingId,type,route] of [['42','course','courseTrainingInfoDetail'],['9223372036854775807','ai','aiCourseTrainingInfoDetail']]){
    const paths=[]; const detail=[{completionMethod:999,countType:2,finishedReps:[{time:30,finishedCount:8}]}];
    const reader=createNativeWorkoutReader({apiRead:async path=>{paths.push(path);return{code:0,data:paths.length===1?month(entries):detail};}});
    const result=await reader.calendarSession(trainingId,type,'2026-10-07');
    assert.equal(result.detail,detail); assert.equal(result.info,null);
    assert.deepEqual(paths,[`/app/v5/trainingCalendar/monthNew?date=2026-10&selectedDeviceType=1`,`/app/trainingInfo/${route}/${trainingId}`]);
  }
});
test('unproven or rejected calendar identity never dispatches detail',async()=>{
  for(const response of [{code:1002,data:month(entries)},{code:0},{code:0,data:month([{id:42,type:2,isFinish:1}])},{code:0,data:month([{trainingId:42,type:2,isFinish:0}])}]){
    const paths=[]; const reader=createNativeWorkoutReader({apiRead:async path=>{paths.push(path);return response;}});
    await assert.rejects(reader.calendarSession('42','course','2026-10-07'));assert.equal(paths.length,1);
  }
});
