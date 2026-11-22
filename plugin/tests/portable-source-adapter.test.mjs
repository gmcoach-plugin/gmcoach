import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveRawPortableSource,exportRepresentablePortableSource} from '../portable-source-adapter.mjs';
import {importPortablePlan} from '../portable-plan-codec.mjs';
const raw=()=>({prescription:{name:'Literal source',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'Literal variant',section:'main',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[{unit:'reps',reps:8,mode:1,restSeconds:90,rirTarget:2}]}]},research:{evidence:[],decisionEvidence:[]}});
test('raw source artifact preserves unresolved selector and contains no authority',()=>{
 const x=archiveRawPortableSource(raw());assert.equal(x.status,'unapproved-source-candidate');assert.equal(x.requiresFreshScientificPreview,true);assert.equal(x.scientificApproval,false);assert.equal(x.executionVerified,false);assert.equal(x.referenceClientExecutionCoverage,'none-source-archive-only');assert.deepEqual(x.referenceClientJson.exercises,[]);assert.equal(x.sourceArchive.prescription.exercises[0].sets[0].reps,8);assert.equal(Object.hasOwn(x.sourceArchive.prescription.exercises[0].sets[0],'sourceRmSelector'),false);assert.equal(x.sourceArchive.sourceOnlyOmissions.length,1);
});
test('real production reference client exporter literal paired source roundtrip',()=>{
 const source=raw();source.prescription.exercises[0].sets[0].sourceRmSelector=13;
 source.prescription.exercises.push({entryId:2,id:11,actionLibraryId:21,title:'Timed warmup',section:'warmup',loadType:'bodyweight',sets:[{unit:'seconds',durationSeconds:30,mode:1,restSeconds:0}]});
 const args={source,staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:false}]};
 const x=exportRepresentablePortableSource(args);
 assert.deepEqual(x.referenceClientJson,{name:'Literal source',exercises:[{id:10,title:'Literal variant',preset:1,isUnilateralExpanded:false,sets:[{reps:8,weight:13,mode:1,rest:90}]}]});
 const imported=importPortablePlan({referenceClientJson:x.referenceClientJson,sidecar:x.sidecar});assert.equal(imported.sourceArchive.prescription.exercises[1].sets[0].durationSeconds,30);assert.equal(imported.sourceArchive.mapping.length,1);assert.equal(imported.sourceArchive.sourceOnlyOmissions.length,1);assert.equal(imported.unresolvedImportedSelectors[0].selector,13);assert.equal(imported.scientificApproval,false);
 delete source.prescription.exercises[0].sets[0].sourceRmSelector;assert.throws(()=>exportRepresentablePortableSource(args),/no default/);
});
test('computed reviewed source fields and private/approval inputs reject',()=>{
 for(const field of ['recoveryContext','accessoryRequirementScope','timeEstimation']){const x=raw();x.prescription[field]={};assert.throws(()=>archiveRawPortableSource(x));}
 assert.throws(()=>archiveRawPortableSource({...raw(),approvalDigest:'fake'}));const x=raw();x.prescription.exercises[0].sets[0].rmLevel=13;assert.throws(()=>archiveRawPortableSource(x));
 let n=0;const y=raw();Object.defineProperty(y.prescription.exercises[0],'sets',{get(){n++;return [];},enumerable:true});assert.throws(()=>archiveRawPortableSource(y));assert.equal(n,0);
});
test('actual unilateral Customize export retains literal L/R loads and zero-rest string',()=>{
 const source=raw();source.prescription.exercises[0]={entryId:1,id:10,actionLibraryId:20,title:'Literal asymmetric',section:'main',loadType:'customize-manual',unilateralPrescription:'explicit-sides',sets:[{side:1,unit:'reps',reps:8,weight:7,weightUnit:'kg',mode:1,restSeconds:0},{side:2,unit:'reps',reps:10,weight:9,weightUnit:'kg',mode:3,restSeconds:75}]};
 const x=exportRepresentablePortableSource({source,staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:true}]});
 assert.deepEqual(x.referenceClientJson,{name:'Literal source',exercises:[{id:10,title:'Literal asymmetric',preset:-1,isUnilateralExpanded:true,sets:[{reps:8,weight:7,mode:1,rest:'0'},{reps:10,weight:9,mode:3,rest:75}]}]});assert.equal(x.writeReady,false);assert.deepEqual(x.sourceArchive.prescription.exercises[0].sets.map(s=>s.side),[1,2]);assert.equal(x.sourceArchive.mapping.length,2);
});
test('asymmetric reps/seconds occurrence is wholly source-only and supersets organisation is visibly omitted',()=>{
 const source=raw();source.prescription.exercises[0].sets[0].sourceRmSelector=13;
 source.prescription.exercises.push({entryId:2,id:11,actionLibraryId:21,title:'Asymmetric timed',section:'main',loadType:'customize-manual',unilateralPrescription:'explicit-sides',sets:[{side:1,unit:'reps',reps:8,weight:7,weightUnit:'kg',mode:1,restSeconds:0},{side:2,unit:'seconds',durationSeconds:30,weight:9,weightUnit:'kg',mode:3,restSeconds:75}]});
 source.prescription.supersetBlocks=[{members:[{exerciseId:1,setupKey:'a'},{exerciseId:2,setupKey:'b'}]}];
 const x=exportRepresentablePortableSource({source,staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:false}]});
 assert.equal(x.referenceClientJson.exercises.length,1);assert.deepEqual(JSON.parse(JSON.stringify(x.sourceArchive.sourceOnlyOmissions)),[{sourceEntryId:2,sourceSetIndex:0,reason:'not-represented-in-reference-client-json'},{sourceEntryId:2,sourceSetIndex:1,reason:'not-represented-in-reference-client-json'}]);assert.equal(x.sourceArchive.prescription.exercises[1].sets[1].durationSeconds,30);assert.equal(x.organisationOmissions[0].kind,'superset-interleaving-not-represented-in-reference-client-json');assert.equal(x.writeReady,false);
});

test('qualified source exports then paired declaration rejects bilateral contradiction; paired archive preserves operational transition',()=>{
 const source=raw();source.prescription.exercises[0].sets[0].sourceRmSelector=13;const args={source,staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:false}]};assert.equal(exportRepresentablePortableSource(args).referenceClientJson.exercises.length,1);
 Object.assign(source.prescription.exercises[0],{unilateralPrescription:'paired-symmetric',sideTransitionSeconds:5,sideTransitionRationale:'Reposition handle'});const archived=archiveRawPortableSource(source);assert.equal(archived.sourceArchive.prescription.exercises[0].sideTransitionSeconds,5);assert.equal(archived.sourceArchive.prescription.exercises[0].sideTransitionRationale,'Reposition handle');assert.equal(archived.writeReady,false);assert.throws(()=>exportRepresentablePortableSource(args),/bilateral export forbidden/);
 source.prescription.exercises[0].unilateralPrescription='explicit-sides';assert.throws(()=>archiveRawPortableSource(source),/paired side transition/);
});
