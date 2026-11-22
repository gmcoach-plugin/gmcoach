import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSketchTime} from '../sketch-time.mjs';
const zero={minSeconds:0,maxSeconds:0};
const row=(label,patch={})=>({label,section:'main',side:'bilateral',work:{unit:'reps',reps:12,secondsPerRepRange:{minSeconds:3,maxSeconds:4}},restAfterRange:zero,transitionAfterRange:zero,overlapAfterSeconds:0,...patch});
const run=rows=>calculateSketchTime({rows,additionalSetupRange:zero});
test('three sets each side are six occurrences with216–288 seconds work',()=>{
 const r=run(Array.from({length:6},(_,i)=>row(`set${i+1}`,{side:i%2?'right':'left'})));
 assert.deepEqual(r.components.workSeconds,{minSeconds:216,maxSeconds:288});assert.equal(r.executionVerified,false);assert.equal(r.scientificApproval,false);assert.equal(r.writeReady,false);
});
test('rest and setup overlap is explicit and added only once',()=>{
 const r=run([row('a',{restAfterRange:{minSeconds:60,maxSeconds:60},transitionAfterRange:{minSeconds:5,maxSeconds:5},overlapAfterSeconds:5}),row('b')]);
 assert.deepEqual(r.components.netGapsSeconds,{minSeconds:60,maxSeconds:60});assert.deepEqual(r.totalSeconds,{minSeconds:132,maxSeconds:156});
 assert.throws(()=>run([row('a',{overlapAfterSeconds:1}),row('b')]));
});
test('unknown tempo setup and overlap never mean zero or fits',()=>{
 const r=calculateSketchTime({rows:[row('a',{work:{unit:'reps',reps:12,secondsPerRepRange:null}})],additionalSetupRange:null,sessionLimitMinutes:90});
 assert.equal(r.coverage,'partial');assert.equal(r.totalSeconds.maxSeconds,null);assert.equal(r.budgetStatus,'unknown');assert.equal(r.unknown.length,2);
 const gap=run([row('a',{restAfterRange:{minSeconds:60,maxSeconds:60},transitionAfterRange:{minSeconds:5,maxSeconds:5},overlapAfterSeconds:null}),row('b')]);assert.equal(gap.components.netGapsSeconds.minSeconds,60);assert.equal(gap.totalSeconds.maxSeconds,null);
});
test('asymmetric times warmup cooldown and final gap rules',()=>{
 const r=run([row('warm',{section:'warmup',side:'not-applicable',work:{unit:'seconds',durationSeconds:30}}),row('left',{side:'left',work:{unit:'seconds',durationSeconds:20}}),row('right',{side:'right',work:{unit:'seconds',durationSeconds:35}}),row('cool',{section:'cooldown',side:'not-applicable',work:{unit:'seconds',durationSeconds:25}})]);
 assert.deepEqual(r.totalSeconds,{minSeconds:110,maxSeconds:110});assert.throws(()=>run([row('last',{restAfterRange:{minSeconds:1,maxSeconds:1}})]));
});
test('strict bounded plain data never invokes getters or accepts mixed doses',()=>{
 let invoked=0;assert.throws(()=>calculateSketchTime({get rows(){invoked++;return [];},additionalSetupRange:zero}));assert.equal(invoked,0);
 assert.throws(()=>run([row('a',{work:{unit:'reps',reps:12,durationSeconds:30,secondsPerRepRange:zero}})]));
 assert.throws(()=>run(Array.from({length:101},(_,i)=>row(`a${i}`))));assert.throws(()=>run([row('duplicate'),row('duplicate')]));assert.throws(()=>run(new Array(2)));
 assert.throws(()=>run([row('a',{restAfterRange:{get minSeconds(){invoked++;return 0;},maxSeconds:0}})]));assert.equal(invoked,0);
});
test('observed318 session arithmetic regressions preserve exact occurrence sums',()=>{
 const exact=reps=>({unit:'reps',reps,secondsPerRepRange:{minSeconds:3,maxSeconds:3}});
 const upper=run([40,24,16,20,20,20,20,20,32].map((reps,i)=>row(`upper${i}`,{work:exact(reps)})));
 const lower=run([40,24,20,20,50].map((reps,i)=>row(`lower${i}`,{work:exact(reps)})));
 assert.deepEqual(upper.components.workSeconds,{minSeconds:636,maxSeconds:636});assert.deepEqual(lower.components.workSeconds,{minSeconds:462,maxSeconds:462});
});
test('budget exact fits exceeds overlap and unknown sides never imply fits',()=>{
 const rows=[row('one',{work:{unit:'seconds',durationSeconds:120}})];
 assert.equal(calculateSketchTime({rows,additionalSetupRange:zero,sessionLimitMinutes:2}).budgetStatus,'estimated-fits');
 assert.equal(calculateSketchTime({rows,additionalSetupRange:zero,sessionLimitMinutes:1}).budgetStatus,'estimated-exceeds');
 assert.equal(calculateSketchTime({rows:[row('one')],additionalSetupRange:zero,sessionLimitMinutes:0.7}).budgetStatus,'overlaps');
 const unknown=calculateSketchTime({rows:[row('one',{side:'unknown'})],additionalSetupRange:zero,sessionLimitMinutes:90});assert.equal(unknown.budgetStatus,'unknown');assert.equal(unknown.coverage,'partial');
 const lower=run([row('one',{work:{unit:'reps',reps:12,secondsPerRepRange:{minSeconds:3,maxSeconds:null}}})]);assert.deepEqual(lower.totalSeconds,{minSeconds:36,maxSeconds:null});
});
test('nested descriptors and array properties are rejected before invocation',()=>{
 let calls=0;const getter=()=>{calls++;return 0;};
 const badRow=row('one');Object.defineProperty(badRow,'side',{get:getter});assert.throws(()=>run([badRow]));
 const badWork={unit:'seconds'};Object.defineProperty(badWork,'durationSeconds',{get:getter});assert.throws(()=>run([row('one',{work:badWork})]));
 const badArray=[row('one')];Object.defineProperty(badArray,'0',{get:getter});assert.throws(()=>run(badArray));
 const limit={rows:[row('one')],additionalSetupRange:zero};Object.defineProperty(limit,'sessionLimitMinutes',{get:getter});assert.throws(()=>calculateSketchTime(limit));
 const extra=[row('one')];extra.extra=true;assert.throws(()=>run(extra));assert.equal(calls,0);
 const exotic=[row('one')];Object.setPrototypeOf(exotic,null);assert.throws(()=>run(exotic));
 assert.throws(()=>calculateSketchTime({rows:[row('one')],additionalSetupRange:zero,profile:'private'}));
});
test('identity diagnostics distinguish label, duplicate, section and side without echoing inputs',()=>{
 const message=rows=>{try{run(rows);}catch(error){assert.ok(error instanceof TypeError);return error.message;}assert.fail('Expected identity rejection');};
 for(const label of ['Upper A_main-private', '', 'ę', 'a'.repeat(81), null]){
  const actual=message([row('valid'),row(label)]);
  assert.match(actual,/^Sketch row 2: label must/);assert.match(actual,/\[A-Za-z0-9\._-\]/);
  if(typeof label==='string'&&label.length>1)assert.equal(actual.includes(label),false);
 }
 const duplicate=message([row('private_unique'),row('private_unique')]);
 assert.match(duplicate,/^Sketch row 2: duplicate label;/);assert.equal(duplicate.includes('private_unique'),false);
 const section=message([row('valid'),row('second',{section:'private_section'})]);
 assert.match(section,/^Sketch row 2: section must be warmup, main, or cooldown\.$/);assert.equal(section.includes('private_section'),false);
 const side=message([row('valid'),row('second',{side:'private_side'})]);
 assert.match(side,/^Sketch row 2: side must be left, right, bilateral, not-applicable, or unknown\.$/);assert.equal(side.includes('private_side'),false);
 assert.doesNotThrow(()=>run([row('Upper_A.main-1')]));
});
test('all identity getters are rejected without invocation before diagnostics',()=>{
 let calls=0;
 for(const field of ['label','section','side']){
  const candidate=row('valid');Object.defineProperty(candidate,field,{enumerable:true,get(){calls++;return 'private';}});
  assert.throws(()=>run([candidate]),TypeError);
 }
 assert.equal(calls,0);
});
test('nonfinite numeric and aggregate resource bounds fail deterministically',()=>{
 for(const value of [NaN,Infinity,-1,86401])assert.throws(()=>run([row('one',{work:{unit:'seconds',durationSeconds:value}})]));
 assert.throws(()=>run([row('one',{work:{unit:'reps',reps:1.5,secondsPerRepRange:zero}})]));
 assert.throws(()=>run([row('one',{work:{unit:'reps',reps:1001,secondsPerRepRange:zero}})]));
 assert.throws(()=>run(Array.from({length:100},(_,i)=>row(`large${i}`,{work:{unit:'reps',reps:1000,secondsPerRepRange:{minSeconds:86400,maxSeconds:86400}}}))));
 assert.throws(()=>calculateSketchTime({rows:[row('one')],additionalSetupRange:zero,sessionLimitMinutes:1441}));
});

test('section totals use exact rows, unilateral sides, explicit overlap and originating boundary gaps',()=>{
 const exact=n=>({minSeconds:n,maxSeconds:n});
 const r=calculateSketchTime({rows:[row('warm',{section:'warmup',work:{unit:'seconds',durationSeconds:30},restAfterRange:exact(10),transitionAfterRange:exact(5),overlapAfterSeconds:5}),row('left',{side:'left',work:{unit:'seconds',durationSeconds:20},restAfterRange:exact(60),transitionAfterRange:exact(5),overlapAfterSeconds:5}),row('right',{side:'right',work:{unit:'seconds',durationSeconds:35},restAfterRange:exact(15)}),row('cool',{section:'cooldown',work:{unit:'seconds',durationSeconds:25}})],additionalSetupRange:exact(12)});
 assert.deepEqual(r.bySection.warmup.totalSeconds,exact(40));assert.deepEqual(r.bySection.main.totalSeconds,exact(130));assert.deepEqual(r.bySection.cooldown.totalSeconds,exact(25));
 assert.deepEqual(r.bySection.main.components.workSeconds,exact(55));assert.deepEqual(r.bySection.main.components.restSeconds,exact(75));assert.deepEqual(r.bySection.main.components.transitionSeconds,exact(5));assert.deepEqual(r.bySection.main.components.overlapSeconds,exact(5));assert.deepEqual(r.bySection.main.components.netGapsSeconds,exact(75));assert.equal(r.bySection.main.rowCount,2);
 assert.deepEqual(r.totalSeconds,exact(207));assert.equal(Object.values(r.bySection).reduce((n,x)=>n+x.totalSeconds.minSeconds,0)+r.components.additionalSetupSeconds.minSeconds,207);
 assert.equal(Object.hasOwn(r.bySection.main.components,'additionalSetupSeconds'),false);
 assert.throws(()=>calculateSketchTime({rows:[row('last',{restAfterRange:exact(1)})],additionalSetupRange:exact(12)}));
 assert.throws(()=>calculateSketchTime({rows:[row('last')],additionalSetupRange:exact(-1)}));
});
test('unknown section bounds and side coverage persist; exclusive setup does not infect known sections',()=>{
 const r=calculateSketchTime({rows:[row('warm',{section:'warmup',side:'unknown',work:{unit:'seconds',durationSeconds:30}}),row('main',{work:{unit:'reps',reps:10,secondsPerRepRange:{minSeconds:3,maxSeconds:null}},restAfterRange:{minSeconds:10,maxSeconds:10},transitionAfterRange:{minSeconds:5,maxSeconds:5},overlapAfterSeconds:null}),row('cool',{section:'cooldown',work:{unit:'seconds',durationSeconds:20}})],additionalSetupRange:null,sessionLimitMinutes:90});
 assert.deepEqual(r.bySection.warmup.totalSeconds,{minSeconds:30,maxSeconds:30});assert.equal(r.bySection.warmup.coverage,'partial');assert.equal(r.bySection.main.totalSeconds.minSeconds,40);assert.equal(r.bySection.main.totalSeconds.maxSeconds,null);assert.equal(r.bySection.main.components.overlapSeconds.maxSeconds,null);assert.equal(r.bySection.cooldown.coverage,'complete');assert.equal(r.totalSeconds.maxSeconds,null);assert.equal(r.budgetStatus,'unknown');
 const only=run([row('main')]);assert.deepEqual(only.bySection.warmup.totalSeconds,{minSeconds:0,maxSeconds:0});assert.equal(only.bySection.warmup.rowCount,0);
});
