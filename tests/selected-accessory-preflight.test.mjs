import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlanRequiredAccessories} from '../plugin/equipment-plan-safety.mjs';
import {freshGroupAccessoryRequirements} from '../plugin/exercise-library.mjs';

const source = await readFile(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const start = source.indexOf("    case 'gm_coach_preflight_selected_accessories':");
const end = source.indexOf("    case 'gm_coach_prepare_accessory_requirement_confirmation':",start);
assert.ok(start > 0 && end > start);
const branch = source.slice(start,end);
const metadataStart = source.indexOf('async function getExerciseApiMetadata(');
const metadataEnd = source.indexOf('\nasync function loadExercisePresetOptions(',metadataStart);
assert.ok(metadataStart > 0 && metadataEnd > metadataStart);
const metadataReaderSource = source.slice(metadataStart,metadataEnd);
const exactKeys = (value,keys) => { if (!value || Object.keys(value).some(key => !keys.includes(key))) throw Error('Unexpected key'); };
function fixture({missing=false,variant=true,changeAccount=false,metadataFailure=false,catalogueConfirmed=false,detailAccessories,batchAccessories,recentCatalog=false,confirmationEvidence=false}={}) {
  let reads=0, metadataReads=0, refreshRequested=false;
  const record={id:11,title:'Selected exercise',equipmentMetadataAvailable:!missing,requiredAccessoryIds:missing?null:[3],equipmentMetadataStatus:missing?'unknown':'valid-ids',...(catalogueConfirmed?{variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:101}]}:{}),...(confirmationEvidence?{rawRequirementDigestBindable:true,rawRequirementDigest:'a'.repeat(64),reportedValidRequirementSetsComplete:true,reportedValidRequirementSets:[]}:{})};
  const deps={
    cycleExactKeys:exactKeys,resolveProfile:async value=>value??'synthetic',
    readProfileConfig:async()=>({config:{id:changeAccount&&++reads>1?'changed':'stable'},password:'fixture'}),
    profileConfigFingerprint:config=>config.id,
    currentExerciseCatalog:async(_profile,_fingerprint,options)=>{refreshRequested=options?.forceRefresh===true;return {exerciseRecordsById:new Map([[11,record]]),retrievedAt:recentCatalog?new Date().toISOString():'2026-11-03T00:00:00.000Z'};},
    getExerciseApiMetadata:async()=>{metadataReads++;if(metadataFailure)throw Error('API Speediance odrzuciło żądanie (kod 2001). Kod nie wskazuje jednoznacznie przyczyny.');return {detail:detailAccessories===undefined?{}:{accessories:detailAccessories},batch:{actionLibraryList:variant?[{id:101}]:[{id:102}],...(batchAccessories===undefined?{}:{accessories:batchAccessories})}};},
    assertExerciseMetadataGroupScope:()=>{},validatePlanRequiredAccessories,freshGroupAccessoryRequirements
  };
  const call=new Function(...Object.keys(deps),`return async (name,args)=>{switch(name){${branch}}}`)(...Object.values(deps));
  return {call:(variants)=>call('gm_coach_preflight_selected_accessories',{profile:'synthetic',variants}),get metadataReads(){return metadataReads;},get refreshRequested(){return refreshRequested;}};
}
test('actual MCP preflight reports complete and incomplete selected metadata without writes',async()=>{
  const selected=[{groupId:11,actionLibraryId:101}];
  const good=fixture(), result=await good.call(selected);
  assert.equal(result.complete,true);assert.deepEqual(result.results[0].requiredAccessoryIds,[3]);
  assert.equal(result.readOnly,true);assert.equal(result.writeAuthorized,false);
  assert.equal(good.refreshRequested,true);
  const bad=await fixture({missing:true}).call(selected);
  assert.equal(bad.complete,false);assert.equal(bad.results[0].status,'accessory-metadata-incomplete');
});
test('recent candidate catalog is reused for preflight while old catalog is refreshed',async()=>{
  const recent=fixture({recentCatalog:true,catalogueConfirmed:true});
  const result=await recent.call([{groupId:11,actionLibraryId:101}]);
  assert.equal(result.catalogReusedFromRecentSnapshot,true);
  assert.equal(recent.refreshRequested,false);
  assert.equal(result.complete,true);
});
test('actual MCP preflight checks variant identity, deduplicates detail reads and rejects account drift',async()=>{
  const selected=[{groupId:11,actionLibraryId:101}];
  assert.equal((await fixture({variant:false}).call(selected)).results[0].status,'catalog-variant-unconfirmed');
  const repeated=fixture();await repeated.call([...selected,...selected]);assert.equal(repeated.metadataReads,1);
  await assert.rejects(fixture({changeAccount:true}).call(selected),/account changed/);
});
test('five selected deload occurrences are reported before any scientific preview',async()=>{
  const selected=Array.from({length:5},()=>({groupId:11,actionLibraryId:101}));
  const h=fixture({missing:true});
  const result=await h.call(selected);
  assert.equal(result.complete,false);
  assert.equal(result.results.length,5);
  assert.ok(result.results.every(row=>row.status==='accessory-metadata-incomplete'));
  assert.equal(h.metadataReads,1);
});
test('metadata API failure stays scoped to selected group and never confirms requirements',async()=>{
  const result=await fixture({metadataFailure:true}).call([{groupId:11,actionLibraryId:101}]);
  assert.equal(result.complete,false);
  assert.equal(result.results[0].status,'metadata-read-error');
  assert.match(result.results[0].reason,/2001/);
});
test('metadata API code is reported without guessing its cause',async()=>{
  const result=await fixture({metadataFailure:true}).call([{groupId:11,actionLibraryId:101}]);
  assert.equal(result.results[0].apiCode,2001);
  assert.equal(result.results[0].status,'metadata-read-error');
});
test('actual metadata reader identifies the failing endpoint and preserves success',async()=>{
  const makeReader = failingPath => new Function('speedianceApiRequest','selectExerciseApiMetadata',`${metadataReaderSource}; return getExerciseApiMetadata;`)(async(_profile,path)=>{
    if(path.includes(failingPath)) throw Error('API Speediance odrzuciło żądanie (kod 2001). Kod nie wskazuje jednoznacznie przyczyny.');
    return {data:path};
  },(_id,detail,batch)=>({detail,batch}));
  const good=await makeReader('__none__')('synthetic',11);
  assert.match(good.detail.data,/actionLibraryGroup\/11/);
  assert.match(good.batch.data,/list\?ids=11/);
  await assert.rejects(makeReader('isDisplay=1')('synthetic',11),error=>{
    assert.deepEqual(error.metadataEndpointStatus,{detail:'rejected',batch:'fulfilled'});
    return /2001/.test(error.message);
  });
});
test('incomplete accessory result reports an unreadable upstream field',async()=>{
  const result=await fixture({missing:true,detailAccessories:'junk',batchAccessories:'junk'}).call([{groupId:11,actionLibraryId:101}]);
  assert.equal(result.complete,false);
  assert.equal(result.results[0].status,'accessory-metadata-incomplete');
  assert.equal(result.results[0].freshAccessoryStatus,'invalid');
  assert.ok(!Object.hasOwn(result.results[0],'requiredAccessoryIds'));
});
test('preflight advertises the existing explicit user confirmation route only with bounded raw evidence',async()=>{
  const selected=[{groupId:11,actionLibraryId:101}];
  const possible=await fixture({missing:true,confirmationEvidence:true,detailAccessories:'junk',batchAccessories:'junk'}).call(selected);
  assert.equal(possible.results[0].userConfirmationPossible,true);
  const unavailable=await fixture({missing:true,detailAccessories:'junk',batchAccessories:'junk'}).call(selected);
  assert.equal(unavailable.results[0].userConfirmationPossible,false);
  const conflict=await fixture({confirmationEvidence:true,detailAccessories:[4]}).call(selected);
  assert.equal(conflict.results[0].userConfirmationPossible,false);
});
test('exact selected detail fills a partial catalog only with complete consistent accessory IDs',async()=>{
  const selected=[{groupId:11,actionLibraryId:101}];
  const complete=await fixture({missing:true,detailAccessories:[3,4],batchAccessories:[4,3]}).call(selected);
  assert.equal(complete.complete,true);
  assert.deepEqual(complete.results[0].requiredAccessoryIds,[3,4]);
  assert.equal(complete.results[0].metadataSource,'fresh-group-detail-exact-variant');
  for (const options of [
    {missing:true,detailAccessories:[3],batchAccessories:[4]},
    {missing:true,detailAccessories:'not-an-id'},
    {missing:true,detailAccessories:[3],variant:false}
  ]) {
    const result=await fixture(options).call(selected);
    assert.equal(result.complete,false);
  }
  const conflictingCatalog=await fixture({detailAccessories:[4]}).call(selected);
  assert.equal(conflictingCatalog.complete,false);
  assert.match(conflictingCatalog.results[0].reason,/conflict/);
});
test('fresh exact catalog variant avoids redundant detail API 2001 without inventing accessories',async()=>{
  const ready=fixture({catalogueConfirmed:true,metadataFailure:true});
  const result=await ready.call([{groupId:11,actionLibraryId:101}]);
  assert.equal(result.complete,true);
  assert.equal(result.results[0].metadataSource,'fresh-catalog-exact-variant');
  assert.equal(ready.metadataReads,0);
  const unknown=fixture({catalogueConfirmed:true,metadataFailure:true,missing:true});
  const unresolved=await unknown.call([{groupId:11,actionLibraryId:101}]);
  assert.equal(unresolved.complete,false);
  assert.equal(unresolved.results[0].status,'metadata-read-error');
  assert.equal(unknown.metadataReads,1);
});
test('reversed identifiers are suggested only after exact reverse variant confirmation',async()=>{
  const result=await fixture().call([{groupId:101,actionLibraryId:11}]);
  assert.equal(result.complete,false);
  assert.equal(result.results[0].status,'identifiers-reversed');
  assert.deepEqual(result.results[0].suggestedVariant,{groupId:11,actionLibraryId:101});
  const repeated=fixture();await repeated.call([{groupId:101,actionLibraryId:11},{groupId:101,actionLibraryId:11}]);assert.equal(repeated.metadataReads,1);
  const unrelated=await fixture({variant:false}).call([{groupId:101,actionLibraryId:11}]);
  assert.equal(unrelated.results[0].status,'catalog-group-missing');
});
test('selected group details use bounded concurrency and retain input order',async()=>{
  let active=0,peak=0;
  const records=new Map(Array.from({length:9},(_,i)=>[i+1,{id:i+1,title:`Exercise ${i+1}`,equipmentMetadataAvailable:true,requiredAccessoryIds:[],equipmentMetadataStatus:'valid-empty'}]));
  const deps={
    cycleExactKeys:exactKeys,resolveProfile:async value=>value,
    readProfileConfig:async()=>({config:{id:'stable'},password:'fixture'}),
    profileConfigFingerprint:config=>config.id,
    currentExerciseCatalog:async()=>({exerciseRecordsById:records,retrievedAt:'2026-11-03T00:00:00.000Z'}),
    getExerciseApiMetadata:async(_profile,id)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return {batch:{actionLibraryList:[{id:100+id}]}};},
    assertExerciseMetadataGroupScope:()=>{},validatePlanRequiredAccessories,freshGroupAccessoryRequirements
  };
  const call=new Function(...Object.keys(deps),`return async (name,args)=>{switch(name){${branch}}}`)(...Object.values(deps));
  const selected=Array.from({length:9},(_,i)=>({groupId:i+1,actionLibraryId:101+i}));
  const result=await call('gm_coach_preflight_selected_accessories',{profile:'synthetic',variants:selected});
  assert.equal(result.complete,true);
  assert.equal(peak,4);
  assert.deepEqual(result.results.map(row=>row.groupId),selected.map(row=>row.groupId));
});
