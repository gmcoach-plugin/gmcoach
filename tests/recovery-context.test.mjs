import test from 'node:test';
import { readInstructionAwareSync as readFileSync } from './fixtures/skill-instructions.mjs';
import assert from 'node:assert/strict';
import { createRecoveryContextRegistry, recoveryContextDecisionBinding } from '../plugin/recovery-context.mjs';
const accountFingerprint = 'a'.repeat(64), profile = 'synthetic';
const report = () => ({available:true,status:'partial',date:'2026-10-06',start_date:'2026-10-01',end_date:'2026-10-06',feeds:{fatigue:{available:true,status:'reported',rows:[{trainingPartId2:1,fatigue:3}],lastLoadedAtAvailable:false},sleep:{available:false,status:'real-data-not-confirmed',realData:false,date:'2026-10-06'}},biologicalReadinessCalculated:false});
const requested={date:'2026-10-06',start_date:'2026-10-01',end_date:'2026-10-06'};
test('heart-rate aggregate context preserves unknown period and undated measurement provenance', () => {
  const registry=createRecoveryContextRegistry();
  const report={available:true,status:'reported',rows:[{timeLevel:0}],totalSeconds:0,durationUnit:'seconds',durationInterpretationSource:'reference-client-renderer',period:'unknown',measurementFreshnessVerified:false,physiologicalZoneClassificationVerified:false,watchPairingInterpreted:false};
  const registered=registry.register({profile,accountFingerprint,feed:'heartRateZones',report});
  const resolved=registry.resolve({profile,accountFingerprint,declaration:{status:'reported',reportId:registered.reportId,limitations:['Unknown aggregation period; not current recovery evidence.']}});
  assert.equal(resolved.report.period,'unknown'); assert.deepEqual(resolved.requested,{});
  assert.ok(resolved.measurementTiming.undatedFeeds.includes('heartRateZones'));
  assert.equal(resolved.measurementTiming.measurementFreshnessVerified,false); assert.equal(resolved.biologicalReadinessCalculated,false);
  assert.throws(()=>registry.register({profile,accountFingerprint,feed:'heartRateZones',report,requested:{date:'2026-10-06'}}),/match/);
});
test('server registry clones, freezes and binds normalized report to exact account/profile',()=>{
  const registry=createRecoveryContextRegistry({now:()=>1000}); const input=report();
  const registered=registry.register({profile,accountFingerprint,report:input,requested});
  input.feeds.fatigue.rows[0].fatigue=99;
  assert.equal(registered.report.feeds.fatigue.rows[0].fatigue,3); assert.ok(Object.isFrozen(registered.report.feeds.fatigue.rows[0]));
  const context=registry.resolve({profile,accountFingerprint,declaration:{status:'reported',reportId:registered.reportId,limitations:['Reported data are partial and not biological readiness.']}});
  assert.equal(context.observedAt,'1970-01-01T00:00:01.000Z'); assert.equal(context.measurementTiming.measurementFreshnessVerified,false);
  assert.equal(context.report.feeds.fatigue.date,undefined); assert.equal(context.biologicalReadinessCalculated,false);
  assert.equal(recoveryContextDecisionBinding(context).value,`status=reported;contextDigest=${context.contextDigest}`);
  for(const identity of [{profile:'other',accountFingerprint},{profile,accountFingerprint:'b'.repeat(64)}]) assert.throws(()=>registry.resolve({...identity,declaration:{status:'reported',reportId:registered.reportId,limitations:['Unknown.']}}));
  assert.equal(JSON.stringify(context).includes(accountFingerprint),false);
});
test('expiry and capacity bounded; no silent eviction of active approvals',()=>{
  let time=1000; const registry=createRecoveryContextRegistry({now:()=>time,ttlMs:10,maxEntries:1});
  const registered=registry.register({profile,accountFingerprint,report:report(),requested});
  assert.throws(()=>registry.register({profile,accountFingerprint,report:report(),requested}),/capacity/);
  time=1010; assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration:{status:'reported',reportId:registered.reportId,limitations:['Unknown.']}}),/expired/);
  assert.ok(registry.register({profile,accountFingerprint,report:report(),requested}));
});
test('default reported context remains bound through a long review and expires at 90 minutes',()=>{
  let time=1000;const registry=createRecoveryContextRegistry({now:()=>time});
  const registered=registry.register({profile,accountFingerprint,report:report(),requested});
  const declaration={status:'reported',reportId:registered.reportId,limitations:['Partial report is not biological readiness.']};
  time+=89*60_000;
  assert.equal(registry.resolve({profile,accountFingerprint,declaration}).reportId,registered.reportId);
  time+=60_000;
  assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration}),/expired/);
});
test('all non-reading paths require explicit limitations and stable decision bindings',()=>{
  const registry=createRecoveryContextRegistry();
  for(const status of ['declined','unavailable','not_requested']) {
    assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration:{status}}),/limitations/);
    const declaration={status,limitations:['No reported health data used; use self-report without inferring readiness.']};
    const context=registry.resolve({profile,accountFingerprint,declaration});
    assert.equal(context.reportedHealthUsed,false); assert.equal(context.report,undefined);
    assert.equal(context.contextDigest,registry.resolve({profile,accountFingerprint,declaration}).contextDigest);
    assert.equal(recoveryContextDecisionBinding(context).requiredStatus,'applied');
    assert.notEqual(context.contextDigest,registry.resolve({profile,accountFingerprint,declaration:{status,limitations:['Different limitation.']}}).contextDigest);
  }
});
test('rejects raw secret fields, accessors, nonfinite data, fabricated declaration and wrong dates',()=>{
  const registry=createRecoveryContextRegistry();
  for(const invalid of [{...report(),appUserId:1},{...report(),token:'secret'},{...report(),feeds:{fatigue:{available:true,status:'reported',fatigue:NaN}}}]) assert.throws(()=>registry.register({profile,accountFingerprint,report:invalid,requested}));
  const accessor=report(); Object.defineProperty(accessor,'caution',{enumerable:true,get(){throw new Error('Must not execute');}});
  assert.throws(()=>registry.register({profile,accountFingerprint,report:accessor,requested}),/accessors/);
  assert.throws(()=>registry.register({profile,accountFingerprint,report:report(),requested:{...requested,date:'2026-10-05'}}),/period/);
  assert.throws(()=>registry.register({profile,accountFingerprint,report:{available:true,status:'reported'},feed:'fatigue',requested:{date:'2026-10-06'}}),/match/);
  assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration:{status:'reported',reportId:'f'.repeat(48),report:report(),limitations:['Unknown.']}}),/opaque/);
  assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration:{status:'declined',limitations:[' '],reportId:'f'.repeat(48)}}));
});

test('registry rejects hidden array fields without evaluating accessors',()=>{
  const registry=createRecoveryContextRegistry();const raw={available:true,status:'reported',rows:[]};
  Object.defineProperty(raw.rows,'token',{value:'hidden',enumerable:false});
  assert.throws(()=>registry.register({profile,accountFingerprint,report:raw,feed:'fatigue'}),/dense/);
});

test('all coaching skill entry points explain explicit recovery declaration and exact scientific binding',()=>{
  for(const path of ['../plugin/SKILL.md','../plugin/skills/speediance-coach/SKILL.md','../plugin/skills/training-science/SKILL.md']) {
    const text=readFileSync(new URL(path,import.meta.url),'utf8');
    const section=text.slice(text.indexOf('## Wymagany kontekst regeneracji przed podglądem'));
    assert.ok(section.length>100, path);
    for(const value of ['recoveryContext','gm_coach_resolve_recovery_context','recoveryDecisionBinding','recovery_context','target=plan','declined','unavailable','not_requested']) assert.ok(section.includes(value),`${path}: ${value}`);
    assert.match(section,/Nie wymyślaj reportId ani contextDigest/);
    assert.match(section,/Czas pobrania nie dowodzi świeżości pomiaru/);
    assert.match(section,/Każdy plan sesji w cyklu ma własną deklarację/);
  }
});

test('imported activity registry preserves exact report timing account and combined health evidence',()=>{
 let now=1000;const registry=createRecoveryContextRegistry({now:()=>now,ttlMs:1000});
 const activity={available:true,status:'partial',start_date:'2026-08-20',end_date:'2026-08-20',rows:[{dateStr:'2026-08-20',trainingTimeSeconds:632,reportedCalorie:30,calorieUnit:'unknown',mileageUnit:'unknown',timestampTimeZone:'unknown',classificationSource:'belongUserHealth=1'}],coverage:{upstreamCompleteness:'unknown',rowLimit:100},biologicalReadinessCalculated:false};
 const bound=registry.register({profile,accountFingerprint,report:activity,feed:'importedActivities',requested:{start_date:activity.start_date,end_date:activity.end_date}});const declaration={status:'reported',reportId:bound.reportId,limitations:['Partial imported data; timezone unknown.']};const resolved=registry.resolve({profile,accountFingerprint,declaration});assert.equal(resolved.report.rows[0].trainingTimeSeconds,632);assert.match(resolved.measurementTiming.importedActivityTiming,/timezone-unknown/);assert.equal(resolved.biologicalReadinessCalculated,false);assert.ok(recoveryContextDecisionBinding(resolved).value.includes(resolved.contextDigest));
 assert.throws(()=>registry.resolve({profile,accountFingerprint:'b'.repeat(64),declaration}),/account/);
 const combined={...report(),feeds:{...report().feeds,importedActivities:activity}};const both=registry.register({profile,accountFingerprint,report:combined,feed:'all',requested});assert.equal(both.report.feeds.fatigue.rows[0].fatigue,3);assert.equal(both.report.feeds.importedActivities.rows[0].trainingTimeSeconds,632);assert.notEqual(both.reportDigest,bound.reportDigest);
 activity.rows[0].trainingTimeSeconds=999;assert.equal(registry.resolve({profile,accountFingerprint,declaration}).report.rows[0].trainingTimeSeconds,632);now=2001;assert.throws(()=>registry.resolve({profile,accountFingerprint,declaration}),/expired/);
});

test('actual pre-dispatch recovery guard revalidates imported report expiry and reviewed digest',()=>{
 let time=1000;const registry=createRecoveryContextRegistry({now:()=>time,ttlMs:100});const imported={available:true,status:'partial',start_date:'2026-08-20',end_date:'2026-08-20',rows:[],coverage:{upstreamCompleteness:'unknown'}};
 const registered=registry.register({profile,accountFingerprint,feed:'importedActivities',report:imported,requested:{start_date:'2026-08-20',end_date:'2026-08-20'}});const declaration={status:'reported',reportId:registered.reportId,limitations:['Unknown completeness.']};const resolved=registry.resolve({profile,accountFingerprint,declaration});
 const server=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');const start=server.indexOf('function assertRecoveryContextCurrent('),end=server.indexOf('function recoveryBeforeSend(',start);assert.ok(start>0&&end>start);const guard=new Function('recoveryContexts',`return (${server.slice(start,end).trim()});`)(registry);
 assert.equal(guard(profile,accountFingerprint,{recoveryContext:declaration,resolvedRecoveryContext:resolved}).contextDigest,resolved.contextDigest);
 assert.throws(()=>guard(profile,accountFingerprint,{recoveryContext:declaration,resolvedRecoveryContext:{...resolved,contextDigest:'b'.repeat(64)}}),e=>e.code==='GM_COACH_RECOVERY_CONTEXT_INVALID');time=1101;assert.throws(()=>guard(profile,accountFingerprint,{recoveryContext:declaration,resolvedRecoveryContext:resolved}),e=>e.code==='GM_COACH_RECOVERY_CONTEXT_INVALID');
});
