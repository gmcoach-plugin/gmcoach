import {installSavedHeaderFixture} from './saved-header-fixture.mjs';
function savedEnrichmentVm(code,context={},options){return vm.runInNewContext(code,installSavedHeaderFixture(context),options);}
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAccountWeightUnit,extractAccountWeightUnit} from '../workout-data.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assertWritableDeviceType,resolveAccountDisplayUnit} from '../program-payload.mjs';
test('Speediance weightUnit codes distinguish kg and lb and retain true conflict',()=>{
 assert.equal(inspectAccountWeightUnit({weightUnit:1,unit:0}).unit,'kg');
 assert.equal(inspectAccountWeightUnit({weightUnit:0,unit:1}).unit,'lb');
 assert.equal(inspectAccountWeightUnit({weightUnit:1,unit:1}).status,'conflicting-recognized-account-unit-fields');
 assert.equal(inspectAccountWeightUnit({weightUnit:0,unit:0}).status,'conflicting-recognized-account-unit-fields');
});
test('same account object recognized unit disagreements remain unknown regardless order or wrapper',()=>{
 for(const raw of [{weightUnit:0,unit:0},{unit:0,weightUnit:0},{data:{weightUnit:0,unit:0}},{userInfo:{unit:0,weightUnit:0}}]){
  assert.equal(extractAccountWeightUnit(raw),'unknown');assert.equal(inspectAccountWeightUnit(raw).status,'conflicting-recognized-account-unit-fields');
 }
});
test('actual preparation prefix unit guard chains raw userinfo through real details; not full public zero-POST proof',async()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
 const detailStart=source.indexOf('async function getAccountWeightUnitDetails('),detailEnd=source.indexOf('\nasync function annotateWorkoutForProfile(',detailStart);
 const prepStart=source.indexOf('async function prepareProgramPayload('),prepEnd=source.indexOf('  const metadataById = new Map();',prepStart);assert.ok(prepEnd>prepStart);
 for(const raw of [{unit:0},{weightUnit:0,unit:0}]){
  const deps={JSON,Date,inspectAccountWeightUnit,extractAccountWeightUnit,weightUnitCache:new Map(),assertUnitMemoryAccountBinding:config=>({email:'fixture',region:config.region,loginClientType:'fixture'}),assertApiAccountBinding:()=>({}),readProfileConfig:async()=>({config:{region:'EU',deviceType:1}}),speedianceApiRequest:async()=>({data:raw}),readSavedTemplateUnitMemory:async()=>({confirmedWeightUnit:'kg'}),assertWritableDeviceType,resolveAccountDisplayUnit};
  const details=savedEnrichmentVm(`${source.slice(detailStart,detailEnd)};getAccountWeightUnitDetails`,deps);
  const prepare=savedEnrichmentVm(`${source.slice(prepStart,prepEnd)};return {unitGatePassed:true,displayUnit};};prepareProgramPayload`,{...deps,getAccountWeightUnitDetails:details});
  const plan={confirmedDisplayUnit:'kg',exercises:[{loadType:'customize-manual',staticLoadRequested:true,sets:[{weightUnit:'kg',weight:10}]}]};
  if(raw.weightUnit===undefined)assert.equal((await prepare(plan,'synthetic')).displayUnit,'kg');
  else await assert.rejects(prepare(plan,'synthetic'),/sprzeczne jednostki/);
 }
 // Deliberately extracted real prefix: proves unit gate, not complete science
 // approval/serialization. Full approved payload and saved-edit runtime remain gaps.
});
test('actual final-cycle and strength-profile fallback expressions refuse raw unit conflict',async()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function getAccountWeightUnitDetails('),end=source.indexOf('\nasync function annotateWorkoutForProfile(',start);
 const details=savedEnrichmentVm(`${source.slice(start,end)};getAccountWeightUnitDetails`,{JSON,Date,inspectAccountWeightUnit,extractAccountWeightUnit,weightUnitCache:new Map(),assertUnitMemoryAccountBinding:config=>({email:'fixture',region:config.region,loginClientType:'fixture'}),assertApiAccountBinding:()=>({}),readProfileConfig:async()=>({config:{region:'EU'}}),speedianceApiRequest:async()=>({data:{unit:0,weightUnit:0}}),readSavedTemplateUnitMemory:async()=>({confirmedWeightUnit:'kg'})});
 for(const finalVariable of ['observedUnit','observed']){
  const anchor='    const observedDetails = await getAccountWeightUnitDetails(profile, { forceRefresh: true });';const first=source.indexOf(anchor);const pos=finalVariable==='observedUnit'?first:source.indexOf(anchor,first+1);const finish=source.indexOf('    for (const ',pos);assert.ok(pos>=0&&finish>pos);
  const check=savedEnrichmentVm(`async()=>{${source.slice(pos,finish)};return ${finalVariable};}`,{getAccountWeightUnitDetails:details,profile:'synthetic'});await assert.rejects(check(),/Cycle account unit conflict/);
 }
 const accountUnit=await details('synthetic');
 const expressionStart=source.indexOf('  const effectiveAccountUnit = '),expressionEnd=source.indexOf('\n  const result = ',expressionStart);
 const effective=savedEnrichmentVm(`${source.slice(expressionStart,expressionEnd)};effectiveAccountUnit`,{accountUnit,confirmedDisplayUnit:'kg'});assert.equal(effective.unit,'unknown');assert.equal(effective.source,'speediance-account-unit-conflict');
});
test('actual account details conflict bypasses saved confirmation and cached conflict stays unknown',async()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');const start=source.indexOf('async function getAccountWeightUnitDetails('),end=source.indexOf('\nasync function annotateWorkoutForProfile(',start);assert.ok(start>=0&&end>start);
 let memoryReads=0,apiReads=0;const cache=new Map();
 const details=savedEnrichmentVm(`${source.slice(start,end)};getAccountWeightUnitDetails`,{JSON,Date,inspectAccountWeightUnit,extractAccountWeightUnit,weightUnitCache:cache,assertUnitMemoryAccountBinding:config=>({email:'fixture',region:config.region,loginClientType:'fixture'}),assertApiAccountBinding:()=>({}),readProfileConfig:async()=>({config:{region:'EU'}}),speedianceApiRequest:async()=>{apiReads++;return {data:{weightUnit:0,unit:0}};},readSavedTemplateUnitMemory:async()=>{memoryReads++;return {confirmedWeightUnit:'kg'};}});
 const first=await details('synthetic',{forceRefresh:true});assert.equal(first.unit,'unknown');assert.equal(first.source,'speediance-account-unit-conflict');assert.equal(memoryReads,0);
 const second=await details('synthetic');assert.equal(second.unit,'unknown');assert.equal(memoryReads,0);assert.equal(apiReads,1);
});
test('actual static preparation and saved-edit branches explicitly reject conflict while RM avoids unit read',()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
 assert.match(source,/accountUnitDetails\?\.source === 'speediance-account-unit-conflict'/);
 assert.match(source,/unitDetails.source === 'speediance-account-unit-conflict'\)throw/);
 assert.match(source,/hasProfileLoads \|\| hasFixedKg \|\| hasManualCustomize \? await getAccountWeightUnitDetails/);
 assert.match(source,/hasManualCustomize && \(accountUnitDetails.source !== 'speediance-account-userinfo'/);
 // Structural assertions only. Existing real Smart RM serializer tests remain
 // necessary; this candidate changes neither program-payload nor serialization.
});
test('same-scope agreement and existing recognized fallback remain known',()=>{
 assert.equal(extractAccountWeightUnit({data:{unit:0}}),'kg');assert.equal(extractAccountWeightUnit({data:{unit:1}}),'lb');
 assert.equal(extractAccountWeightUnit({userInfo:{weightUnit:'lb'}}),'lb');assert.equal(extractAccountWeightUnit({unit:0,weightUnit:'kg',displayUnit:'kg'}),'kg');
 assert.equal(extractAccountWeightUnit({weightUnit:'invalid',unit:1}),'lb');
 // No unsupported cross-object precedence change: existing first recognized scope remains authoritative.
 assert.equal(extractAccountWeightUnit({unit:0,data:{unit:1}}),'kg');
});
test('inspection does not invoke getters or emit private account fields',()=>{
 let calls=0;const raw={email:'private',get unit(){calls++;return 0;},data:{unit:1}};
 const r=inspectAccountWeightUnit(raw);assert.equal(r.unit,'lb');assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(r),/private|email/);
 const cyclic={};cyclic.data=cyclic;assert.equal(inspectAccountWeightUnit(cyclic).unit,'unknown');
});


test('actual account unit reader uses info GET only, preserves strict mapping and no retry fallback',async()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function getAccountWeightUnitDetails('),end=source.indexOf('\nasync function annotateWorkoutForProfile(',start);assert.ok(start>=0&&end>start);
 for(const scenario of [
  {data:{unit:0},expected:'kg',origin:'speediance-account-userinfo'},
  {data:{unit:1},expected:'lb',origin:'speediance-account-userinfo'},
  {data:{unit:0,weightUnit:0},memory:'kg',expected:'unknown',origin:'speediance-account-unit-conflict'},
  {data:{},expected:'unknown',origin:'unavailable'},
  {data:{unit:2},expected:'unknown',origin:'unavailable'},
  {fail:true,expected:'unknown',origin:'unavailable'},
  {fail:true,memory:'lb',expected:'lb',origin:'user-confirmed-local-profile'}
 ]){
  const calls=[];let identityChecks=0,memoryReads=0;
  const binding={email:'synthetic',region:'EU',loginClientType:'APP'};
  const details=savedEnrichmentVm(`${source.slice(start,end)};getAccountWeightUnitDetails`,{
   JSON,Date,inspectAccountWeightUnit,weightUnitCache:new Map(),
   readProfileConfig:async()=>({config:{region:'EU'}}),assertUnitMemoryAccountBinding:()=>binding,
   assertApiAccountBinding:(_config,actual)=>{identityChecks++;assert.equal(actual,binding);},
   speedianceApiRequest:async(profile,endpoint,options,recovery,actual)=>{
    calls.push(endpoint);assert.equal(profile,'synthetic');assert.equal(actual,binding);
    // Model the reported bare-GET code12; the unit reader must never select or retry it.
    if(endpoint==='/app/userinfo')throw Error('Speediance API code12 bare userinfo');
    assert.equal(endpoint,'/app/userinfo/info');assert.equal(Object.keys(options).length,0);assert.equal(recovery,true);
    if(scenario.fail)throw Error('Synthetic existing-session read failure');return {data:scenario.data};
   },
   readSavedTemplateUnitMemory:async()=>{memoryReads++;return scenario.memory?{confirmedWeightUnit:scenario.memory}:{};}
  });
  const result=await details('synthetic',{forceRefresh:true});assert.equal(result.unit,scenario.expected);assert.equal(result.source,scenario.origin);assert.deepEqual(calls,['/app/userinfo/info']);assert.ok(identityChecks>=1);
  if(scenario.origin==='speediance-account-unit-conflict')assert.equal(memoryReads,0,'conflict never falls back to local memory');
 }
});
