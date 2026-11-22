import test from 'node:test';import assert from 'node:assert/strict';
import {buildPresetPayload} from '../program-serialization.mjs';
import {buildSessionTable} from '../session-table.mjs';
const exercise=(entryId,sets,extra={})=>({id:42,entryId,actionLibraryId:142,title:'Same catalog movement',loadType:'bodyweight',sets,...extra});
const metadata=flag=>new Map([[42,{detail:{isLeftRight:flag},batch:{actionLibraryList:[{id:142}]}}]]);
const timed=(seconds,rest=20)=>({unit:'sec',durationSeconds:seconds,mode:1,rest});
test('serializer display rows preserve exact repeated catalog occurrences and bilateral count',()=>{
 const plan={name:'Exact entries',exercises:[exercise(10,[timed(45)]),exercise(11,[timed(30)],{section:'stretching'})]};
 const before=JSON.stringify(plan);
 const paired=buildPresetPayload(plan,metadata(1),1);
 assert.equal(JSON.stringify(plan),before);
 assert.deepEqual(paired.executionExercises.map(e=>[e.entryId,e.executionOccurrence,e.sets.map(s=>[s.side,s.durationSeconds,s.rest])]),[[10,0,[[1,45,1],[2,45,20]]],[11,1,[[1,30,1],[2,30,20]]]]);
 assert.deepEqual(paired.payload.actionLibraryList.map(a=>[a.groupId,a.setsAndReps,a.leftRight]),[[42,'45,45','1,2'],[42,'30,30','1,2']]);
 const table=buildSessionTable({...plan,exercises:paired.executionExercises});
 assert.equal(table.main[0].entryId,10);assert.equal(table.stretching[0].entryId,11);assert.match(table.stretching[0].sets,/1×30 s \(L\).*1×30 s \(P\)/);
 const bilateral=buildPresetPayload(plan,metadata(0),1);assert.deepEqual(bilateral.executionExercises.map(e=>e.sets.map(s=>s.side)),[[0],[0]]);
 assert.doesNotMatch(buildSessionTable({...plan,exercises:bilateral.executionExercises}).main[0].sets,/\(L\)|\(P\)/);
});
test('display rows cannot bless conflicting unilateral metadata or mismatched exact variant',()=>{
 const plan={name:'Invalid metadata',exercises:[exercise(10,[timed(45)])]};
 assert.throws(()=>buildPresetPayload(plan,new Map([[42,{detail:{isLeftRight:1},batch:{isLeftRight:0,actionLibraryList:[{id:142}]}}]]),1),/metadane stron/);
 assert.throws(()=>buildPresetPayload(plan,new Map([[42,{detail:{isLeftRight:1},batch:{actionLibraryList:[{id:143}]}}]]),1),/nie jest jednoznacznie/);
});
test('table grouping retains distinct fixed loads, levels and cardio intensity',()=>{
 const table=buildSessionTable({exercises:[exercise(10,[{...timed(45),weightKg:4},{...timed(45),weightKg:5},{...timed(45),level:2},{...timed(45),level:3},{...timed(45),intensity:4},{...timed(45),intensity:5}])]});
 assert.match(table.main[0].sets,/4 kg.*5 kg.*level 2.*level 3.*4\/10.*5\/10/);assert.doesNotMatch(table.main[0].sets,/2×/);
});
