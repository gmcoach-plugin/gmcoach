import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportedRmSelectorPolicyRegistry} from '../imported-rm-selector-policy.mjs';
import {exportPortablePlan} from '../portable-plan-codec.mjs';
function fixture(){
 const prescription={name:'Imported',exercises:[{id:1,entryId:1,actionLibraryId:102,title:'Exact variant',section:'main',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[{unit:'reps',reps:8,rirTarget:2,mode:1,restSeconds:90,sourceRmSelector:11}]}]};
 const referenceClientJson={name:'Imported',exercises:[{id:1,title:'Exact variant',preset:1,isUnilateralExpanded:false,sets:[{reps:8,weight:11,mode:1,rest:90}]}]};
 const sidecar=exportPortablePlan({referenceClientJson,payload:{prescription,sourceOnlyOmissions:[],research:{evidence:[],decisionEvidence:[]},mapping:[{referenceClientExerciseIndex:0,referenceClientSetIndex:0,sourceEntryId:1,sourceSetIndex:0}],staticSourceContext:{unit:'unknown',protocol:'unknown'}}});
 const binding={profile:'synthetic',accountFingerprint:'a'.repeat(64),migrationIntent:'preserve-imported-rm-selectors',planName:'Imported'};
 const normalized=structuredClone(prescription.exercises);delete normalized[0].sets[0].sourceRmSelector;normalized[0].sets[0].rmLevel=13;
 return {referenceClientJson,sidecar,binding,normalized};
}
test('private capability preserves exact imported selector before science without granting approval',()=>{
 const f=fixture(),registry=createImportedRmSelectorPolicyRegistry(),mint=registry.mint({...f,...f.binding});
 assert.equal(mint.originVerified,false);assert.equal(mint.scientificApproval,false);assert.equal(mint.writeReady,false);
 const out=registry.applyBeforeScientificReview(mint.handle,f.normalized,f.binding);assert.equal(out[0].sets[0].rmLevel,11);assert.equal(f.normalized[0].sets[0].rmLevel,13);
 assert.throws(()=>registry.applyBeforeScientificReview({},f.normalized,f.binding));assert.throws(()=>registry.applyBeforeScientificReview({...mint.handle},f.normalized,f.binding));
 assert.throws(()=>createImportedRmSelectorPolicyRegistry().applyBeforeScientificReview(mint.handle,f.normalized,f.binding));
});
for(const change of ['account','profile','intent','plan','variant','title','reps','duration','side','mode','rir','rest','contradictory-rest'])test(`private selector migration rejects changed ${change}`,()=>{
 const f=fixture(),registry=createImportedRmSelectorPolicyRegistry(),mint=registry.mint({...f,...f.binding});
 registry.applyBeforeScientificReview(mint.handle,f.normalized,f.binding);
 const binding={...f.binding},rows=structuredClone(f.normalized),set=rows[0].sets[0];
 if(change==='account')binding.accountFingerprint='b'.repeat(64);if(change==='profile')binding.profile='other';if(change==='intent')binding.migrationIntent='arbitrary';if(change==='plan')binding.planName='Other';
 if(change==='variant')rows[0].actionLibraryId=101;if(change==='title')rows[0].title='Other';if(change==='reps')set.reps=9;if(change==='duration')set.durationSeconds=20;if(change==='side')set.side=1;if(change==='mode')set.mode=2;if(change==='rir')set.rirTarget=1;if(change==='rest')set.restSeconds=91;if(change==='contradictory-rest')set.rest=91;
 assert.throws(()=>registry.applyBeforeScientificReview(mint.handle,rows,binding));
});
test('expired and forgotten capability cannot be revived by a copied handle',()=>{
 let clock=100;const f=fixture(),registry=createImportedRmSelectorPolicyRegistry({now:()=>clock}),mint=registry.mint({...f,...f.binding});
 registry.applyBeforeScientificReview(mint.handle,f.normalized,f.binding);clock=600100;assert.throws(()=>registry.applyBeforeScientificReview(mint.handle,f.normalized,f.binding));
 const next=registry.mint({...f,...f.binding});registry.forget(next.handle);assert.throws(()=>registry.applyBeforeScientificReview(next.handle,f.normalized,f.binding));
});

for(const unit of ['kg','lb'])test(`mixed timed Customize ${unit} remains bound and unchanged beside imported RM`,()=>{
 const f=fixture(),prescription={name:'Imported',exercises:[...structuredClone(f.normalized),{entryId:2,id:1,actionLibraryId:101,title:'Timed distinct variant',section:'main',loadType:'customize-manual',unilateralPrescription:'explicit-sides',sets:[{unit:'seconds',durationSeconds:20,side:1,mode:2,restSeconds:0,weight:8,weightUnit:unit},{unit:'seconds',durationSeconds:30,side:2,mode:3,restSeconds:75,weight:12,weightUnit:unit}]}]};
 delete prescription.exercises[0].sets[0].rmLevel;prescription.exercises[0].sets[0].sourceRmSelector=11;
 const referenceClientJson=structuredClone(f.referenceClientJson);
 const sidecar=exportPortablePlan({referenceClientJson,payload:{prescription,research:{evidence:[],decisionEvidence:[]},mapping:[{referenceClientExerciseIndex:0,referenceClientSetIndex:0,sourceEntryId:1,sourceSetIndex:0}],sourceOnlyOmissions:[{sourceEntryId:2,sourceSetIndex:0,reason:'not-represented-in-reference-client-json'},{sourceEntryId:2,sourceSetIndex:1,reason:'not-represented-in-reference-client-json'}],staticSourceContext:{unit,protocol:'account-unit-verbatim'}}});
 const registry=createImportedRmSelectorPolicyRegistry(),mint=registry.mint({referenceClientJson,sidecar,...f.binding}),rows=structuredClone(prescription.exercises);delete rows[0].sets[0].sourceRmSelector;
 const result=registry.applyBeforeScientificReview(mint.handle,rows,f.binding);assert.equal(result[0].sets[0].rmLevel,11);assert.deepEqual(result[1],rows[1]);
 for(const mutate of [r=>r[1].sets[0].durationSeconds=21,r=>r[1].sets.reverse(),r=>r[1].sets[1].weight=13,r=>r[1].sets[1].weightUnit=unit==='kg'?'lb':'kg',r=>r.reverse()]){const changed=structuredClone(rows);mutate(changed);assert.throws(()=>registry.applyBeforeScientificReview(mint.handle,changed,f.binding));}
});
