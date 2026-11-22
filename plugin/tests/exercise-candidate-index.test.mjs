import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExerciseCandidateIndex} from '../exercise-candidate-index.mjs';

test('one candidate index covers main, warmup and stretching without promoting unknown equipment',()=>{
  const rows=[
    {id:1,title:'Incline Chest Press',category:'Strength',mainMuscleGroupName:'Chest',mainMuscleGroupStatus:'available',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-ids',requiredAccessoryIds:[7],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:101,name:'Bench'}]},
    {id:2,title:'Dynamic Chest Mobility',category:'Warmup',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:102}]},
    {id:3,title:'Chest Stretch',category:'Stretching',equipmentMetadataAvailable:false,equipmentMetadataStatus:'invalid',requiredAccessoryIds:[],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:103}]},
    {id:4,title:'Chest Stretch with Loops',category:'Stretching',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-ids',requiredAccessoryIds:[9],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:104}]}
  ];
  const inventory={ownershipKnown:true,ownedAccessories:[{id:7}],catalog:[{id:7,name:'Bench'}]};
  const index=buildExerciseCandidateIndex(rows,inventory,[{section:'main',terms:'chest press'},{section:'warmup',terms:'chest mobility'},{section:'stretching',terms:'chest stretch'}],8);
  assert.equal(index.results.length,3);
  assert.equal(index.results[0].candidates[0].groupId,1);
  assert.equal(index.results[1].candidates[0].groupId,2);
  assert.equal(index.results[2].candidates.find(row=>row.groupId===3).equipmentStatus,'requirements-unknown');
  assert.equal(index.results[2].candidates.find(row=>row.groupId===3).accessoryMetadataStatus,'unknown');
  assert.equal(index.results[2].candidates.find(row=>row.groupId===4).accessoryMetadataStatus,'confirmed');
  assert.equal(index.results[2].candidates.find(row=>row.groupId===4).equipmentStatus,'missing-accessory');
  assert.equal(index.results[0].candidates[0].actionLibraryVariants[0].id,101);
  assert.deepEqual(index.results[0].candidates[0].requiredAccessories,[{id:7,name:'Bench',nameStatus:'catalog-confirmed'}]);
  assert.deepEqual(index.results[2].candidates.find(row=>row.groupId===4).requiredAccessories,[{id:9,name:null,nameStatus:'unknown'}]);
  assert.equal(index.categories.reduce((sum,row)=>sum+row.count,0),4);
  assert.deepEqual(index.muscleGroups,[{muscle:'Chest',count:1}]);
  assert.equal(buildExerciseCandidateIndex(rows,inventory,[{section:'main',groupId:1}]).results[0].candidates[0].groupId,1);
  assert.deepEqual(buildExerciseCandidateIndex(rows,inventory,[{section:'main',groupId:101}]).results[0].identifierHint,{status:'variant-id-used-as-group-id',suggestedGroupId:1,actionLibraryId:101});
  const savedPair=buildExerciseCandidateIndex(rows,inventory,[{groupId:1,actionLibraryId:101}]).results[0];
  assert.equal(savedPair.section,'main');
  assert.equal(savedPair.candidates[0].requestedVariantStatus,'observed-exact');
});

test('equally relevant candidates prefer confirmed accessory metadata',()=>{
  const rows=[
    {id:1,title:'Chest Stretch',category:'Stretching',equipmentMetadataAvailable:false,variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:11}]},
    {id:2,title:'Chest Stretch',category:'Stretching',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:22}]}
  ];
  const result=buildExerciseCandidateIndex(rows,{ownershipKnown:true,ownedAccessories:[]},[{section:'stretching',terms:'chest stretch'}]);
  assert.equal(result.results[0].candidates[0].groupId,2);
  assert.equal(result.results[0].candidates[0].accessoryMetadataStatus,'confirmed');
});

test('exact exercise name outranks related but different movement',()=>{
  const rows=[
    {id:1,title:'Seated Barbell Reverse-Grip Shoulder Press',category:'Strength',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'observed-list'},
    {id:2,title:'Seated Barbell Shoulder Press',category:'Strength',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'unavailable'}
  ];
  const result=buildExerciseCandidateIndex(rows,{ownershipKnown:true,ownedAccessories:[]},[{section:'main',terms:'Seated Barbell Shoulder Press'}]);
  assert.equal(result.results[0].candidates[0].groupId,2);
});

test('unknown ownership and incomplete variants remain explicit',()=>{
  const index=buildExerciseCandidateIndex([{id:1,title:'Hip Stretch',category:'Recovery',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'unavailable'}],{ownershipKnown:false,ownedAccessories:[]},[{section:'stretching',terms:'hip'}]);
  assert.equal(index.results[0].candidates[0].equipmentStatus,'ownership-unknown');
  assert.deepEqual(index.results[0].candidates[0].actionLibraryVariants,[]);
  assert.equal(index.executableApproval,false);
  assert.throws(()=>buildExerciseCandidateIndex([],{},[{section:'main',terms:'--'}]));
  assert.equal(buildExerciseCandidateIndex([{id:1,title:'Hip Stretch',category:'Recovery'}],{ownershipKnown:false,ownedAccessories:[]},Array.from({length:32},()=>({section:'stretching',groupId:1}))).results.length,32);
});
test('ready candidates skip incomplete metadata and unavailable equipment while preserving exact IDs',()=>{
  const rows=[
    {id:1,title:'Thoracic Rotation',category:'Warmup',equipmentMetadataAvailable:false,variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:101}]},
    {id:2,title:'Thoracic Rotation with Handles',category:'Warmup',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-ids',requiredAccessoryIds:[5],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:102}]},
    {id:3,title:'Thoracic Rotation with Bench',category:'Warmup',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-ids',requiredAccessoryIds:[1],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:103}]}
  ];
  const result=buildExerciseCandidateIndex(rows,{ownershipKnown:true,ownedAccessories:[{id:5}]},[{section:'warmup',terms:'Thoracic Rotation'}],1).results[0];
  assert.equal(result.candidates[0].groupId,1);
  assert.equal(result.readyCandidateCount,1);
  assert.deepEqual(result.readyCandidates,[{groupId:2,title:'Thoracic Rotation with Handles',actionLibraryId:102,requiredAccessoryIds:[5]}]);
});
test('partial title match becomes a labelled same-muscle substitute',()=>{
  const rows=[{id:1,title:'Seated Leg Curl',category:'Stretch',mainMuscleGroupName:'Hamstrings',mainMuscleGroupStatus:'available',equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[],variantCatalogStatus:'observed-list',actionLibraryVariants:[{id:101}]}];
  const result=buildExerciseCandidateIndex(rows,{ownershipKnown:true,ownedAccessories:[]},[{section:'stretching',terms:'hamstring stretch'}]).results[0];
  assert.equal(result.totalCandidates,1);
  assert.equal(result.readyCandidateCount,1);
  assert.equal(result.autoSubstitute.groupId,1);
  assert.equal(result.readyCandidates[0].groupId,1);
});
