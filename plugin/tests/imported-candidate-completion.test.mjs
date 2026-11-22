import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {completeImportedCandidate,validateImportedCandidateRequest,importedCandidateSourceDigest} from '../imported-candidate-completion.mjs';
import {inspectWorkoutJson} from '../workout-json-interop.mjs';
import {createImportedRmSelectorPolicyRegistry} from '../imported-rm-selector-policy.mjs';
import {normalizeTrainingEvidence,normalizeEvidencePlanItems} from '../training-evidence.mjs';
const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
const scopeStart=source.indexOf('function assertExerciseMetadataGroupScope(metadata) {'),scopeEnd=source.indexOf('\nasync function getExerciseApiMetadata',scopeStart);
assert.ok(scopeStart>0&&scopeEnd>scopeStart);
const actualScopeGuard=new Function(`${source.slice(scopeStart,scopeEnd)};return assertExerciseMetadataGroupScope;`)();
function dispatch(name,c){const marker=`    case '${name}': {`,start=source.indexOf(marker),end=source.indexOf('\n    case ',start+marker.length);assert.ok(start>=0&&end>start);const body=source.slice(start+marker.length,end).trim().replace(/}\s*$/,'');return new Function(...Object.keys(c),`return async(args)=>{${body}}`)(...Object.values(c));}
function fixture(preset=5,unit='kg'){
 const rule={1:[8,11,'Gain Muscle'],5:[6,5,'Strength'],3:[15,15,'Stamina']}[preset];
 const input={profile:'synthetic',workoutJson:{name:'Exact imported workout',exercises:[{id:42,title:'Source alias',preset,isUnilateralExpanded:false,sets:[{reps:rule[0],weight:rule[1],mode:2,rest:90},{reps:rule[0],weight:rule[1]+1,mode:3,rest:120}]},{id:43,title:'Source unilateral',preset:-1,isUnilateralExpanded:true,sets:[{reps:8,weight:unit==='kg'?12:26,mode:1,rest:'0'},{reps:30,weight:unit==='kg'?15:33,mode:3,rest:75}]}]},staticWeightUnit:unit,facts:{goal:'Explicit user goal, no inferred preset replacement',warmup:{status:'omitted_user_preference',items:[],omissionReason:'User explicitly requests omission'},postWorkoutStretching:{status:'omitted_user_preference',items:[],omissionReason:'User explicitly requests omission'},supersetBlocks:[],exercises:[{importedExerciseIndex:0,actionLibraryId:101,section:'main',sets:[{importedSetIndex:0,unit:'reps',rirTarget:2},{importedSetIndex:1,unit:'reps',rirTarget:1}]},{importedExerciseIndex:1,actionLibraryId:102,section:'main',sets:[{importedSetIndex:0,unit:'reps',side:1,rirTarget:3},{importedSetIndex:1,unit:'seconds',side:2}]}]}};
 input.sourceDigest=inspectWorkoutJson({workoutJson:input.workoutJson}).sourceDigest;
 const catalog={exercises:[{id:42,title:'Confirmed bilateral'},{id:43,title:'Confirmed unilateral'}]},metadata=new Map([[42,{detail:{isLeftRight:0,isBarbell:1},batch:{actionLibraryList:[{id:101}]}}],[43,{detail:{isLeftRight:1,isBarbell:0},batch:{actionLibraryList:[{id:102}]}}]]),state={reads:0,writes:0,drift:false};
 const c={validateImportedCandidateRequest,completeImportedCandidate,resolveProfile:async p=>p,withProfileMutationLock:async(p,fn)=>fn(),readProfileConfig:async()=>({config:{deviceType:1,identity:state.drift?'changed':'stable'},password:'synthetic'}),profileConfigFingerprint:config=>config.identity==='stable'?'a'.repeat(64):'b'.repeat(64),assertWritableDeviceType:type=>assert.equal(type,1),currentExerciseCatalog:async()=>{state.reads++;return catalog;},getExerciseApiMetadata:async(p,id)=>metadata.get(id),assertExerciseMetadataGroupScope:actualScopeGuard};
 return {input,rule,c,catalog,metadata,state,call:dispatch('gm_coach_complete_reference_client_candidate',c)};
}
for(const preset of [1,5,3])for(const unit of ['kg','lb'])test(`actual public candidate + existing selector policy preserves ${preset}/${unit}`,async()=>{
 const h=fixture(preset,unit),before=structuredClone(h.input),r=await h.call(h.input);
 assert.deepEqual(h.input,before);assert.equal(r.status,'completed-unapproved-reference-client-candidate');assert.equal(h.state.reads,1);assert.equal(h.state.writes,0);assert.equal(r.writeReady,false);assert.equal(r.scientificApproval,false);
 assert.deepEqual(r.sourceSelectors.map(s=>s.selector),[h.rule[1],h.rule[1]+1]);
 assert.deepEqual(r.planArguments.exercises[1].sets.map(s=>[s.side,s.unit,s.reps??s.durationSeconds,s.weight,s.weightUnit,s.mode,s.restSeconds]),[[1,'reps',8,unit==='kg'?12:26,unit,1,0],[2,'seconds',30,unit==='kg'?15:33,unit,3,75]]);
 assert.deepEqual(r.planArguments.exercises.map(e=>[e.id,e.actionLibraryId,e.title]),[[42,101,'Confirmed bilateral'],[43,102,'Confirmed unilateral']]);
 normalizeEvidencePlanItems(r.planArguments.warmup,r.planArguments.postWorkoutStretching);
 assert.throws(()=>normalizeTrainingEvidence('Unapproved imported candidate',r.planArguments.evidence),/1 do 12/);
 const registry=createImportedRmSelectorPolicyRegistry(),tokens=new Map(),c={resolveProfile:async p=>p,readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'a'.repeat(64),importedRmPolicies:registry,importedRmPolicyTokens:tokens,randomBytes};
 const minted=await dispatch('gm_coach_prepare_imported_rm_policy',c)({profile:'synthetic',referenceClientJson:r.referenceClientJson,sidecar:r.sidecar,migrationIntent:'preserve-imported-rm-selectors'});assert.equal(minted.writeReady,false);
 const token=tokens.get(minted.importedRmPolicyId);assert.ok(token);const normalized=r.planArguments.exercises.map(ex=>({...ex,sets:ex.sets.map(s=>{const {restSeconds,...row}=s;return {...row,rest:restSeconds};})}));
 const applied=registry.applyBeforeScientificReview(token.handle,normalized,{profile:'synthetic',accountFingerprint:'a'.repeat(64),migrationIntent:'preserve-imported-rm-selectors',planName:r.planArguments.name});assert.deepEqual(applied[0].sets.map(s=>s.rmLevel),[h.rule[1],h.rule[1]+1]);assert.equal(h.state.writes,0);
});
for(const fault of ['digest','goal','unit','rir','variant','side-swap','row-repeat','row-omit','unknown-field','unknown-preset','timed-rm','mode','source-flag','catalog','account'])test(`qualified public candidate rejects ${fault}`,async()=>{
 const h=fixture();await h.call(h.input);assert.equal(h.state.writes,0);
 if(fault==='digest')h.input.sourceDigest='f'.repeat(64);if(fault==='goal')delete h.input.facts.goal;if(fault==='unit')delete h.input.staticWeightUnit;if(fault==='rir')delete h.input.facts.exercises[0].sets[0].rirTarget;if(fault==='variant')h.input.facts.exercises[0].actionLibraryId=999;if(fault==='side-swap')h.input.facts.exercises[1].sets[0].side=2;if(fault==='row-repeat')h.input.facts.exercises[0].sets[1].importedSetIndex=0;if(fault==='row-omit')h.input.facts.exercises[0].sets.pop();if(fault==='unknown-field')h.input.catalogVerified=true;
 if(fault==='unknown-preset')h.input.workoutJson.exercises[0].preset=99;if(fault==='timed-rm'){h.input.facts.exercises[0].sets[0].unit='seconds';delete h.input.facts.exercises[0].sets[0].rirTarget;}if(fault==='mode')h.input.workoutJson.exercises[0].sets[0].mode=4;if(fault==='source-flag')h.input.workoutJson.exercises[1].isUnilateralExpanded=false;if(['unknown-preset','mode','source-flag'].includes(fault))h.input.sourceDigest=importedCandidateSourceDigest(h.input.workoutJson);
 if(fault==='catalog')h.catalog.exercises.pop();if(fault==='account')h.c.getExerciseApiMetadata=async(p,id)=>{h.state.drift=true;return h.metadata.get(id);};
 await assert.rejects(dispatch('gm_coach_complete_reference_client_candidate',h.c)(h.input),fault==='account'?/Candidate account changed during catalog confirmation/:undefined);if(fault==='account')assert.equal(h.state.drift,true);assert.equal(h.state.writes,0);
});
test('descriptor injection fails before catalog access',async()=>{const h=fixture();let calls=0;Object.defineProperty(h.input.facts,'goal',{enumerable:true,get(){calls++;return 'guess';}});await assert.rejects(h.call(h.input),/descriptor/);assert.equal(calls,0);assert.equal(h.state.reads,0);});
test('actual public completion schema forbids caller catalog authority and describes indexed facts',()=>{
 const line=source.split('\n').find(s=>s.includes("{name:'gm_coach_complete_reference_client_candidate'"));assert.ok(line);
 const tool=new Function(`return (${line.trim().replace(/,$/,'')});`)(),schema=tool.inputSchema;
 assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['profile','workoutJson','sourceDigest','facts']);
 assert.equal(schema.properties.facts.additionalProperties,false);const ex=schema.properties.facts.properties.exercises.items;
 assert.equal(ex.additionalProperties,false);assert.deepEqual(ex.required,['importedExerciseIndex','actionLibraryId','section','sets']);assert.equal(ex.properties.sets.items.additionalProperties,false);assert.equal(schema.properties.catalogVerified,undefined);
});
test('completed policy remains exact after human dose or selector drift',async()=>{
 const h=fixture(),r=await h.call(h.input),registry=createImportedRmSelectorPolicyRegistry(),binding={profile:'synthetic',accountFingerprint:'a'.repeat(64),migrationIntent:'preserve-imported-rm-selectors'};
 const {handle}=registry.mint({referenceClientJson:r.referenceClientJson,sidecar:r.sidecar,...binding});const rows=r.planArguments.exercises.map(ex=>({...ex,sets:ex.sets.map(s=>{const {restSeconds,...row}=s;return {...row,rest:restSeconds};})}));
 assert.deepEqual(registry.applyBeforeScientificReview(handle,rows,{...binding,planName:r.planArguments.name})[0].sets.map(s=>s.rmLevel),[5,6]);
 rows[1].sets[0].weight+=1;assert.throws(()=>registry.applyBeforeScientificReview(handle,rows,{...binding,planName:r.planArguments.name}),/dose changed/);assert.equal(h.state.writes,0);
});
