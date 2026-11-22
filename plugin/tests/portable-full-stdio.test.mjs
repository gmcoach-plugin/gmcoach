import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {portableRawSourceSchema} from '../portable-source-schema.mjs';
test('actual full server local portable stdio has zero network attempts and no account authority', {timeout:30000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'gm-portable-stdio-')),marker=path.join(root,'network.log'),preload=path.join(root,'block.mjs'),data=path.join(root,'data');
 const code=`import fs from 'node:fs';import http from 'node:http';import https from 'node:https';import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';const deny=()=>{fs.appendFileSync(${JSON.stringify(marker)},'attempt\\n');throw Error('NETWORK_FORBIDDEN');};globalThis.fetch=deny;http.request=deny;http.get=deny;https.request=deny;https.get=deny;net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;syncBuiltinESMExports();`;
 await writeFile(preload,code);let child;const pending=new Map();let buffer='',stderr='',id=0;
 try{
  child=spawn(process.execPath,['--import',pathToFileURL(preload).href,fileURLToPath(new URL('../mcp_server.mjs',import.meta.url))],{env:{...process.env,PLUGIN_DATA:data,CODEX_HOME:path.join(root,'codex')},stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stderr.on('data',x=>{stderr=(stderr+x).slice(-10000);});
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;try{const x=JSON.parse(line),p=pending.get(x.id);if(p){pending.delete(x.id);clearTimeout(p.timer);p.resolve(x);}}catch(error){for(const p of pending.values())p.reject(error);}}});
  child.on('error',error=>{for(const p of pending.values())p.reject(error);});child.on('exit',(code)=>{for(const p of pending.values())p.reject(Error(`Server exit ${code}: ${stderr}`));});
  const request=(method,params)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error(`stdio timeout ${method}: ${stderr}`));},8000);pending.set(key,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  const init=await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'local-portable-regression',version:'1'}});assert.equal(init.result.protocolVersion,'2024-11-05');const expectedVersion=JSON.parse(await readFile(new URL('../plugin.json',import.meta.url),'utf8')).version;assert.equal(init.result.serverInfo.version,expectedVersion,'Actual child matches exact source manifest; installed equality is verified externally');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const listed=(await request('tools/list')).result.tools;const savedSchema=listed.find(x=>x.name==='gm_coach_export_saved_portable_source')?.inputSchema;assert.deepEqual(savedSchema.required,['profile','program_code','base_digest']);assert.equal(savedSchema.additionalProperties,false);const absentProfile=await request('tools/call',{name:'gm_coach_export_saved_portable_source',arguments:{}});assert.equal(absentProfile.result.isError,true);assert.match(absentProfile.result.content[0].text,/Explicit saved export identity required/);for(const name of ['gm_coach_export_portable_source','gm_coach_import_portable_source','gm_coach_export_saved_portable_source','gm_coach_export_shared_plan','gm_coach_import_shared_plan'])assert.equal(listed.filter(x=>x.name===name).length,1);
  const liveNames=new Set(listed.map(tool=>tool.name));
  for(const required of ['speediance_list_accounts','speediance_check_connection','gm_coach_prepare_plan_inputs','gm_coach_find_exercise_candidates','gm_coach_find_research_in_batches'])assert.ok(liveNames.has(required),`Core planning tool missing from tools/list: ${required}`);
  const skillsRoot=fileURLToPath(new URL('../skills/',import.meta.url));
  for(const relative of await readdir(skillsRoot,{recursive:true})){
   if(!relative.endsWith('.md'))continue;
   const instruction=await readFile(path.join(skillsRoot,relative),'utf8');
   for(const [,name] of instruction.matchAll(/`((?:gm_coach|speediance)_[a-z0-9_]+)`/g)){
    if(['gm_coach_local','speediance_mcp'].includes(name))continue;
    assert.ok(liveNames.has(name),`${relative} refers to unavailable MCP tool ${name}`);
   }
  }
  assert.deepEqual(listed.find(x=>x.name==='gm_coach_export_portable_source').inputSchema.properties.source,portableRawSourceSchema);
  assert.deepEqual(listed.find(x=>x.name==='gm_coach_export_shared_plan').inputSchema.properties.source,portableRawSourceSchema);assert.equal(listed.find(x=>x.name==='gm_coach_import_shared_plan').inputSchema.required,undefined);assert.deepEqual(listed.find(x=>x.name==='gm_coach_import_shared_plan').inputSchema.oneOf,[{required:['artifactText']},{required:['artifactUri']}]);assert.equal(listed.find(x=>x.name==='gm_coach_import_shared_plan').inputSchema.properties.artifactText.maxLength,1000000);
  const call=async(name,args)=>{const x=await request('tools/call',{name,arguments:args});assert.equal(x.result.isError,false,JSON.stringify(x.result));return JSON.parse(x.result.content[0].text);};
  const selectedResearch=listed.find(x=>x.name==='gm_coach_read_selected_research_abstracts');
  assert.equal(selectedResearch.inputSchema.properties.sources.maxItems,8);
  const absentResearch=await request('tools/call',{name:'gm_coach_read_selected_research_abstracts',arguments:{sources:[{batchId:'missing',sourceId:'pubmed:123'}]}});
  assert.equal(absentResearch.result.isError,true);
  assert.match(absentResearch.result.content[0].text,/UNKNOWN_OR_EXPIRED_BATCH/);
  const planInputs=listed.find(x=>x.name==='gm_coach_prepare_plan_inputs');
  assert.equal(planInputs.inputSchema.required.includes('consent_to_read_history'),true);
  assert.equal(planInputs.inputSchema.properties.include_recent_session_details.type,'boolean');
  assert.equal(planInputs.inputSchema.required.includes('include_recent_session_details'),false);
  const refusedInputs=await request('tools/call',{name:'gm_coach_prepare_plan_inputs',arguments:{profile:'example',month:'2026-11',program_codes:['abc'],days:14,consent_to_read_history:false}});
  assert.equal(refusedInputs.result.isError,true);
  assert.match(refusedInputs.result.content[0].text,/explicit history read consent/);
  const detailsBatch=listed.find(x=>x.name==='gm_coach_get_completed_session_details');
  assert.equal(detailsBatch.inputSchema.properties.sessions.maxItems,4);
  const refusedDetails=await request('tools/call',{name:'gm_coach_get_completed_session_details',arguments:{sessions:[{training_id:'101',type:'program',date:'2026-11-01'}],consent_to_read_history:false}});
  assert.equal(refusedDetails.result.isError,true);
  assert.match(refusedDetails.result.content[0].text,/consent/);
  assert.equal(listed.filter(x=>x.name==='gm_coach_derive_evidence_bindings').length,1);
  assert.deepEqual(listed.find(x=>x.name==='gm_coach_derive_evidence_bindings').inputSchema.properties.exercises.items.required,['id','title','loadType','sets']);
  const previewSchema=listed.find(x=>x.name==='speediance_preview_program').inputSchema;
  assert.equal(previewSchema.properties.decisionEvidenceGroups.items.required.includes('targets'),true);
  assert.equal(previewSchema.properties.decisionEvidenceGroups.items.required.includes('target'),false);
  const compact=listed.find(x=>x.name==='gm_coach_calculate_compact_sketch_time').inputSchema;
  assert.equal(compact.properties.blocks.items.allOf[0].oneOf[1].required[0],'workBySet');
  assert.ok(compact.properties.blocks.items.properties.workBySet.items.oneOf);
  assert.equal(compact.properties.blocks.items.properties.workBySet.maxItems,32);
  const preflight=await call('gm_coach_derive_evidence_bindings',{detail:'full',exercises:[{id:10,entryId:1,title:'literal',section:'main',loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,rest:90}]}],warmup:{status:'included',items:[{kind:'general',activity:'Easy movement',dosage:'5 min'}]},postWorkoutStretching:{status:'included',items:[{target:'Chest',method:'static',dosage:'30 sec',instructions:'Gentle stretch'}]},limit:5,detail:'full'});
  assert.equal(preflight.bindings.length,5);assert.ok(preflight.nextOffset!==null);assert.equal(preflight.scientificApproval,false);
  assert.ok(preflight.researchCategories.includes('warmup_element'));
  assert.ok(preflight.researchCategories.includes('post_workout_stretching_item'));
  assert.deepEqual(preflight.queryBatches.flat(),preflight.researchCategories);
  const multiSession=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:['day-a','day-b'].map(sessionId=>({sessionId,primaryGoal:'hypertrophy',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',sets:[{unit:'reps',reps:8,rirTarget:2,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]}})),includeSessionBindings:true});
  assert.equal(multiSession.sessions.length,2);assert.equal(multiSession.bindingCount,multiSession.sessions.reduce((sum,row)=>sum+row.bindingCount,0));
  assert.equal(multiSession.sessionBindingsStatus,'complete');assert.equal(multiSession.sessionBindings.length,2);
  for (const row of multiSession.sessionBindings) {
    assert.equal(row.bindingCount,multiSession.sessions.find(session=>session.sessionId===row.sessionId).bindingCount);
    assert.equal(row.groups.reduce((sum,group)=>sum+group.targets.length,0),row.bindingCount);
    assert.ok(row.groups.every(group=>group.targets.every(target=>typeof target==='string')));
  }
  const singleForComparison=await call('gm_coach_derive_evidence_bindings',{detail:'full',primaryGoal:'hypertrophy',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',sets:[{unit:'reps',reps:8,rirTarget:2,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},groupByExactValue:true,limit:100});
  assert.deepEqual(multiSession.sessionBindings[0].groups,singleForComparison.groups);
  const mediumExercises=Array.from({length:14},(_,index)=>({id:index+1,entryId:index+1,title:`Exercise ${index+1}`,loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,restSeconds:60},{unit:'reps',reps:8,mode:1,restSeconds:60},{unit:'reps',reps:8,mode:1,restSeconds:60}]}));
  const mediumMulti=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:['medium-a','medium-b'].map(sessionId=>({sessionId,exercises:mediumExercises,warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]}})),includeSessionBindings:true});
  assert.ok(mediumMulti.bindingCount>300&&mediumMulti.bindingCount<=500, String(mediumMulti.bindingCount));assert.equal(mediumMulti.sessionBindingsStatus,'complete');
  assert.equal(mediumMulti.sessionBindings.reduce((sum,row)=>sum+row.bindingCount,0),mediumMulti.bindingCount);
  const largeExercises=Array.from({length:64},(_,index)=>({id:index+1,entryId:index+1,title:`Exercise ${index+1}`,loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,restSeconds:60},{unit:'reps',reps:8,mode:1,restSeconds:60},{unit:'reps',reps:8,mode:1,restSeconds:60}]}));
  const largeMulti=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:['large-a','large-b'].map(sessionId=>({sessionId,exercises:largeExercises,warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]}})),includeSessionBindings:true});
  assert.ok(largeMulti.bindingCount>500);assert.equal(largeMulti.sessionBindingsStatus,'too-large');assert.equal(Object.hasOwn(largeMulti,'sessionBindings'),false);
  assert.deepEqual(multiSession.queryBatches.flat(),multiSession.researchCategories);
  assert.ok(multiSession.sharedExactGroups.some(group=>group.category==='set_work_dose'&&group.targets.length===2));
  assert.ok(!multiSession.sharedExactGroups.some(group=>group.category==='weekly_volume'),'Unbound plan-level values must not be shared across sessions');
  const pagedSessions=['day-a','day-b'].map(sessionId=>({sessionId,primaryGoal:'hypertrophy',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',sets:[{unit:'reps',reps:8,rirTarget:2,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]}}));
  const firstSharedPage=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:pagedSessions,sharedLimit:1,includeSessionBindings:true});
  assert.equal(firstSharedPage.sharedExactGroups.length,1);assert.ok(firstSharedPage.sharedGroupTotal>1);assert.equal(firstSharedPage.nextSharedOffset,1);assert.equal(firstSharedPage.sessionBindingsStatus,'complete');
  const secondSharedPage=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:pagedSessions,sharedLimit:1,sharedOffset:1,includeSessionBindings:true});
  assert.equal(secondSharedPage.sessionBindingsStatus,'first-page-only');assert.equal(Object.hasOwn(secondSharedPage,'sessionBindings'),false);
  assert.deepEqual(secondSharedPage.sharedExactGroups,multiSession.sharedExactGroups.slice(1,2));
  const changedSession={sessionId:'day-c',primaryGoal:'hypertrophy',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',sets:[{unit:'reps',reps:12,rirTarget:2,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]}};
  const changedMulti=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:[{...changedSession,sessionId:'day-a',exercises:[{...changedSession.exercises[0],sets:[{...changedSession.exercises[0].sets[0],reps:8}]}]},changedSession]});
  assert.ok(!changedMulti.sharedExactGroups.some(group=>group.category==='set_work_dose'),'Different exact dose values cannot share a scientific decision');
  const mixedScope=await call('gm_coach_derive_multi_session_evidence_scope',{sessions:[changedSession,{...changedSession,sessionId:'day-warmup',warmup:{status:'included',items:[{kind:'general',activity:'Easy movement',dosage:'5 min'}]}}]});
  assert.ok(mixedScope.researchCategories.includes('warmup_element'),'Union must include a category used by only one session');
  const duplicateMulti=await request('tools/call',{name:'gm_coach_derive_multi_session_evidence_scope',arguments:{sessions:[changedSession,changedSession]}});
  assert.equal(duplicateMulti.result.isError,true);
  const unexpectedScope=await request('tools/call',{name:'gm_coach_derive_multi_session_evidence_scope',arguments:{sessions:[changedSession,{...changedSession,sessionId:'day-other',groupByExactValue:true}]}});
  assert.equal(unexpectedScope.result.isError,true);
  assert.equal(multiSession.scientificApproval,false);assert.equal(multiSession.writeAuthorized,false);
  const nutritionScope=await call('gm_coach_derive_evidence_bindings',{detail:'full',exercises:[{id:10,entryId:1,title:'literal',loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},nutritionContextKnown:true,limit:1});
  assert.ok(nutritionScope.researchCategories.includes('nutrition_context'));
  const separateScope=await call('gm_coach_prepare_science_scope',{exercises:[{loadType:'bodyweight',sets:[{unit:'reps',mode:1}]}],nutritionContextKnown:true});
  assert.deepEqual(nutritionScope.researchCategories,separateScope.researchCategories);
  assert.deepEqual(nutritionScope.queryBatches,separateScope.queryBatches);
  const preflightPage=await call('gm_coach_derive_evidence_bindings',{detail:'full',exercises:[{id:10,entryId:1,title:'literal',section:'main',loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,rest:90}]}],warmup:{status:'included',items:[{kind:'general',activity:'Easy movement',dosage:'5 min'}]},postWorkoutStretching:{status:'included',items:[{target:'Chest',method:'static',dosage:'30 sec',instructions:'Gentle stretch'}]},offset:preflight.nextOffset,limit:50});
  assert.equal(preflight.bindings.length+preflightPage.bindings.length,preflight.total);
  const grouped=await call('gm_coach_derive_evidence_bindings',{detail:'full',exercises:[{id:10,entryId:1,title:'literal',loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,rest:90},{unit:'reps',reps:8,mode:1,rest:90},{unit:'reps',reps:8,mode:1,rest:90}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},groupByExactValue:true,limit:100});
  assert.ok(grouped.bindingCount>grouped.total);assert.ok(grouped.groups.some(row=>row.targets.length===3));assert.equal(grouped.scientificApproval,false);
  const smartPreflight=await call('gm_coach_derive_evidence_bindings',{detail:'full',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[{unit:'reps',reps:10,rirTarget:2,mode:1,restSeconds:60}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},limit:100});
  const smartLoad=smartPreflight.bindings.find(row=>row.category==='set_load');assert.match(smartLoad.value,/loadType=reference-client-rm-preset/);assert.match(smartLoad.value,/presetId=1/);assert.doesNotMatch(smartLoad.value,/weight=|percent1RM=/);
  const inferredSmart=await call('gm_coach_derive_evidence_bindings',{detail:'full',primaryGoal:'strength',exercises:[{id:10,entryId:1,title:'literal',loadType:'smart-rm',sets:[{unit:'reps',reps:6,rirTarget:2,mode:1,restSeconds:90}]}],warmup:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'Synthetic fixture.',items:[]},limit:100});
  assert.match(inferredSmart.bindings.find(row=>row.category==='set_load').value,/presetId=5;.*presetName=Strength/);
  const args={source:{prescription:{name:'stdio literal',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'literal',section:'main',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',sets:[{unit:'reps',reps:8,mode:1,restSeconds:90,sourceRmSelector:13}]}]},research:{evidence:[],decisionEvidence:[]}},staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:false}]};
  const x=await call('gm_coach_export_portable_source',args);assert.deepEqual(x.referenceClientJson,{name:'stdio literal',exercises:[{id:10,title:'literal',preset:1,isUnilateralExpanded:false,sets:[{reps:8,weight:13,mode:1,rest:90}]}]});const imported=await call('gm_coach_import_portable_source',{referenceClientJson:x.referenceClientJson,sidecar:x.sidecar});for(const flag of ['writeReady','scientificApproval','currentReadinessVerified','executionVerified','mutationSent'])assert.equal(imported[flag],false);assert.equal(imported.requiresFreshScientificPreview,true);
  const sharedResponse=await request('tools/call',{name:'gm_coach_export_shared_plan',arguments:args});assert.equal(sharedResponse.result.isError,false);const sharedSummary=JSON.parse(sharedResponse.result.content.find(x=>x.type==='text').text);assert.equal(sharedSummary.fileName,'gm-coach-plan.json');const sharedFile=sharedResponse.result.content.find(x=>x.type==='resource');assert.equal(sharedFile.resource.mimeType,'application/json');assert.match(sharedFile.resource.uri,/gm-coach-plan\.json$/);assert.equal(sharedSummary.artifactUri,sharedFile.resource.uri);const byUri=await call('gm_coach_import_shared_plan',{artifactUri:sharedSummary.artifactUri});const byText=await call('gm_coach_import_shared_plan',{artifactText:sharedFile.resource.text});assert.deepEqual(byUri.planForPreview,byText.planForPreview);const goneUri=await request('tools/call',{name:'gm_coach_import_shared_plan',arguments:{artifactUri:'gm-coach://shared-plans/0000000000/gm-coach-plan.json'}});assert.equal(goneUri.result.isError,true);assert.match(goneUri.result.content[0].text,/Wygeneruj plik ponownie/);const sharedImport=await call('gm_coach_import_shared_plan',{artifactText:sharedFile.resource.text});assert.equal(sharedImport.originVerified,false);assert.equal(sharedImport.scienceGate,'user_declined');assert.equal(sharedImport.planForPreview.exercises[0].sets[0].reps,8);assert.equal(sharedImport.planForPreview.scienceGate,'user_declined');
  const bodyweightArgs={source:{prescription:{name:'stdio source-only',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'Bodyweight squat',section:'main',loadType:'bodyweight',sets:[{unit:'reps',reps:8,mode:1,restSeconds:60}]}]},research:{evidence:[],decisionEvidence:[]}},staticWeightUnit:'kg',staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[]};
  const sourceOnlyResponse=await request('tools/call',{name:'gm_coach_export_shared_plan',arguments:bodyweightArgs});assert.equal(sourceOnlyResponse.result.isError,false,JSON.stringify(sourceOnlyResponse.result));
  const sourceOnlySummary=JSON.parse(sourceOnlyResponse.result.content.find(x=>x.type==='text').text);assert.equal(sourceOnlySummary.representation,'source-only');assert.equal(sourceOnlySummary.referenceClientExecutionCoverage,'none-source-archive-only');
  const sourceOnlyResource=sourceOnlyResponse.result.content.find(x=>x.type==='resource');assert.equal(sourceOnlyResource.resource.mimeType,'application/json');assert.match(sourceOnlyResource.resource.uri,/gm-coach-plan\.json$/);
  const sourceOnlyArtifact=JSON.parse(sourceOnlyResource.resource.text);assert.equal(sourceOnlyArtifact.kind,'gm-coach-shared-plan');assert.equal(sourceOnlyArtifact.version,1);assert.deepEqual(sourceOnlyArtifact.referenceClientJson.exercises,[]);assert.deepEqual(sourceOnlyArtifact.sidecar.payload.mapping,[]);assert.deepEqual(sourceOnlyArtifact.sidecar.payload.sourceOnlyOmissions,[{sourceEntryId:1,sourceSetIndex:0,reason:'not-represented-in-reference-client-json'}]);
  const bodyweightImport=await call('gm_coach_import_shared_plan',{artifactText:sourceOnlyResource.resource.text});assert.equal(bodyweightImport.representation,'source-only');assert.equal(bodyweightImport.planForPreview.scienceGate,'user_declined');assert.equal(bodyweightImport.planForPreview.exercises[0].loadType,'bodyweight');assert.equal(bodyweightImport.planForPreview.exercises[0].sets[0].reps,8);assert.equal(bodyweightImport.sourceArchive.prescription.exercises[0].sets[0].reps,8);
  const editedBodyweight=await call('gm_coach_import_shared_plan',{artifactText:sourceOnlyResource.resource.text,candidate:{name:'stdio source-only edited',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'Bodyweight squat',section:'main',loadType:'bodyweight',sets:[{unit:'reps',reps:10,mode:1,restSeconds:60}]}]}});
  assert.equal(editedBodyweight.planForPreview.name,'stdio source-only edited');assert.equal(editedBodyweight.planForPreview.exercises[0].sets[0].reps,10);assert.equal(editedBodyweight.planForPreview.scienceGate,'user_declined');assert.deepEqual(editedBodyweight.planForPreview.evidence,[]);assert.equal(editedBodyweight.sourceArchive.prescription.exercises[0].sets[0].reps,8);assert.equal(editedBodyweight.provenance.scientificApproval,false);assert.equal(editedBodyweight.provenance.writeReady,false);assert.equal(editedBodyweight.provenance.mutationSent,false);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const updatePayloadHash=artifact=>{artifact.sidecar.payloadHash=createHash('sha256').update(JSON.stringify(canonical(artifact.sidecar.payload)),'utf8').digest('hex');return JSON.stringify(artifact);};
  const badLedger=structuredClone(sourceOnlyArtifact);badLedger.sidecar.payload.sourceOnlyOmissions=[];
  const tamperedLedger=await request('tools/call',{name:'gm_coach_import_shared_plan',arguments:{artifactText:updatePayloadHash(badLedger)}});assert.equal(tamperedLedger.result.isError,true);assert.match(tamperedLedger.result.content[0].text,/omitted without ledger|omission ledger/i);
  const badMapping=structuredClone(sourceOnlyArtifact);badMapping.sidecar.payload.mapping=[{referenceClientExerciseIndex:0,referenceClientSetIndex:0,sourceEntryId:1,sourceSetIndex:0}];
  const inconsistentMapping=await request('tools/call',{name:'gm_coach_import_shared_plan',arguments:{artifactText:updatePayloadHash(badMapping)}});assert.equal(inconsistentMapping.result.isError,true);assert.match(inconsistentMapping.result.content[0].text,/Exhaustive reference client mapping required|Mapping dose or identity mismatch|source-only shared plans require/i);
  for(const unit of ['kg','lb']){
   const left=unit==='kg'?7:15,right=unit==='kg'?9:18;
   const staticArgs={source:{prescription:{name:'stdio static',exercises:[{entryId:1,id:10,actionLibraryId:20,title:'literal LR',section:'main',loadType:'customize-manual',unilateralPrescription:'explicit-sides',sets:[{side:1,unit:'reps',reps:8,weight:left,weightUnit:unit,mode:1,restSeconds:0},{side:2,unit:'reps',reps:10,weight:right,weightUnit:unit,mode:3,restSeconds:75}]}]},research:{evidence:[],decisionEvidence:[]}},staticWeightUnit:unit,staticLoadProtocol:'account-unit-verbatim',exerciseMetadata:[{entryId:1,exportIsUnilateral:true}]};
   const result=await call('gm_coach_export_portable_source',staticArgs);assert.deepEqual(result.referenceClientJson.exercises[0],{id:10,title:'literal LR',preset:-1,isUnilateralExpanded:true,sets:[{reps:8,weight:left,mode:1,rest:'0'},{reps:10,weight:right,mode:3,rest:75}]});
   const importedStatic=await call('gm_coach_import_portable_source',{referenceClientJson:result.referenceClientJson,sidecar:result.sidecar});assert.equal(importedStatic.writeReady,false);assert.equal(importedStatic.sourceArchive.prescription.exercises[0].sets[1].weightUnit,unit);
  }
  const paired=structuredClone(args);paired.source.prescription.exercises[0].unilateralPrescription='paired-symmetric';const rejected=await request('tools/call',{name:'gm_coach_export_portable_source',arguments:paired});assert.equal(rejected.result.isError,true);assert.match(rejected.result.content[0].text,/bilateral export forbidden/);
  x.referenceClientJson.exercises[0].sets[0].weight=12;const corrupt=await request('tools/call',{name:'gm_coach_import_portable_source',arguments:{referenceClientJson:x.referenceClientJson,sidecar:x.sidecar}});assert.equal(corrupt.result.isError,true);assert.match(corrupt.result.content[0].text,/integrity/);
  delete args.source.prescription.exercises[0].sets[0].sourceRmSelector;const missing=await request('tools/call',{name:'gm_coach_export_portable_source',arguments:args});assert.equal(missing.result.isError,true);assert.match(missing.result.content[0].text,/no default/);
  const attempts=await readFile(marker,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});assert.equal(attempts,'');const created=await readdir(data,{recursive:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});/* Redacted rotating server log (1.0.643) is the only allowed file; no account data. */assert.deepEqual(created.filter(p=>!/^logs([\\/]|$)/.test(p)),[]);
 }finally{
  for(const p of pending.values())clearTimeout(p.timer);
  if(child&&child.exitCode===null&&child.signalCode===null){
   await new Promise((resolve,reject)=>{
    let timer;
    const stopped=()=>{clearTimeout(timer);child.removeListener('close',stopped);child.removeListener('exit',stopped);resolve();};
    child.once('close',stopped);child.once('exit',stopped);
    timer=setTimeout(()=>{child.removeListener('close',stopped);child.removeListener('exit',stopped);reject(Error(`Child termination unconfirmed; retained test directory ${root}`));},2000);
    child.kill();
   });
  }
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gm-portable-stdio-'));await rm(root,{recursive:true,force:true});
 }
});
