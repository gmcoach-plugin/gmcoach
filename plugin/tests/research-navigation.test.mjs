import test from 'node:test';
import assert from 'node:assert/strict';
import {findResearchInRetainedBatches} from '../research-navigation.mjs';

test('topic and exercise filters navigate retained sources without fetching or scientific approval',()=>{
  let reads=0;
  const batch={batchId:'b1',expiresAt:1000,sources:[
    {id:'pubmed:1',title:'Resistance training hypertrophy',abstract:'Muscle mass increased',publicationDate:'2025',matchedCategories:['weekly_volume'],hasAbstract:true},
    {id:'pubmed:2',title:'Bench press strength',abstract:'One repetition maximum improved',publicationDate:'2024',matchedCategories:['exercise_selection'],hasAbstract:true},
    {id:'pubmed:3',title:'Overhead press strength',abstract:'No bench exercise tested',publicationDate:'2023',matchedCategories:['exercise_selection'],hasAbstract:true}
  ]};
  const getBatch=id=>{reads++;return id==='b1'?batch:null};
  const base={getBatch,now:()=>100,batchIds:['b1']};
  const muscle=findResearchInRetainedBatches({...base,topic:'muscle_mass'});
  assert.deepEqual(muscle.matches.map(row=>row.sourceId),['pubmed:1']);
  assert.equal(muscle.scientificApproval,false);
  const exercise=findResearchInRetainedBatches({...base,topic:'exercise',terms:'bench press',category:'exercise_selection'});
  assert.deepEqual(exercise.matches.map(row=>row.sourceId),['pubmed:2']);
  assert.deepEqual(findResearchInRetainedBatches({...base,topic:'exercise',terms:'press bench',termMatch:'all_words',category:'exercise_selection'}).matches.map(row=>row.sourceId),['pubmed:2','pubmed:3']);
  assert.equal(reads,3);
  assert.equal(findResearchInRetainedBatches({...base,topic:'deload'}).totalMatches,0);
  assert.throws(()=>findResearchInRetainedBatches({...base,batchIds:['missing'],topic:'strength'}),/UNKNOWN_OR_EXPIRED_BATCH/);
});
