import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSavedTemplateLoadPresentation } from '../plugin/saved-templates.mjs';

const staticAction = (weights) => ({ templatePresetId: -1, weights, counterweight: '', counterweight2: '' });
const present = (weight, output, options) => resolveSavedTemplateLoadPresentation(staticAction(weight), 0, 1, output, 'reps', options);

test('saved static presentation preserves legacy GET kg and imperial conversion by default', () => {
  assert.equal(present('50', 'kg').displayLoad, '50 kg');
  assert.equal(present('50', 'lb').displayLoad, '110 lb');
  assert.equal(present('50', 'unknown').loadUnit, 'unknown');
});

test('verbatim saved presentation uses explicit account units without double conversion', () => {
  const protocol = { staticLoadProtocol: 'account-unit-verbatim' };
  assert.equal(present('110', 'lb', { ...protocol, accountUnit: 'lb' }).displayLoad, '110 lb');
  assert.equal(present('110', 'kg', { ...protocol, accountUnit: 'lb' }).displayLoad, '50 kg');
  assert.equal(present('50', 'lb', { ...protocol, accountUnit: 'kg' }).displayLoad, '110 lb');
  assert.equal(present('50', 'kg', { ...protocol, accountUnit: 'kg' }).displayLoad, '50 kg');
});

test('verbatim missing or unknown source units remain unknown even with requested display units', () => {
  for (const accountUnit of [undefined, 'unknown']) {
    const options = { staticLoadProtocol: 'account-unit-verbatim', accountUnit };
    for (const output of ['kg', 'lb', 'unknown']) {
      assert.equal(present('110', output, options).displayLoad, '110 (jednostka obciążenia nierozpoznana)');
      assert.equal(present('110', output, options).loadUnit, 'unknown');
    }
  }
});

test('protocol selection leaves named RM and timed/bodyweight presentation unchanged', () => {
  const options = { staticLoadProtocol: 'account-unit-verbatim' };
  const rm = { templatePresetId: 1, weights: '3.5', counterweight: '10', counterweight2: '10' };
  assert.deepEqual(resolveSavedTemplateLoadPresentation(rm, 0, 1, 'lb', 'reps', options),
    resolveSavedTemplateLoadPresentation(rm, 0, 1, 'lb', 'reps'));
  assert.deepEqual(resolveSavedTemplateLoadPresentation(rm, 0, 1, 'lb', 'seconds', options),
    resolveSavedTemplateLoadPresentation(rm, 0, 1, 'lb', 'seconds'));
  assert.equal(present('0', 'lb', options).loadType, 'no-external-load');
  assert.equal(resolveSavedTemplateLoadPresentation({ weights: '3.5' }, 0, 1, 'lb', 'reps', options).loadUnit, 'unknown');
});

test('unknown protocol does not silently label static loads', () => {
  assert.throws(() => present('50', 'kg', { staticLoadProtocol: 'invented' }), /protokół/);
});

test('legacy GET presentation does not depend on an account source unit', () => {
  for (const accountUnit of [undefined, 'unknown', 'invalid', 'lb']) {
    for (const output of ['kg', 'lb', 'unknown']) {
      assert.deepEqual(present('50', output, { accountUnit }), present('50', output));
    }
  }
});

test('out-of-bounds static GET rows have unknown diagnostic loads without aborting presentation', () => {
  for (const output of ['kg', 'lb']) {
    for (const [options, values] of [
      [{}, [-1, 1001]],
      [{ staticLoadProtocol: 'account-unit-verbatim', accountUnit: 'kg' }, [-1, 1001]],
      [{ staticLoadProtocol: 'account-unit-verbatim', accountUnit: 'lb' }, [-1, 2201]]
    ]) {
      for (const value of values) {
        const result = present(String(value), output, options);
        assert.equal(result.loadType, 'load-format-invalid');
        assert.equal(result.loadUnit, 'unknown');
        assert.match(result.displayLoad, /nieprawidłowa wartość obciążenia z API/);
      }
      assert.equal(present('0', output, options).loadType, 'no-external-load');
    }
  }
});


test('heterogeneous serialized sets preserve every indexed load diagnostic and row through presentation decoding',async()=>{
 const {buildPresetPayload}=await import('../plugin/program-serialization.mjs');const {encodeSavedPresentation,decodeSavedPresentation}=await import('../plugin/saved-presentation.mjs');
 for(const staticLoadProtocol of ['legacy-reference-client-wire-lb-get-kg','account-unit-verbatim'])for(const accountUnit of ['kg','lb']){
 const prescribed=[{unit:'reps',reps:8,rest:90,mode:1},{unit:'reps',reps:10,rest:75,mode:2},{unit:'reps',reps:12,rest:60,mode:3}];const metadata=new Map([[42,{detail:{isLeftRight:0,isBarbell:0},batch:{isLeftRight:0,isBarbell:0,actionLibraryList:[{id:142}]}}]]);const common={id:42,actionLibraryId:142,title:'Verified synthetic'};
 const kg=[20,25,30],lb=[44,55,66],selectors=[10,11,12];const exercises=[{...common,entryId:401,loadType:'smart-rm',smartRmPresetId:1,smartRmPresetName:'Gain Muscle',sets:prescribed.map((set,i)=>({...set,rmLevel:selectors[i]}))},{...common,entryId:402,loadType:'customize-manual',staticLoadRequested:true,sets:prescribed.map((set,i)=>({...set,weight:(accountUnit==='kg'?kg:lb)[i],weightUnit:accountUnit}))},{...common,entryId:403,loadType:'fixed-kg',fixedKgAuthorized:true,sets:prescribed.map((set,i)=>({...set,weightKg:kg[i]}))}];
 const actions=buildPresetPayload({name:'Heterogeneous chain',exercises},metadata,1,accountUnit,{staticLoadProtocol}).payload.actionLibraryList;assert.equal(actions.length,3);for(const a of actions){assert.equal(a.setsAndReps,'8,10,12');assert.equal(a.breakTime,'90,75,60');assert.equal(a.sportMode,'1,2,3');}assert.equal(actions[0].counterweight,'10,11,12');assert.equal(actions[0].counterweight2,'10,11,12');
 const readback=structuredClone(actions);if(staticLoadProtocol==='legacy-reference-client-wire-lb-get-kg')for(const a of readback)if(a.templatePresetId===-1)a.weights=a.weights.split(',').map(x=>String(Number(x)/2.2)).join(',');
 const variants=[readback[0],{...readback[0],weights:'4,4,4'},{...readback[0],presetName:'Strength'},readback[1],readback[2]];
 const rows=variants.map((a,exerciseIndex)=>({exerciseId:42,exerciseIndex,sets:prescribed.map((set,i)=>{const load=resolveSavedTemplateLoadPresentation(a,i,3,accountUnit,'reps',{staticLoadProtocol,accountUnit});if(exerciseIndex===0){assert.equal(load.loadType,'smart-rm-preset');assert.equal(load.technicalRmLevel,selectors[i]);assert.equal(load.technicalRmLevel2,selectors[i]);assert.equal(load.loadUnit,'device-managed');assert.match(load.displayLoad,/Gain Muscle/);assert.doesNotMatch(load.displayLoad,/\bkg\b|\blb\b|3\.5/);}else if(exerciseIndex===1){assert.equal(load.recordedPresetName,undefined);assert.equal(load.recordedPresetId,1);assert.equal(load.recordedPresetStatus,'id-only-unqualified');assert.ok(load.loadDiagnostics.includes('saved-load-representation-unqualified'));assert.equal(load.loadUnit,'unknown');assert.doesNotMatch(load.displayLoad,/\bkg\b|\blb\b/);}else if(exerciseIndex===2){assert.equal(load.recordedPresetStatus,'conflicting-aliases');assert.deepEqual(load.loadDiagnostics,['preset-name-conflict']);assert.equal(load.recordedPresetName,undefined);assert.equal(load.loadUnit,'unknown');}else{assert.equal(load.loadType,'static-account-load');assert.equal(load.loadUnit,accountUnit);assert.equal(load.displayLoad,`${(accountUnit==='kg'?kg:lb)[i]} ${accountUnit}`);assert.equal(load.recordedPresetName,undefined);}return{set:i+1,reps:set.reps,rest:set.rest,mode:set.mode,...load};})}));
 const source={name:'Heterogeneous chain',exercises:rows};const encoded=encodeSavedPresentation(source),decoded=decodeSavedPresentation(encoded);assert.equal(decoded.length,5);assert.equal(decoded.reduce((n,x)=>n+x.sets.length,0),15);assert.deepEqual(decoded,rows);assert.equal(encoded.writeReady,false);assert.equal(encoded.scientificApproval,false);assert.equal(encoded.requiresFullReadForMutation,true);
 }
});
