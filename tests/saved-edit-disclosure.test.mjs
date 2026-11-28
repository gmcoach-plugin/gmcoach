import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { savedEditExecutionDisclosure, reconcileSavedEditPayload, diffSavedEditPayloads, assertSavedEditScope } from '../plugin/saved-edit-diff.mjs';
import { buildSavedTemplateUpdatePayload } from '../plugin/saved-templates.mjs';
import { createSavedPlanIdentity, createSavedEditOccurrenceMapping } from '../plugin/saved-plan-identity.mjs';
const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
const end = source.indexOf("\n    case 'speediance_update_saved_program':", start);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderer = vm.runInNewContext(`(${source.slice(source.indexOf('function approvalPage('),source.indexOf('\nasync function handleApprovalRequest')).trim()})`, {escapeHtml, RESISTANCE_MODES:{1:'Standard',2:'Chain',3:'Eccentric'}, setupPage:(_a,_b,html)=>html});
function row(counterweight='13,13') { return {groupId:42,actionLibraryId:7,templatePresetId:1,setsAndReps:'8,8',completionMethod:'1,1',selectCompletionMethod:'1,1',countType:'1,1',leftRight:'0,0',sportMode:'1,1',weights:'3.5,3.5',counterweight,counterweight2:counterweight,breakTime:'90,90',breakTime2:'90,90',capacity:457.6}; }
async function preview(counters=['12,11'], conversion=false) {
  const current={id:1001,code:'existing',name:'Old',totalCapacity:457.6*counters.length,actionLibraryList:counters.map(row)};
  if(conversion) Object.assign(current.actionLibraryList[0],{templatePresetId:-1,weights:'8,9',counterweight:'',counterweight2:''});
  const payload={name:'New',totalCapacity:457.6*counters.length,actionLibraryList:counters.map(()=>({...row(),breakTime:'100,90',breakTime2:'100,90'}))};
  const plan={name:'New',rationale:'Synthetic presentation fixture',evidence:[],decisionEvidence:[],warmup:{status:'omitted_user_preference',items:[]},postWorkoutStretching:{status:'omitted_user_preference',items:[]},exercises:counters.map((_,index)=>({id:42,entryId:index+1,actionLibraryId:7,title:'Test lift',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[8,8].map(reps=>({unit:'reps',reps,rmLevel:13,mode:1,rest:100}))}))};
  const originalPlan=JSON.stringify(plan),originalPayload=JSON.stringify(payload);
  const approval={plan,payload,preview:{exercises:[]},profile:'synthetic',staticLoadContext:{}};
  const writeApprovals=new Map([['edit',approval]]);
  const fn=vm.runInNewContext(`(async args=>{${source.slice(start,end).trim().replace(/\}\s*$/, '')}})`,{current,approval,writeApprovals,result:{previewId:'edit'},profile:'synthetic',config:{deviceType:1},buildSavedTemplateUpdatePayload,reconcileSavedEditPayload,diffSavedEditPayloads,assertSavedEditScope,savedEditExecutionDisclosure,savedEditOccurrenceContext:async()=>({})});
  const result=await fn({program_code:'existing',base_digest:'a'.repeat(64),allowed_changes:conversion?['name','rest','load']:['name','rest']});
  assert.equal(JSON.stringify(plan),originalPlan);assert.equal(JSON.stringify(payload),originalPayload);
  assert.equal(Object.isFrozen(approval.editExecutionDisclosure),true);
  return {result,approval,html:renderer(approval)};
}
test('actual saved-edit public preview and HTML disclose preserved distinct settings without raw counters',async()=>{
  const {result,approval,html}=await preview();
  assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight,'12,11');
  assert.equal(result.executionDisclosure.items[0].existingPresetSettingsPreserved,true);
  assert.equal(result.executionDisclosure.items[0].perSetSettingsDiffer,true);
  assert.match(html,/Zachowano dotychczasowe ustawienia Smart RM/);assert.match(html,/kalendarz pozostanie bez zmian/);
  assert.doesNotMatch(html,/doda go do kalendarza|12,11|13,13|3\.5 kg|counterweight/);
});
test('equal defaults and conversion do not claim stored selector preservation',async()=>{
  for(const [values,conversion] of [[['13,13'],false],[['12,11'],true]]) {
    const {result,html}=await preview(values,conversion);assert.equal(result.executionDisclosure.items.length,0);assert.doesNotMatch(html,/Zachowano dotychczasowe ustawienia Smart RM/);
  }
});
test('duplicate catalog occurrences remain separate ordered output positions',async()=>{
  const {result,approval}=await preview(['12,11','10,9']);
  assert.deepEqual(Array.from(result.executionDisclosure.items,item=>item.actionIndex),[0,1]);
  assert.deepEqual(Array.from(approval.editWirePayload.actionLibraryList,item=>item.counterweight),['12,11','10,9']);
});
test('verified reordered occurrences and repeated serialization ordinals bind exact approved positions',()=>{
  const omitted={status:'omitted_user_preference',items:[]};
  const a={id:42,actionLibraryId:7,entryId:100,section:'main'}, b={id:43,actionLibraryId:8,entryId:101,section:'main'};
  const plan={exercises:[a,b],warmup:omitted,postWorkoutStretching:omitted};
  const oldEntries=[a,b,a,b].map(exercise=>({exercise}));
  const actions=oldEntries.map(({exercise},index)=>({...row(`${9+index},${9+index}`),groupId:exercise.id,actionLibraryId:exercise.actionLibraryId}));
  const baseline={name:'Old',actionLibraryList:actions,totalCapacity:1830.4};
  const generated={...baseline,actionLibraryList:[actions[1],actions[0],actions[3],actions[2]].map(action=>({...action,counterweight:'13,13',counterweight2:'13,13'}))};
  const nextPlan={...plan,exercises:[b,a]},nextEntries=[b,a,b,a].map(exercise=>({exercise}));
  const fingerprint='a'.repeat(64);
  const identity=createSavedPlanIdentity(plan,oldEntries,baseline,fingerprint);
  const mapping=createSavedEditOccurrenceMapping(identity,baseline,nextPlan,nextEntries,generated,fingerprint);
  const approved=reconcileSavedEditPayload(baseline,generated,{savedEditOccurrenceMapping:mapping},{allowedChanges:['exercise_order'],generatedPresetDefaults:true});
  const disclosure=savedEditExecutionDisclosure(baseline,generated,approved,mapping);
  assert.deepEqual(disclosure.items.map(item=>[item.actionIndex,item.baselineIndex,item.entryId,item.occurrenceOrdinal]),[[0,1,101,0],[1,0,100,0],[2,3,101,1],[3,2,100,1]]);
  const forged=structuredClone(mapping);forged.after[0].entryId=999;
  assert.throws(()=>savedEditExecutionDisclosure(baseline,generated,approved,forged),/membership|alignment/);
});
test('invalid named wire cannot produce a preservation claim',()=>{
  const baseline={actionLibraryList:[row('12,11')]},generated={actionLibraryList:[row()]};
  for(const mutation of [{weights:'74,74'},{counterweight2:'12,10'},{templatePresetName:'Strength'}]) {
    const approved={actionLibraryList:[{...row('12,11'),...mutation}]};
    assert.equal(savedEditExecutionDisclosure(baseline,generated,approved).items.length,0);
  }
});

test('static saved-update HTML without preservation rows does not claim Smart RM execution',()=>{
 const approval={kind:'saved-update',editProgramCode:'static',allowedChanges:['rest'],editExecutionDisclosure:{items:[]},payload:{actionLibraryList:[]},preview:{exercises:[]},plan:{name:'Static edit',rationale:'Synthetic',evidence:[],decisionEvidence:[],warmup:{status:'omitted_user_preference',items:[]},postWorkoutStretching:{status:'omitted_user_preference',items:[]},exercises:[{id:42,title:'Static lift',loadType:'fixed-kg',sets:[{unit:'reps',reps:8,weightKg:20,mode:1,rest:90}]}]}};
 const html=renderer(approval);
 assert.match(html,/Ustawienia wykonania są pokazane w tabeli/);
 assert.doesNotMatch(html,/Smart RM jest przedstawiony|doda go do kalendarza/);
});
