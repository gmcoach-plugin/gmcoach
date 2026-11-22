import {portableRawSourceSchema} from '../portable-source-schema.mjs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exportRepresentablePortableSource} from '../portable-source-adapter.mjs';
import {importPortablePlan} from '../portable-plan-codec.mjs';
const source=await readFile(new URL('../mcp_server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    case 'gm_coach_export_portable_source':"),end=source.indexOf("    case 'gm_coach_export_reference_client_workout_json':",start);
assert.ok(start>=0&&end>start);
const dispatch=new Function('exportRepresentablePortableSource','importPortablePlan',`return async(name,args)=>{switch(name){${source.slice(start,end)}}}`)(exportRepresentablePortableSource,importPortablePlan);
test('actual portable public cases invoke production adapter/codec without account services',async()=>{
 const args={source:{prescription:{name:'Literal public',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'Literal',section:'main',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[{unit:'reps',reps:8,mode:1,restSeconds:90,sourceRmSelector:13}]}]},research:{evidence:[],decisionEvidence:[]}},staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:false}]};
 const x=await dispatch('gm_coach_export_portable_source',args);assert.deepEqual(x.referenceClientJson,{name:'Literal public',exercises:[{id:10,title:'Literal',preset:1,isUnilateralExpanded:false,sets:[{reps:8,weight:13,mode:1,rest:90}]}]});
 const y=await dispatch('gm_coach_import_portable_source',{referenceClientJson:x.referenceClientJson,sidecar:x.sidecar});assert.equal(y.writeReady,false);assert.equal(y.requiresFreshScientificPreview,true);assert.equal(y.mutationSent,false);assert.equal(y.unresolvedImportedSelectors[0].selector,13);
 x.referenceClientJson.exercises[0].sets[0].weight=12;await assert.rejects(dispatch('gm_coach_import_portable_source',{referenceClientJson:x.referenceClientJson,sidecar:x.sidecar}),/integrity/);
 assert.doesNotMatch(source.slice(start,end),/resolveProfile|speedianceApiRequest|writeApprovals|withProfileMutationLock/);
});

test('actual registered export/import tools negotiate explicit series and research schema',()=>{
 const at=source.indexOf("    name: 'gm_coach_export_portable_source'");const start=source.lastIndexOf('  {',at),end=source.indexOf("    name: 'gm_coach_export_reference_client_workout_json'",at);const stop=source.lastIndexOf('  {',end);
 const registered=vm.runInNewContext(`[${source.slice(start,stop)}]`,{portableRawSourceSchema});
 const portableNames=Array.from(registered,tool=>tool.name).filter(name=>['gm_coach_export_portable_source','gm_coach_import_portable_source'].includes(name));
 assert.deepEqual(portableNames,['gm_coach_export_portable_source','gm_coach_import_portable_source']);
 const exportTool=Array.from(registered).find(tool=>tool.name==='gm_coach_export_portable_source');assert.equal(exportTool.inputSchema.additionalProperties,false);
 const schema=exportTool.inputSchema.properties.source;assert.equal(schema,portableRawSourceSchema);assert.ok(schema.properties.prescription.properties.exercises.items.properties.sets.items.properties.sourceRmSelector);assert.ok(schema.properties.research.properties.decisionEvidence.items.properties.supportingExcerpts);assert.match(source,/case 'tools\/list':[\s\S]{0,70}result = \{ tools \}/);
});
