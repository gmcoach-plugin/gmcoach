import { validatePlanRequiredAccessories as actualAccessoryValidator } from '../plugin/equipment-plan-safety.mjs';
import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assessPreferenceCompliance, assertPreferenceCompliance, normalizePreferenceReviews } from '../plugin/preference-compliance.mjs';
import { snapshotNormalizedPlan } from '../plugin/reviewed-plan-record.mjs';
import { deriveTrainingCyclePrescription } from '../plugin/training-cycle-prescription.mjs';
const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const existingTemplatePreview = Symbol('internal-existing-template-preview');
test('registered ordinary preview alone exposes read-only preference preparation switch',()=>{
 const start=source.indexOf("    name: 'speediance_preview_program'");
 const end=source.indexOf("    name: 'speediance_preview_saved_program_schedule'",start);
 const text=source.slice(start,end);
 assert.match(text,/preparePreferenceReviews=true/);
 const schemaStart=text.indexOf('    inputSchema: ');
 const schemaText=text.slice(schemaStart+'    inputSchema: '.length,text.lastIndexOf('\n  },')).trim();
 const schema=new Function('programSchema','return ('+schemaText+');')(()=>({properties:{name:{type:'string'}}}));
 assert.equal(schema.properties.preparePreferenceReviews.type,'boolean');
 const baseStart=source.indexOf('function programSchema('),baseEnd=source.indexOf('\nfunction validateProfile',baseStart);
 assert.ok(baseEnd>baseStart);assert.ok(!source.slice(baseStart,baseEnd).includes('preparePreferenceReviews'));
});
const resolverStart=source.indexOf('function resolveImportedRmPolicy('),resolverEnd=source.indexOf('\n',resolverStart);assert.ok(resolverStart>=0&&resolverEnd>resolverStart);
const resolveImportedRmPolicy=new Function('importedRmPolicyTokens','Date',`return (${source.slice(resolverStart,resolverEnd)});`)(new Map(),Date);
const plan = () => ({name:'Synthetic', exercises:[{id:42,title:'Misleading title',actionLibraryId:7,loadType:'bodyweight',sets:[{reps:8,unit:'reps',rest:60,mode:1}]}],evidence:[{id:'e'}],decisionEvidence:[{category:'exercise_selection',value:'x'}]});
function reviewed(p,profile,record={},userConfirmed=false){
 p.preferenceReviews=[...assessPreferenceCompliance(p,profile,new Map([[42,record]])).checks,...assessPreferenceCompliance(p,profile,new Map([[42,record]])).reviews].filter(x=>x.status!=='confirmed-contradiction').map(x=>({field:x.field,scopeDigest:x.scopeDigest,decision:'reviewed-compatible',rationale:'Explicit scoped compatibility review',...(userConfirmed?{userConfirmed:true}:{})}));return p;
}
function validator(profileData, record) {
 const start=source.indexOf('async function validatePlanForProfile('),end=source.indexOf('\nfunction assertRecoveryContextCurrent(',start);
 assert.ok(start>0&&end>start);
 return runWithAccessoryFixture(`(${source.slice(start,end).trim()})`,{
  structuredClone, readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'account', recoveryContexts:{resolve:()=>({status:'unavailable',contextDigest:'r'})},
  auditTrainingProfileForPlan:async()=>({profileData,audit:{complete:true,completedSections:[],declinedSections:[]},fingerprint:'intake',preferences:{}}),
  assertTrainingInterviewComplete:()=>{},assertNutritionContextEvidence:()=>{},assertPlanSectionPreferences:()=>{},
  validateTrainingResearchSources:x=>x,validateEvidenceExcerptAnchors:()=>{},assertPilatesResistanceSupported:()=>{},getConfirmedExerciseName:()=> 'Misleading title',normalizedExerciseName:x=>x,
  normalizeEvidenceCoverage:(_e,d)=>d,assertPlanMovementRestrictionsAllowed:()=>{},assertPlanTimeLowerBound:()=>{},assessPreferenceCompliance,assertPreferenceCompliance,normalizePreferenceReviews,
  currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,record]]),exercises:[record]}),readOwnedEquipment:async()=>({}),resolvePlanEquipmentInventory:()=>({source:'api'}),validatePlanRequiredAccessories: ({plan}) => actualAccessoryValidator({plan,catalog:plan.exercises.map(exercise=>({id:exercise.id,equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[]})),inventory:{ownershipKnown:true,ownershipStatus:'complete',ownedAccessoryIds:[]}}),createHash
 });
}

function publicPreparation(profileData,record={}){
 const begin=source.indexOf("    case 'speediance_preview_program': {");const end=source.indexOf('      const { payload, displayUnit, staticLoadContext, executionExercises }',begin);assert.ok(begin>0&&end>begin);
 const counters={pastPreparation:0};
 const run=runWithAccessoryFixture("(async args=>{switch('speediance_preview_program'){"+source.slice(begin,end)+"counters.pastPreparation++;return {validationComplete:true};});}}})",{
  resolveImportedRmPolicy,resolveProfile:async()=> 'synthetic',withProfileMutationLock:async(_p,fn)=>fn(),readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'account',
  readTrainingProfileRecord:async()=>({profileData}),currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,record]]),exercises:[record]}),normalizePlan:args=>({...plan(),...args}),
  validatePlanForProfile:validator(profileData,record),prepareProgramPayload:async()=>{throw Error('Unexpected preparation')},counters,existingTemplatePreview
 });
 run.counters=counters;return run;
}
const args=()=>({...plan(),warmup:{status:'omitted_user_preference',omissionReason:'test'},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'test'}});
test('actual ordinary preview preparation returns exact scope without approval; reviewed unchanged scope qualifies',async()=>{
 const run=publicPreparation({exercisePreferences:'Seated'});const a=args();a.preparePreferenceReviews=true;
 const prepared=await run(a);assert.equal(prepared.writeReady,false);assert.equal(prepared.approvalIssued,false);assert.equal(prepared.scientificApproval,false);assert.equal(prepared.previewId,undefined);assert.equal(prepared.requiredPreferenceReviews.length,1);assert.equal(run.counters.pastPreparation,0);
 delete a.preparePreferenceReviews;a.preferenceReviews=prepared.requiredPreferenceReviews.map(x=>({field:x.field,scopeDigest:x.scopeDigest,decision:'reviewed-compatible',rationale:'Explicit compatibility review'}));
 assert.equal((await run(a)).validationComplete,true);assert.equal(run.counters.pastPreparation,1);
 a.exercises[0].sets[0].reps++;
 const stale=await run(a);assert.equal(stale.operationStatus,'preference-review-preparation');assert.equal(stale.writeReady,false);assert.equal(stale.approvalIssued,false);assert.equal(stale.previewId,undefined);assert.equal(stale.requiredPreferenceReviews.length,1);assert.equal(run.counters.pastPreparation,1);
});
test('actual ordinary preparation preserves contradictions and flag type validation',async()=>{
 const blocked=publicPreparation({absPreference:'no'},{mainMuscleGroupStatus:'available',mainMuscleGroupName:'Abdominals'});await assert.rejects(blocked({...args(),preparePreferenceReviews:true}),/absPreference=no/);
 await assert.rejects(publicPreparation({})({...args(),preparePreferenceReviews:'true'}),/boolean/);
 await assert.rejects(publicPreparation({exercisePreferences:'Seated'})({...args(),[existingTemplatePreview]:true}),/Scoped preference review required/);
});

test('actual dispatch entry rejects prepare flag on create and every non-preview workflow',async()=>{
 const start=source.indexOf('async function dispatch(name, args = {}) {');const end=source.indexOf('\n',source.indexOf("name !== 'speediance_preview_program'",start));assert.ok(start>=0&&end>start);
 const entry=new Function(source.slice(start,end)+"return 'qualified';}return dispatch;")();
 for(const name of ['speediance_create_program','speediance_update_saved_program','speediance_preview_saved_program_schedule'])for(const value of [true,false])await assert.rejects(entry(name,{preparePreferenceReviews:value}),/wyłącznie/);
 assert.equal(await entry('speediance_preview_program',{preparePreferenceReviews:true}),'qualified');
});
