import { normalizePreferenceReviews, preferenceReviewsSchema } from '../preference-compliance.mjs';
import { runWithRecoveryFixture } from './recovery-fixture.mjs';
import { normalizeRecoveryContextDeclaration } from '../recovery-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as payloadFunctions from '../program-payload.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../executable-plan-sections.mjs';
import { buildPresetPayload } from '../program-serialization.mjs';
import { buildSavedTemplateUpdatePayload, savedTemplateDigest, verifyUpdatedTemplateReadback, getSavedTemplateId, applySmartRmConversions, applyReferenceClientResistanceModeUpdates } from '../saved-templates.mjs';
import { getReferenceClientRmPresetByName } from '../preset-mapping.mjs';
import { reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope } from '../saved-edit-diff.mjs';
import { expandPlanForSerialization } from '../superset-serialization.mjs';
import { createSavedPlanIdentity } from '../saved-plan-identity.mjs';
import { createReviewedPlanRecord, inspectReviewedPlanRecord, historicalReviewForDisplay, snapshotNormalizedPlan } from '../reviewed-plan-record.mjs';

function fixture() {
  const accountFingerprint = 'a'.repeat(64);
  const exercise = { id: 42, entryId: 101, actionLibraryId: 7, section: 'main', title: 'Bodyweight exercise', loadType: 'bodyweight', sets: [{ reps: 8, unit: 'reps', weightKg: undefined, mode: 1, rest: 90 }] };
  Object.defineProperty(exercise, 'fixedKgAuthorized', {value: false});
  const plan = { name: 'Reviewed plan', exercises: [exercise], evidence: [{ id: 'source' }], decisionEvidence: [{ category: 'exercise_selection' }], warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const metadataById = new Map([[42, {batch: {actionLibraryList: [{id: 7}]}, detail: {isLeftRight: 0, isBarbell: 0}}]]);
  const payload = buildPresetPayload(plan, metadataById, 1, 'kg').payload;
  const wire = {...structuredClone(payload), id: 1001, code: 'template-1'};
  const context = {metadataById, deviceType: 1, displayUnit: undefined, staticLoadContext: {}};
  const args = { ...context, pluginVersion: '1.0.98', reviewedAt: '2026-10-03T12:00:00.000Z', accountFingerprint, intakeFingerprint: 'b'.repeat(64), staticContextDigest: 'c'.repeat(64), templateCode: wire.code, plan, verifiedReadback: wire, savedPlanIdentity: createSavedPlanIdentity(plan, [{ exercise }], buildSavedTemplateUpdatePayload(wire), accountFingerprint) };
  const current = { ...context, currentWirePayload: wire, accountFingerprint, intakeFingerprint: args.intakeFingerprint, staticContextDigest: args.staticContextDigest, templateCode: wire.code };  return { args, current };
}


function requirementScope(){return{version:1,inventoryStatus:'complete',inventorySource:'user-confirmed-local',inventoryDigest:'d'.repeat(64),requirements:[{occurrenceIndex:0,catalogId:42,entryId:101,actionLibraryId:7,section:'main',metadataStatus:'valid-empty',requiredAccessoryIds:[],setupStatus:'unknown',catalogMetadataDigest:'e'.repeat(64),requirementConfirmation:{source:'user-confirmed-complete',id:'f'.repeat(48),groupId:42,actionLibraryId:7,rawRequirementDigest:'a'.repeat(64),createdAt:1000,expiresAt:1000+30*86400000,activeStoreDigest:'b'.repeat(64)}}]};}
for(const edit of [false,true])test(`actual reviewed record ${edit?'saved edit':'creation'} persists bounded exact accessory confirmation provenance`,()=>{
 const{args,current}=fixture();args.plan.accessoryRequirementScope=requirementScope();
 if(edit){
  // Actual v2 verifier requires the supplied current context to equal the
  // persisted context fingerprint; this fixture originally omitted it.
  args.staticLoadContext={contextDigest:args.staticContextDigest};
  current.staticLoadContext=args.staticLoadContext;
  args.savedEdit={baselineTemplate:args.verifiedReadback,baseDigest:savedTemplateDigest(args.verifiedReadback),allowedChanges:['name'],occurrenceMapping:null,finalWirePayload:buildSavedTemplateUpdatePayload(args.verifiedReadback,args.staticLoadContext)};
 }
 const record=createReviewedPlanRecord(args);assert.deepEqual(record.plan.accessoryRequirementScope,args.plan.accessoryRequirementScope);
 assert.equal(inspectReviewedPlanRecord({...current,record}).status,'historical-review-matched');
 const historical=historicalReviewForDisplay(record,args.accountFingerprint,args.templateCode);assert.equal(historical.status,'historical-unverified');assert.deepEqual(historical.plan.accessoryRequirementScope,args.plan.accessoryRequirementScope);
 const changed=structuredClone(record);changed.plan.accessoryRequirementScope.requirements[0].requirementConfirmation.id='0'.repeat(48);assert.equal(inspectReviewedPlanRecord({...current,record:changed}).status,'invalid');
 const legacy=fixture();assert.equal(inspectReviewedPlanRecord({...legacy.current,record:createReviewedPlanRecord(legacy.args)}).status,'historical-review-matched');
});
for(const mutation of [scope=>scope.requirements[0].requirementConfirmation.groupId=999,scope=>scope.requirements[0].requirementConfirmation.source='api-confirmed',scope=>scope.requirements[0].requirementConfirmation.expiresAt=Infinity,scope=>scope.requirements[0].requiredAccessoryIds=[1,1],scope=>scope.extra=true,scope=>scope.requirements[0].requirementConfirmation=null,scope=>scope.requirements[0].requirementConfirmation=false,scope=>scope.requirements[0].entryId=999,scope=>scope.requirements[0].actionLibraryId=999,scope=>scope.requirements[0].metadataStatus='valid-ids',scope=>scope.requirements=[]])test('actual normalized snapshot rejects invalid accessory scope '+mutation.toString(),()=>{const{args}=fixture();args.plan.accessoryRequirementScope=requirementScope();mutation(args.plan.accessoryRequirementScope);assert.throws(()=>snapshotNormalizedPlan(args.plan));});

for(const location of ['accessoryRequirementScope','exercises','exercise-id'])test('normalized snapshot rejects getter without invocation '+location,()=>{
 const{args}=fixture();args.plan.accessoryRequirementScope=requirementScope();let calls=0;
 const target=location==='exercise-id'?args.plan.exercises[0]:args.plan;
 const key=location==='exercise-id'?'id':location;
 Object.defineProperty(target,key,{enumerable:true,configurable:true,get(){calls++;throw new Error('Getter invoked');}});
 assert.throws(()=>snapshotNormalizedPlan(args.plan),/accessors/);assert.equal(calls,0);
});
