import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {calculateCompactSketch,compactSketchInputSchema} from '../compact-sketch.mjs';

const fixed=n=>({minSeconds:n,maxSeconds:n});
const block=(id,overrides={})=>({id,section:'main',setCount:3,sides:['bilateral'],work:{unit:'reps',reps:10,secondsPerRepRange:fixed(3)},loadMode:'other',restWithinSetRange:fixed(0),restBetweenSetsRange:fixed(60),restAfterBlockRange:fixed(0),transitionAfterBlockRange:fixed(0),...overrides});

test('compact plan expands exact sets and gives the same bounded time ledger',()=>{
  const result=calculateCompactSketch({blocks:[block('press',{restAfterBlockRange:fixed(30),transitionAfterBlockRange:fixed(20)}),block('row',{setCount:2,sides:['left','right'],work:{unit:'seconds',durationSeconds:30},restWithinSetRange:fixed(10),restBetweenSetsRange:fixed(45)})],additionalSetupRange:fixed(120),sessionLimitMinutes:30});
  assert.equal(result.expansion.blockCount,2);
  assert.equal(result.expansion.rowCount,7);
  assert.deepEqual(result.rows.map(row=>row.label),['press.s1.bilateral','press.s2.bilateral','press.s3.bilateral','row.s1.left','row.s1.right','row.s2.left','row.s2.right']);
  assert.equal(result.components.workSeconds.minSeconds,210);
  assert.equal(result.components.restSeconds.minSeconds,215);
  assert.equal(result.components.transitionSeconds.minSeconds,20);
  assert.equal(result.totalSeconds.minSeconds,565);
  assert.equal(result.budgetStatus,'estimated-fits');
  assert.equal(result.scienceScopeHints.timedExercisePresent,true);
  assert.equal(result.scienceScopeHints.smartRmPresent,false);
  assert.equal(result.writeReady,false);
  assert.equal(result.scientificApproval,false);
});

test('compact plan rejects ambiguous or hidden timing',()=>{
  const base={blocks:[block('press')],additionalSetupRange:fixed(0)};
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{transitionAfterBlockRange:fixed(10)})]}),/Final row/);
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{restAfterBlockRange:fixed(10)})]}),/Final row/);
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{sides:['left','bilateral']})]}),/side/);
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press'),block('press')]}),/unique/);
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{loadMode:'smart-rm',smartRmPreset:'Strength'})]}),/repetition range/);
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{loadMode:'smart-rm',smartRmPreset:'Stamina'})]}),/repetition range/);
  const smart=calculateCompactSketch({...base,blocks:[block('press',{loadMode:'smart-rm',smartRmPreset:'Gain Muscle'})]});
  assert.equal(smart.expansion.smartRmPresetRangesChecked,1);
  assert.equal(smart.scienceScopeHints.smartRmPresent,true);
  assert.equal(calculateCompactSketch({...base,blocks:[block('press',{work:{unit:'reps',reps:10,secondsPerRepRange:null}})]}).coverage,'partial');
  assert.throws(()=>calculateCompactSketch({...base,blocks:[block('press',{setCount:32,sides:['left','right']}),block('row',{setCount:32,sides:['left','right']})]}),/100 rows/);
});

test('compact Smart RM keeps distinct repetitions and time for every set',()=>{
  const workBySet=[12,10,8].map(reps=>({unit:'reps',reps,secondsPerRepRange:fixed(3)}));
  const input={blocks:[block('press',{work:undefined,workBySet,loadMode:'smart-rm',smartRmPreset:'Gain Muscle'})],additionalSetupRange:fixed(0)};
  const result=calculateCompactSketch(input);
  assert.deepEqual(result.rows.map(row=>row.declaredWork.reps),[12,10,8]);
  assert.equal(result.components.workSeconds.minSeconds,90);
  assert.equal(result.expansion.variableSetBlocks,1);
  assert.throws(()=>calculateCompactSketch({...input,blocks:[block('press',{work:undefined,workBySet:[...workBySet.slice(0,2),{...workBySet[2],reps:7}],loadMode:'smart-rm',smartRmPreset:'Gain Muscle'})]}),/repetition range/);
  assert.throws(()=>calculateCompactSketch({...input,blocks:[block('press',{work:undefined,workBySet:workBySet.slice(0,2),loadMode:'smart-rm',smartRmPreset:'Gain Muscle'})]}),/one dose per set/);
});

test('actual MCP registration and branch expose local compact calculator only',async()=>{
  const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const start=source.indexOf("  {\n    name: 'gm_coach_calculate_compact_sketch_time',");
  const end=source.indexOf("  {\n    name: 'gm_coach_compare_completed_sessions',",start);
  assert.ok(start>=0&&end>start);
  const entry=vm.runInNewContext(`(${source.slice(start,end).trim().replace(/,$/,'')})`,{compactSketchInputSchema});
  assert.equal(entry.inputSchema,compactSketchInputSchema);
  assert.equal(entry.inputSchema.additionalProperties,false);
  const branchStart=source.indexOf("    case 'gm_coach_calculate_compact_sketch_time':");
  const branchEnd=source.indexOf("    case 'gm_coach_compare_completed_sessions':",branchStart);
  assert.ok(branchStart>=0&&branchEnd>branchStart);
  const branch=source.slice(branchStart,branchEnd);
  assert.doesNotMatch(branch,/resolveProfile|speedianceApiRequest|readProfile|withProfileMutationLock/);
  const dispatch=vm.runInNewContext(`async args=>{switch('gm_coach_calculate_compact_sketch_time'){${branch}}}`,{calculateCompactSketch});
  const result=await dispatch({blocks:[block('press')],additionalSetupRange:fixed(0)});
  assert.equal(result.totalSeconds.minSeconds,210);
});
