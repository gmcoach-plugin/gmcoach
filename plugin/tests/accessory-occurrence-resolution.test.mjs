import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanRequiredAccessories } from '../equipment-plan-safety.mjs';
const raw='a'.repeat(64), account='b'.repeat(64), at=1_000;
function fixture(ids=[]) {
 const scope={profile:'synthetic',accountFingerprint:account,deviceType:1,groupId:101,actionLibraryId:201,rawRequirementDigest:raw};
 const context={...scope,now:at,store:{schemaVersion:1,records:[{id:'c'.repeat(48),scope,requiredAccessoryIds:ids,complete:true,source:'user-confirmed-complete',rationale:'Explicit synthetic complete requirements',createdAt:0,expiresAt:30*86400000}]},verifiedVariantScopes:[{groupId:101,actionLibraryId:201,rawRequirementDigest:raw,executableAllowed:true}]};
 const record={id:101,equipmentMetadataAvailable:false,equipmentMetadataStatus:'invalid',rawRequirementDigest:raw,rawRequirementDigestBindable:true,reportedValidRequirementSetsComplete:true,reportedValidRequirementSets:[]};
 const args={plan:{exercises:[{id:101,actionLibraryId:201}]},catalog:[record],inventory:{ownershipKnown:true,ownershipStatus:'complete',ownedAccessoryIds:[]},requirementConfirmationContext:context};
 return {args,context,record};
}
test('actual validator resolves exact confirmed empty requirements and retains provenance',()=>{
 const f=fixture();const result=validatePlanRequiredAccessories(f.args);assert.equal(result.canProceed,true);assert.equal(result.accessoryRequirements.requirements[0].requirementConfirmation.source,'user-confirmed-complete');
 f.args.plan.exercises.push({id:101,actionLibraryId:202});assert.equal(validatePlanRequiredAccessories(f.args).canProceed,false);
});
test('confirmation does not grant ownership or override independent catalogue evidence',()=>{
 const f=fixture([1]);assert.equal(validatePlanRequiredAccessories(f.args).canProceed,false);
 f.args.inventory.ownedAccessoryIds=[1];assert.equal(validatePlanRequiredAccessories(f.args).canProceed,true);
 f.record.reportedValidRequirementSets=[[2]];assert.throws(()=>validatePlanRequiredAccessories(f.args),/contradicts/);
 f.record.reportedValidRequirementSets=[];f.record.equipmentMetadataAvailable=true;f.record.requiredAccessoryIds=[];assert.throws(()=>validatePlanRequiredAccessories(f.args),/authoritative/);
});
test('stale raw scope, expiry and incomplete observed evidence never authorize',()=>{
 const f=fixture();f.record.rawRequirementDigest='d'.repeat(64);assert.equal(validatePlanRequiredAccessories(f.args).canProceed,false);
 f.record.rawRequirementDigest=raw;f.context.now=30*86400000;assert.equal(validatePlanRequiredAccessories(f.args).canProceed,false);
 f.context.now=at;f.record.reportedValidRequirementSetsComplete=false;assert.throws(()=>validatePlanRequiredAccessories(f.args),/complete fresh/);
});
test('sparse or oversized independently valid evidence cannot authorize empty requirements',()=>{
 for(const sets of [Array(1),Array.from({length:257},()=>[]),[Array(1)]]) {
  const f=fixture();f.record.reportedValidRequirementSets=sets;
  assert.throws(()=>validatePlanRequiredAccessories(f.args),/complete fresh|contradicts/);
 }
 const f=fixture();f.context.verifiedVariantScopes=Array(1);assert.throws(()=>validatePlanRequiredAccessories(f.args),/complete fresh/);
});