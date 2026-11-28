import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    case 'gm_coach_get_saved_plan_baselines':");
const end=source.indexOf("    case 'speediance_get_saved_program':",start);
assert.ok(start>0&&end>start);
const branch=source.slice(start,end);

test('compact baseline reads one list and preserves every distinct set for multiple programs',async()=>{
  let listReads=0;
  const deps={
    cycleExactKeys:(args,keys)=>{if(Object.keys(args).some(key=>!keys.includes(key)))throw Error('unexpected key');},
    resolveProfile:async value=>value,
    readProfileConfig:async()=>({config:{deviceType:1}}),
    assertUnitMemoryAccountBinding:()=>({id:'stable'}),
    readSavedCustomTemplatesForRead:async()=>{listReads++;return {templates:[]};},
    speedianceApiRequest:()=>{throw Error('unexpected transport');},
    getSavedTemplateByCode:async(_profile,_deviceType,code,options)=>{assert.ok(options.observedSnapshot);return {code,name:code};},
    assertUnitMemoryAccountCurrent:async()=>{},
    buildReadableSavedTemplate:async()=>({displayWeightUnit:'kg',exerciseCatalogRead:{status:'complete'},exercises:[{exerciseId:57,actionLibraryId:100,name:'x',exerciseName:'Barbell Squat',exerciseNameStatus:'confirmed-catalog',loadType:'static',sets:[{set:1,unit:'reps',rawWorkValue:'8',displayDose:'8 powt.',displayLoad:'30 kg',restSeconds:60},{set:2,unit:'reps',rawWorkValue:'6',displayDose:'6 powt.',displayLoad:'32 kg',restSeconds:90}]}]}),
    savedTemplateDigest:()=> 'a'.repeat(64)
  };
  const dispatch=new Function(...Object.keys(deps),`return async (args)=>{switch('gm_coach_get_saved_plan_baselines'){${branch}}}`)(...Object.values(deps));
  const result=await dispatch({profile:'synthetic',program_codes:['a','b']});
  assert.equal(listReads,1);
  assert.equal(result.programs.length,2);
  assert.deepEqual(result.programSummary.map(row=>[row.code,row.exerciseCount,row.setCount]),[['a',1,2],['b',1,2]]);
  assert.deepEqual(result.programs[0].exercises[0].sets.map(set=>[set.rawWorkValue,set.displayLoad,set.restSeconds]),[['8','30 kg',60],['6','32 kg',90]]);
  assert.equal(result.writeAuthorized,false);
  await assert.rejects(dispatch({profile:'synthetic',program_codes:['a','a']}));
});
test('first baseline primes shared catalog before later baselines run together',async()=>{
  const started=[];
  const release=new Map();
  let listReads=0;
  const deps={
    cycleExactKeys:()=>{},resolveProfile:async value=>value,
    readProfileConfig:async()=>({config:{deviceType:1}}),
    assertUnitMemoryAccountBinding:()=>({id:'stable'}),
    readSavedCustomTemplatesForRead:async()=>{listReads++;return {templates:[]};},
    speedianceApiRequest:()=>{throw Error('unexpected transport');},
    getSavedTemplateByCode:async(_profile,_type,code)=>({code,name:code}),
    assertUnitMemoryAccountCurrent:async()=>{},
    buildReadableSavedTemplate:async template=>{started.push(template.code);await new Promise(resolve=>release.set(template.code,resolve));return {displayWeightUnit:'kg',exerciseCatalogRead:{status:'complete'},exercises:[]};},
    savedTemplateDigest:()=> 'a'.repeat(64)
  };
  const dispatch=new Function(...Object.keys(deps),`return async (args)=>{switch('gm_coach_get_saved_plan_baselines'){${branch}}}`)(...Object.values(deps));
  const pending=dispatch({profile:'synthetic',program_codes:['a','b','c']});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,['a']);
  release.get('a')();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,['a','b','c']);
  release.get('c')();release.get('b')();
  const result=await pending;
  assert.equal(listReads,1);
  assert.deepEqual(result.programs.map(row=>row.code),['a','b','c']);
});
test('parallel baseline failure waits for all reads and returns no partial programs',async()=>{
  let finishThird;
  let accountChecks=0;
  const deps={
    cycleExactKeys:()=>{},resolveProfile:async value=>value,
    readProfileConfig:async()=>({config:{deviceType:1}}),
    assertUnitMemoryAccountBinding:()=>({id:'stable'}),
    readSavedCustomTemplatesForRead:async()=>({templates:[]}),
    speedianceApiRequest:()=>{throw Error('unexpected transport');},
    getSavedTemplateByCode:async(_profile,_type,code)=>({code,name:code}),
    assertUnitMemoryAccountCurrent:async()=>{accountChecks++;},
    buildReadableSavedTemplate:async template=>{
      if(template.code==='b')throw Error('baseline b unavailable');
      if(template.code==='c')await new Promise(resolve=>{finishThird=resolve;});
      return {displayWeightUnit:'kg',exerciseCatalogRead:{status:'complete'},exercises:[]};
    },
    savedTemplateDigest:()=> 'a'.repeat(64)
  };
  const dispatch=new Function(...Object.keys(deps),`return async (args)=>{switch('gm_coach_get_saved_plan_baselines'){${branch}}}`)(...Object.values(deps));
  const pending=dispatch({profile:'synthetic',program_codes:['a','b','c']});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof finishThird,'function');
  finishThird();
  await assert.rejects(pending,/baseline b unavailable/);
  assert.ok(accountChecks>=3);
});
test('identity view returns deduplicated variant pairs without set payload or guessed IDs',async()=>{
  const deps={
    cycleExactKeys:(args,keys)=>{if(Object.keys(args).some(key=>!keys.includes(key)))throw Error('unexpected key');},
    resolveProfile:async value=>value,readProfileConfig:async()=>({config:{deviceType:1}}),
    assertUnitMemoryAccountBinding:()=>({id:'stable'}),readSavedCustomTemplatesForRead:async()=>({templates:[]}),
    speedianceApiRequest:()=>{throw Error('unexpected transport');},
    getSavedTemplateByCode:async(_profile,_type,code)=>({code,name:code}),
    assertUnitMemoryAccountCurrent:async()=>{},savedTemplateDigest:()=> 'a'.repeat(64),
    buildReadableSavedTemplate:async()=>({exercises:[
      {exerciseId:11,actionLibraryId:101,exerciseName:'Rotation',sets:[{set:1,unit:'reps',displayDose:'8 powt.'}]},
      {exerciseId:11,actionLibraryId:101,exerciseName:'Rotation',sets:[{set:1,unit:'reps',displayDose:'10 powt.'}]},
      {exerciseId:12,actionLibraryId:null,exerciseName:'Unresolved',sets:[]}
    ]})
  };
  const dispatch=new Function(...Object.keys(deps),`return async (args)=>{switch('gm_coach_get_saved_plan_baselines'){${branch}}}`)(...Object.values(deps));
  const result=await dispatch({profile:'synthetic',program_codes:['thu','fri'],output_view:'identity'});
  assert.deepEqual(result.identities,[{groupId:11,actionLibraryId:101,names:['Rotation'],programCodes:['thu','fri']}]);
  assert.equal(result.unresolved.length,2);
  assert.equal(result.identityComplete,false);
  assert.equal(result.programs,undefined);
  assert.equal(result.identities[0].sets,undefined);
  assert.equal(result.readOnly,true);
});
