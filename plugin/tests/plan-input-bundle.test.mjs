import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPlanInputs} from '../plan-input-bundle.mjs';

const args={profile:'example-profile',month:'2026-11',program_codes:['code1','code2'],days:14,consent_to_read_history:true};
test('one bounded read per section with exact scope and no health or writes',async()=>{
  const calls=[];
  const result=await collectPlanInputs(args,{
    resolveProfile:async value=>{calls.push(['profile',value]);return value;},
    readProfileConfig:async()=>({config:{id:1},password:'x'}),accountFingerprint:value=>value.config.id,
    readTrainingProfile:async value=>{calls.push(['trainingProfile',value]);return {goal:'hypertrophy'};},
    readCalendar:async(...values)=>{calls.push(['calendar',...values]);return {calendar:[]};},
    readBaselines:async(...values)=>{calls.push(['baselines',...values]);return {programSummary:[]};},
    readAthlete:async(...values)=>{calls.push(['athlete',...values]);return {history:{mobileSessions:[{training_id:727216,kind:'program',type:'',date:'2026-11-02',title:'Góra A'}]}};}
  });
  assert.deepEqual(calls.map(row=>row[0]),['profile','trainingProfile','calendar','baselines','athlete']);
  assert.deepEqual(calls.at(-1),['athlete','example-profile',14]);
  assert.deepEqual(result.completedSessionDetailKeys,[{sourceCollection:'mobileSessions',training_id:'727216',type:'program',date:'2026-11-02',title:'Góra A'}]);
  for(const phase of ['trainingProfile','calendar','baselines','history','total'])assert.ok(Number.isInteger(result.phaseTimingsMs[phase])&&result.phaseTimingsMs[phase]>=0,phase);
  assert.equal(result.readOnly,true);assert.equal(result.healthRead,false);assert.equal(result.writeAuthorized,false);
});
test('refuses missing consent before any reader and detects account change',async()=>{
  let reads=0;
  const deps={resolveProfile:async()=>{reads++;return 'example-profile';},readProfileConfig:async()=>({config:{id:++reads}}),accountFingerprint:value=>value.config.id,readTrainingProfile:async()=>({}),readCalendar:async()=>({}),readBaselines:async()=>({}),readAthlete:async()=>({})};
  await assert.rejects(collectPlanInputs({...args,consent_to_read_history:false},deps),/explicit history read consent/);
  assert.equal(reads,0);
  await assert.rejects(collectPlanInputs(args,deps),/Account changed/);
});
test('starts independent sections together and waits for all before account check',async()=>{
  const started=[];
  const release=[];
  let configReads=0;
  const section=name=>async()=>{started.push(name);return new Promise(resolve=>release.push(()=>resolve({name})));};
  const pending=collectPlanInputs(args,{
    resolveProfile:async value=>value,
    readProfileConfig:async()=>{configReads++;return {id:1};},
    accountFingerprint:value=>value.id,
    readTrainingProfile:section('profile'),
    readCalendar:section('calendar'),
    readBaselines:section('baselines'),
    readAthlete:section('athlete')
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,['profile','calendar','baselines','athlete']);
  assert.equal(configReads,1);
  for(const done of release)done();
  const result=await pending;
  assert.equal(configReads,2);
  assert.equal(result.baselines.name,'baselines');
});
test('one failed section drains the other reads and returns no partial bundle',async()=>{
  let finishHistory;
  let accountChecks=0;
  const request=collectPlanInputs(args,{
    resolveProfile:async value=>value,
    readProfileConfig:async()=>{accountChecks++;return {id:1};},
    accountFingerprint:value=>value.id,
    readTrainingProfile:async()=>({}),
    readCalendar:async()=>{throw Error('calendar unavailable');},
    readBaselines:async()=>({}),
    readAthlete:async()=>new Promise(resolve=>{finishHistory=resolve;})
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(accountChecks,1);
  finishHistory({history:{mobileSessions:[]}});
  await assert.rejects(request,/calendar unavailable/);
  assert.equal(accountChecks,2);
});
test('unknown baseline codes still bundle profile calendar and consented history without baseline read',async()=>{
  let baselineReads=0;
  const result=await collectPlanInputs({...args,program_codes:[]},{
    resolveProfile:async value=>value,
    readProfileConfig:async()=>({id:1}),
    accountFingerprint:value=>value.id,
    readTrainingProfile:async()=>({goal:'hypertrophy'}),
    readCalendar:async()=>({calendar:[{code:'found-after-read'}]}),
    readBaselines:async()=>{baselineReads++;throw Error('must not read unknown codes');},
    readAthlete:async()=>({history:{mobileSessions:[]}})
  });
  assert.equal(baselineReads,0);
  assert.equal(result.baselines.status,'deferred-until-codes-known');
  assert.equal(result.calendar.calendar[0].code,'found-after-read');
  assert.equal(result.readOnly,true);
});
test('optional recent details select four newest mobile sessions in one call',async()=>{
  const calls=[];
  const result=await collectPlanInputs({...args,include_recent_session_details:true},{
    resolveProfile:async value=>value,
    readProfileConfig:async()=>({id:1}),accountFingerprint:value=>value.id,
    readTrainingProfile:async()=>({}),readCalendar:async()=>({}),readBaselines:async()=>({}),
    readAthlete:async()=>({history:{mobileSessions:[1,3,2,5,4].map(id=>({training_id:id,kind:'program',date:`2026-11-0${id}`})),calendarCompletedSessions:[{training_id:9,kind:'course',date:'2026-11-09'}]}}),
    readDetail:async key=>{calls.push(key);return {training_id:key.training_id};}
  });
  assert.deepEqual(calls.map(row=>row.training_id),['5','4','3','2']);
  assert.equal(result.recentSessionDetails.completeCount,4);
  assert.equal(result.recentSessionDetails.partial,false);
  assert.ok(result.phaseTimingsMs.recentSessionDetails>=0);
  assert.equal(result.writeAuthorized,false);
});
test('skips invalid upstream dates and uses a valid fallback session type',async()=>{
  const result=await collectPlanInputs({...args,include_recent_session_details:true},{
    resolveProfile:async value=>value,
    readProfileConfig:async()=>({id:1}),accountFingerprint:value=>value.id,
    readTrainingProfile:async()=>({}),readCalendar:async()=>({}),readBaselines:async()=>({}),
    readAthlete:async()=>({history:{mobileSessions:[
      {training_id:1,kind:'',type:'program',date:'2026-11-04'},
      {training_id:2,kind:'program',date:'2026-11-31'}
    ]}}),
    readDetail:async key=>({training_id:key.training_id})
  });
  assert.deepEqual(result.completedSessionDetailKeys.map(row=>row.training_id),['1']);
  assert.equal(result.recentSessionDetails.completeCount,1);
  assert.equal(result.recentSessionDetails.partial,false);
});
test('bundled planning detail hoists repeated caveats while preserving load evidence',async()=>{
  const detail={planningView:true,exerciseCount:1,setCount:1,exercises:[{name:'Row',sets:[{set:1,reps:8,side:0,observedLoadAnchor:{status:'reported-set-range',channels:[{channel:'left-cable',lower:20,upper:22,unit:'kg'}]},reportedCableSum:{status:'bounded-cable-sum-envelope',lower:40,upper:44},reportedModeInterpretation:'performed-sportMode-code-unmapped-to-physical-behavior',phaseLoadStatus:'concentric-and-eccentric-loads-not-separated-by-reported-samples',observedRepLoadEvidence:[],reportedLoadChannels:[{channel:'left-cable',status:'reported'}]}]}]};
  const result=await collectPlanInputs({...args,include_recent_session_details:true,program_codes:[]},{
    resolveProfile:async value=>value,readProfileConfig:async()=>({id:1}),accountFingerprint:value=>value.id,
    readTrainingProfile:async()=>({}),readCalendar:async()=>({}),readAthlete:async()=>({history:{mobileSessions:[{training_id:1,kind:'program',date:'2026-11-02'}]}}),
    readDetail:async()=>detail
  });
  const compact=result.recentSessionDetails.results[0].detail;
  const set=compact.exercises[0].sets[0];
  assert.equal(compact.bundleCompact,true);
  assert.equal(compact.perSetModeInterpretation,detail.exercises[0].sets[0].reportedModeInterpretation);
  assert.equal(compact.perSetPhaseLoadStatus,detail.exercises[0].sets[0].phaseLoadStatus);
  assert.equal(set.observedLoadAnchor.channels[0].lower,20);
  assert.equal(set.reportedCableSum.upper,44);
  assert.equal(set.reportedLoadChannels[0].status,'reported');
  assert.ok(!Object.hasOwn(set,'observedRepLoadEvidence'));
});
