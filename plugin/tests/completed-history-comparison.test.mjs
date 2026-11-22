import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCompletedHistoryRows as compare} from '../completed-history-comparison.mjs';
const A={sessionId:'42',sessionType:'program',date:'2026-10-01'},B={sessionId:'43',sessionType:'program',date:'2026-10-08'};
const set=(reps=8,weight=40)=>({set:1,side:0,unit:'reps',reps,summaryWeight:weight,weightUnit:'kg',summaryWeightSource:'api-set-summary',summaryWeightProvenance:{method:'reported-scalar',divisor:1},reportedSettingCodes:[{field:'sportMode',status:'reported-code',code:1},{field:'templatePresetId',status:'reported-code',code:1}]});
const row=(id,sets)=>({...id,datePrecision:'day',groupId:100,actionLibraryId:101,sets});
const run=(x=set(),y=set(10,42),more={})=>compare({rows:[row(A,[x]),row(B,[y])],sessionA:A,sessionB:B,...more});
test('useful exact observed reps and scalar deltas without tonnage Epley or benefit inference',()=>{
 const r=run();assert.equal(r.changes.find(x=>x.metric==='reps').deltaBMinusA,2);assert.equal(r.changes.find(x=>x.metric==='summaryWeight').deltaBMinusA,2);
 assert.equal(r.physiologicalProgressionConfirmed,false);assert.equal(r.volumeCalculated,false);assert.equal(r.chronology,'A-before-B');
});
test('unit source side and settings changes retain dose separately and prohibit load delta',()=>{
 for(const patch of [{weightUnit:'lb'},{summaryWeightSource:'different-source'},{reportedSettingCodes:undefined},{summaryWeightProvenance:{method:'reported-scalar',divisor:2}}]){
  const r=run(set(),{...set(10,42),...patch});assert.ok(r.changes.some(x=>x.metric==='reps'));assert.ok(!r.changes.some(x=>x.metric==='summaryWeight'));
 }
 const r=run({...set(),side:1},{...set(10),side:2});assert.ok(!r.changes.some(x=>x.metric==='reps'));assert.ok(r.diagnostics.some(x=>x.reason==='unmatched-set'));
});
test('same-day explicit sessions have no inferred order and duplicate exercises are never overwritten',()=>{
 const b={...B,date:A.date};const r=compare({rows:[row(A,[set()]),row(b,[set(10)])],sessionA:A,sessionB:b});assert.equal(r.chronology,'same-day-order-unverified');
 const duplicate=compare({rows:[row(A,[set()]),row(A,[set()]),row(B,[set(10)])],sessionA:A,sessionB:B});assert.equal(duplicate.changes.length,0);assert.equal(duplicate.diagnostics[0].reason,'ambiguous-exercise-occurrence');
});
test('timed actual elapsed change never compares prescribed duration or reps',()=>{
 const r=run({set:1,unit:'seconds',elapsedSeconds:20,durationSeconds:30},{set:1,unit:'seconds',elapsedSeconds:25,durationSeconds:30});
 assert.equal(r.changes.find(x=>x.metric==='elapsedSeconds').deltaBMinusA,5);assert.ok(!r.changes.some(x=>x.metric==='durationSeconds'));
 assert.equal(r.changes.find(x=>x.metric==='elapsedSeconds').interpretation,'reported-elapsed-time-not-confirmed-work-dose');
});
test('missing side allows repetitions but never load comparison; literal zero remains reported',()=>{
 const r=run({...set(),side:undefined},{...set(10,42),side:undefined});
 assert.ok(r.changes.some(x=>x.metric==='reps'));assert.ok(!r.changes.some(x=>x.metric==='summaryWeight'));
 const positive=run();assert.equal(positive.changes.find(x=>x.metric==='summaryWeight').side,0);
});
test('bounded output and unsupported input descriptors',()=>{
 const sets=Array.from({length:100},(_,i)=>({...set(),set:i+1}));const r=compare({rows:[row(A,sets),row(B,sets)],sessionA:A,sessionB:B,partial:true});assert.equal(r.changes.length,64);assert.ok(r.omittedChangeCount>0);assert.equal(r.partial,true);
 let called=0;assert.throws(()=>compare({rows:[{get sessionId(){called++;return '42';}}],sessionA:A,sessionB:B}));assert.equal(called,0);
 assert.throws(()=>compare({rows:new Array(2),sessionA:A,sessionB:B}));
});
test('peak metric uses own unit and provenance classification does not hide scale changes',()=>{
 const peak=(unit,value)=>({...set(),summaryWeight:undefined,reportedCablePeakLoad:value,reportedCablePeakLoadStatus:'reported-telemetry-peak',reportedCablePeakLoadUnit:unit,reportedCablePeakLoadEvidence:{source:'telemetry',algorithm:'reported-max',sourceFields:['weights'],perRepTelemetry:false,assessedOneRepMax:false}});
 assert.ok(!run(peak('kg',10),peak('lb',12)).changes.some(x=>x.metric==='reportedCablePeakLoad'));
 const r=run(peak('kg',10),peak('kg',12));assert.equal(r.changes.find(x=>x.metric==='reportedCablePeakLoad').unit,'kg');
 assert.ok(!run(set(),{...set(10,42),summaryWeightProvenance:{method:'reported-scalar',divisor:1,status:'changed',factor:2}}).changes.some(x=>x.metric==='summaryWeight'));
 let called=0;assert.throws(()=>run({...set(),completedNumericDiagnostics:{get length(){called++;return 0;}}}));assert.equal(called,0);
});
