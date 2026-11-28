import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveSetRowTechniqueValue} from '../plugin/training-evidence.mjs';
import {normalizeSupersetBlocks} from '../plugin/superset-serialization.mjs';
const exercise=(entryId,id=1)=>({id,entryId,sets:[{unit:'reps',reps:8,rest:5},{unit:'reps',reps:8,rest:90}]});
test('technique detector excludes actual superset entries with repeated catalog identity',()=>{
 const exercises=[exercise(10),exercise(11)];
 assert.equal(deriveSetRowTechniqueValue(exercises),'set-rows:10:rest-pause-cluster@1-2;11:rest-pause-cluster@1-2');
 const blocks=normalizeSupersetBlocks([{members:[{exerciseId:10,setupKey:'mat'},{exerciseId:11,setupKey:'mat'}],rounds:2,transitionRestSeconds:5,recoveryRestSeconds:90}],exercises);
 assert.equal(deriveSetRowTechniqueValue(exercises,blocks),'not_used');
});
test('superset exclusion never hides a different entry sharing its catalog ID',()=>{
 const exercises=[exercise(10),exercise(11),exercise(12)];
 const blocks=normalizeSupersetBlocks([{members:[{exerciseId:10,setupKey:'mat'},{exerciseId:11,setupKey:'mat'}],rounds:2,transitionRestSeconds:5,recoveryRestSeconds:90}],exercises);
 assert.equal(deriveSetRowTechniqueValue(exercises,blocks),'set-rows:12:rest-pause-cluster@1-2');
});
test('legacy entries without entryId retain catalog identity fallback',()=>{
 const exercises=[exercise(1),exercise(2,2)];for(const e of exercises)delete e.entryId;
 assert.equal(deriveSetRowTechniqueValue(exercises,[{members:[{exerciseId:1},{exerciseId:2}]}]),'not_used');
});
