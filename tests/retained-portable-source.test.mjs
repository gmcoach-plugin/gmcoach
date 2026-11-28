import {installSavedHeaderFixture} from './saved-header-fixture.mjs';
import {readFileSync} from 'node:fs';
import {buildPresetPayload} from '../plugin/program-serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRetainedPortableSource,bindRetainedPortableSource,exportRetainedPortableSource} from '../plugin/retained-portable-source.mjs';

function fixture(unit='kg'){
 const metadata=new Map([[1,{detail:{id:1,isLeftRight:0,isBarbell:0},batch:{id:1,actionLibraryList:[{id:101}]}}]]);
 const raw={name:'Source exact',intakeAnswers:{private:'must-not-retain'},recoveryContext:{reportId:'must-not-retain'},exercises:[{entryId:1,id:1,actionLibraryId:101,title:'Exact catalog exercise',section:'main',loadType:'smart-rm',smartRmPresetName:'Strength',sets:[{unit:'reps',reps:6,mode:1,restSeconds:120,rirTarget:2},{unit:'reps',reps:8,mode:2,restSeconds:90,rirTarget:3}]}],evidence:[],decisionEvidence:[]};
 const plan={name:raw.name,exercises:raw.exercises.map(ex=>({...ex,sets:ex.sets.map((s,i)=>{const {restSeconds,...rest}=s;return {...rest,rest:restSeconds,rmLevel:i?6:5};})}))};
 const candidate=captureRetainedPortableSource(raw,plan,metadata);
 const binding={candidate,accountFingerprint:'a'.repeat(64),templateCode:'saved-A',wireDigest:'b'.repeat(64),staticWeightUnit:unit,staticLoadProtocol:'legacy-reference-client-wire-lb-get-kg',exerciseMetadata:[{entryId:1,exportIsUnilateral:false,exportIsBarbell:false}]};
 return {raw,plan,metadata,candidate,binding};
}
for(const unit of ['kg','lb'])test(`retained actual adapter preserves exact selectors, modes, rests and privacy ${unit}`,()=>{
 const h=fixture(unit),record=bindRetainedPortableSource(h.binding);
 assert.ok(Object.isFrozen(h.candidate.source.prescription.exercises[0].sets[0]));
 h.raw.exercises[0].sets[0].reps=99;assert.equal(record.candidate.original.exercises[0].sets[0].reps,6);
 const exported=exportRetainedPortableSource({record,...h.binding});
 assert.deepEqual(exported.referenceClientJson.exercises[0].sets.map(s=>[s.reps,s.weight,s.mode,Number(s.rest)]),[[6,5,1,120],[8,6,2,90]]);
 assert.equal(exported.writeReady,false);assert.equal(exported.scientificApproval,false);
 const encoded=JSON.stringify(record);assert.ok(!encoded.includes('intakeAnswers'));assert.ok(!encoded.includes('recoveryContext'));assert.ok(!encoded.includes('must-not-retain'));
});
for(const fault of ['account','code','wire','source-tamper','binding-tamper'])test(`retained source rejects ${fault}`,()=>{
 const h=fixture(),record=JSON.parse(JSON.stringify(bindRetainedPortableSource(h.binding))),input={record,...h.binding};
 if(fault==='account')input.accountFingerprint='c'.repeat(64);if(fault==='code')input.templateCode='other';if(fault==='wire')input.wireDigest='d'.repeat(64);
 if(fault==='source-tamper')record.candidate.source.prescription.exercises[0].sets[0].reps=7;
 if(fault==='binding-tamper')record.staticWeightUnit='lb';
 assert.throws(()=>exportRetainedPortableSource(input),/binding changed|digest mismatch/);
});
test('old source absent remains unavailable without reconstruction',()=>{const h=fixture();assert.equal(exportRetainedPortableSource({...h.binding,record:undefined}).status,'unavailable');});
test('source getters are rejected without invocation',()=>{const h=fixture();let calls=0;Object.defineProperty(h.raw,'exercises',{enumerable:true,get(){calls++;return [];}});assert.equal(captureRetainedPortableSource(h.raw,h.plan,h.metadata).status,'unavailable');assert.equal(calls,0);});
test('unknown unit retains archive only without inventing kg',()=>{const h=fixture();h.binding.staticWeightUnit=null;const output=exportRetainedPortableSource({...h.binding,record:bindRetainedPortableSource(h.binding)});assert.equal(output.referenceClientExecutionCoverage,'none-source-archive-only');assert.equal(output.writeReady,false);});

test('raw executable section keeps exact public declarations while excluding nested private fields',()=>{
 const h=fixture();h.raw.warmup={status:'included',health:{secret:'omit-health'},items:[{kind:'ramp_up_set',activity:'Exact catalog exercise',dosage:'Two six-repetition introductory sets',targetExerciseIds:[1],executionRef:1,intakeAnswers:{secret:'omit-intake'}}]};
 h.plan.warmup=h.raw.warmup;
 const candidate=captureRetainedPortableSource(h.raw,h.plan,h.metadata);
 assert.equal(candidate.status,undefined);assert.deepEqual(candidate.original.warmup.items[0],{kind:'ramp_up_set',activity:'Exact catalog exercise',dosage:'Two six-repetition introductory sets',targetExerciseIds:[1],executionRef:1});
 assert.deepEqual(candidate.source.prescription.warmup.instructions,['Exact catalog exercise: Two six-repetition introductory sets']);
 assert.ok(!JSON.stringify(candidate).includes('omit-health'));assert.ok(!JSON.stringify(candidate).includes('omit-intake'));
});

for(const kind of ['profile-auto','cardio','vita'])test(`unsupported source ${kind} is explicit unavailable rather than reconstructed`,()=>{
 const h=fixture();h.plan.exercises[0].loadType=kind;
 const candidate=captureRetainedPortableSource(h.raw,h.plan,h.metadata);
 assert.equal(candidate.status,'unavailable');assert.equal(candidate.reason,'source-not-losslessly-representable-by-portable-v1');
 const exported=exportRetainedPortableSource({...h.binding,record:bindRetainedPortableSource({...h.binding,candidate})});
 assert.equal(exported.status,'unavailable');assert.equal(exported.referenceClientJson,undefined);assert.equal(exported.writeReady,false);
});
for(const fault of ['missing-variant','string-entry','oversized-set-count','invalid-research'])test(`invalid or unsupported retained shape ${fault} remains unavailable`,()=>{
 const h=fixture();if(fault==='missing-variant')h.metadata=new Map();if(fault==='string-entry')h.plan.exercises[0].entryId='unsupported-string';if(fault==='oversized-set-count')h.plan.exercises[0].sets=Array.from({length:101},()=>h.plan.exercises[0].sets[0]);if(fault==='invalid-research')h.raw.evidence=[{token:'must-not-retain'}];
 assert.equal(captureRetainedPortableSource(h.raw,h.plan,h.metadata).status,'unavailable');
});


const adapterSource=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const adapterStart=adapterSource.indexOf('function preserveExerciseFixedKgAuthorization('),adapterEnd=adapterSource.indexOf('async function prepareProgramPayload(',adapterStart);
assert.ok(adapterStart>=0&&adapterEnd>adapterStart);
const actualAdapterClone=new Function(adapterSource.slice(adapterStart,adapterEnd)+';return cloneCycleAdapterPlan;')();
function fixedCloneInput(value){const ex={id:1,entryId:1,actionLibraryId:101,title:'Synthetic fixed',loadType:'fixed-kg',sets:[{unit:'reps',reps:8,weightKg:10,mode:1,rest:90,rirTarget:2}]};if(value!==undefined)Object.defineProperty(ex,'fixedKgAuthorized',{value});return{name:'Fixed original',exercises:[ex]};}
for(const value of [true,false,undefined])test('actual normalized adapter clone preserves own authorization '+String(value),()=>{
 const input=fixedCloneInput(value),before=JSON.stringify(input),out=actualAdapterClone(input);
 assert.equal(JSON.stringify(input),before);assert.notEqual(out.exercises[0],input.exercises[0]);
 assert.deepEqual(Object.getOwnPropertyDescriptor(out.exercises[0],'fixedKgAuthorized'),Object.getOwnPropertyDescriptor(input.exercises[0],'fixedKgAuthorized'));
 const metadata=fixture().metadata;
 if(value===true){const wire=buildPresetPayload(out,metadata,1,'kg',{staticLoadProtocol:'legacy-reference-client-wire-lb-get-kg'}).payload;assert.equal(wire.actionLibraryList[0].weights,'22.0');assert.equal(wire.totalCapacity,176);}
 else assert.throws(()=>buildPresetPayload(out,metadata,1,'kg',{staticLoadProtocol:'legacy-reference-client-wire-lb-get-kg'}),/fixed|manual|ręcz|proś/i);
});
for(const enumerable of [true,false])test('adapter authorization accessor rejects before getter invocation '+enumerable,()=>{const input=fixedCloneInput();let hits=0;Object.defineProperty(input.exercises[0],'fixedKgAuthorized',{enumerable,get(){hits++;return true;}});assert.throws(()=>actualAdapterClone(input),/descriptor/);assert.equal(hits,0);});
test('adapter inherited and symbol markers never transfer authorization',()=>{const input=fixedCloneInput();Object.setPrototypeOf(input.exercises[0],{fixedKgAuthorized:true});input.exercises[0][Symbol('synthetic-authority')]=true;const out=actualAdapterClone(input);assert.equal(Object.hasOwn(out.exercises[0],'fixedKgAuthorized'),false);assert.deepEqual(Object.getOwnPropertySymbols(out.exercises[0]),[]);assert.throws(()=>buildPresetPayload(out,fixture().metadata,1,'kg',{staticLoadProtocol:'legacy-reference-client-wire-lb-get-kg'}));});
for(const value of ['true',1,null])test('adapter rejects nonboolean own marker '+String(value),()=>{assert.throws(()=>actualAdapterClone(fixedCloneInput(value)),/descriptor/);});

function nutritionArchiveInput(){const h=fixture();h.raw.decisionEvidence=[{category:'nutrition_context',target:'plan',value:'unknown',status:'not_applicable',relationship:'not_applicable',reasoning:'Synthetic explicit refusal; no nutrition inference',evidenceIds:[],supportingExcerpts:[]}];return h;}
test('actual retained capture bind export preserves supported nutrition refusal reasoning and nonexecution',()=>{
 const h=nutritionArchiveInput(),candidate=captureRetainedPortableSource(h.raw,h.plan,h.metadata);assert.equal(candidate.status,undefined);
 const record=bindRetainedPortableSource({...h.binding,candidate});const out=exportRetainedPortableSource({...h.binding,record});
 assert.equal(out.status,'exported-retained-source');assert.equal(out.sourceArchive.research.decisionEvidence[0].reasoning,h.raw.decisionEvidence[0].reasoning);
 for(const flag of ['originVerified','writeReady','scientificApproval'])assert.equal(out[flag],false);
 const changed=structuredClone(record);changed.candidate.source.research.decisionEvidence[0].reasoning='Changed historical reasoning';assert.throws(()=>exportRetainedPortableSource({...h.binding,record:changed}),/binding|digest/);
});
for(const patch of [{reason:'unsupported alias'},{reasoning:''},{reasoning:' '},{reasoning:{}},{health:{private:'omit'}},{approvalId:'private'}])test('retained refusal rejects unsupported reason/type/private patch '+JSON.stringify(patch),()=>{const h=nutritionArchiveInput();Object.assign(h.raw.decisionEvidence[0],patch);const candidate=captureRetainedPortableSource(h.raw,h.plan,h.metadata);assert.equal(candidate.status,'unavailable');});

test('actual mixed RM Customize clone serializer capture export preserve timed source and separate adapter assessment',()=>{
 const h=nutritionArchiveInput();h.raw.exercises.push({entryId:2,id:1,actionLibraryId:101,title:'Exact catalog exercise',section:'main',loadType:'customize-manual',sets:[{unit:'seconds',durationSeconds:30,weight:10,weightUnit:'kg',mode:3,restSeconds:75}]});
 h.plan.exercises.push({...h.raw.exercises[1],movementKind:'strength',staticLoadRequested:true,sets:[{...h.raw.exercises[1].sets[0],rest:75}]});
 h.plan.exercises[0].smartRmPresetId=5;
 const pristine=JSON.stringify(h.plan),adapter=actualAdapterClone(h.plan);
 adapter.timeBudgetAssessment={status:'synthetic-already-qualified-assessment',minSeconds:300,maxSeconds:360};
 const wire=buildPresetPayload(adapter,h.metadata,1,'kg',{staticLoadProtocol:'legacy-reference-client-wire-lb-get-kg'}).payload;
 assert.equal(wire.actionLibraryList[1].weights,'22.0');assert.equal(wire.actionLibraryList[1].setsAndReps,'30');assert.equal(wire.actionLibraryList[1].completionMethod,'2');assert.equal(wire.actionLibraryList[1].sportMode,'3');assert.equal(wire.actionLibraryList[1].breakTime,'75');
 assert.equal(JSON.stringify(h.plan),pristine);assert.equal(h.plan.timeBudgetAssessment,undefined);
 const candidate=captureRetainedPortableSource(h.raw,adapter,h.metadata);assert.equal(candidate.status,undefined);
 const record=bindRetainedPortableSource({...h.binding,candidate,exerciseMetadata:[{entryId:1,exportIsUnilateral:false,exportIsBarbell:false},{entryId:2,exportIsUnilateral:false,exportIsBarbell:false}]});
 const out=exportRetainedPortableSource({...h.binding,record});
 assert.equal(out.sourceArchive.prescription.exercises[1].sets[0].durationSeconds,30);assert.equal(out.sourceArchive.prescription.exercises[1].sets[0].weight,10);assert.equal(out.sourceArchive.prescription.exercises[1].sets[0].restSeconds,75);
 assert.equal(out.sourceArchive.prescription.exercises[1].sets[0].mode,3);assert.equal(out.referenceClientJson.exercises.length,1);assert.equal(out.sidecar.payload.sourceOnlyOmissions.length,1);assert.equal(out.writeReady,false);
});

import {encodeSavedPresentation,decodeSavedPresentation,presentSavedRead,assertSavedPresentationArguments} from '../plugin/saved-presentation.mjs';
test('presentation preserves every differing set and unknown field with lossless provenance refs',()=>{
 const source={baseDigest:'a'.repeat(64),actionLibraryList:[],name:'x',operationStatus:'read-only',exercises:[{exerciseId:1,sets:[{set:1,unit:'unknown',unitEvidence:[{issue:'unknown'}],loadDiagnostics:['ambiguous'],futureUnknown:{literal:1},side:1},{set:2,unit:'seconds',unitEvidence:[{issue:'unknown'}],loadDiagnostics:['other'],side:2}]}]};
 const out=encodeSavedPresentation(source);assert.deepEqual(decodeSavedPresentation(out),source.exercises);assert.equal(out.baseDigest,undefined);assert.deepEqual(out.omittedFields,['baseDigest','actionLibraryList']);assert.equal(out.writeReady,false);assert.equal(out.scientificApproval,false);
 const wrong=structuredClone(out);wrong.exercises[0].sets[0].sharedFieldsRefs.unitEvidence=999;assert.throws(()=>decodeSavedPresentation(wrong),/reference/);
 const collision=structuredClone(out);collision.exercises[0].sets[0].unitEvidence=[];assert.throws(()=>decodeSavedPresentation(collision),/collision/);
 const sourceCollision=structuredClone(source);sourceCollision.exercises[0].sets[0].sharedFieldsRefs={};const fallback=presentSavedRead(sourceCollision);assert.equal(fallback.outputView,'full');assert.equal(fallback.baseDigest,source.baseDigest);assert.match(fallback.presentationDiagnostic,/full result/);assert.equal(fallback.writeReady,undefined);
});
test('presentation arguments reject every own excluded field before IO including false',()=>{
 assert.equal(assertSavedPresentationArguments({}),'full');assert.equal(assertSavedPresentationArguments({output_view:'full',include_coach_review:true}),'full');assert.throws(()=>assertSavedPresentationArguments({output_view:'bad'}));
 for(const key of ['include_action_library_list','include_coach_review','unit_confirmations','confirmed_weight_unit'])for(const value of [false,undefined,[],null])assert.throws(()=>assertSavedPresentationArguments({output_view:'presentation',[key]:value}),/excludes/);
});
test('presentation decoder refuses sparse malformed field refs and getters without invocation',()=>{
 let calls=0;const input={exercises:[]};Object.defineProperty(input,'unsafe',{enumerable:true,get(){calls++;return 1;}});assert.throws(()=>encodeSavedPresentation(input),/plain JSON/);assert.equal(calls,0);
 const out=encodeSavedPresentation({exercises:[{sets:[{unitNote:'literal'}]}]});out.sharedSetFields[0].field='unit';assert.throws(()=>decodeSavedPresentation(out),/shared field/);
 assert.throws(()=>decodeSavedPresentation({outputView:'presentation',presentationSchema:'wrong'}),/schema/);
});


test('actual saved read dispatch rejects explicit null and undefined view before profile IO',async()=>{
 const {assertSavedPresentationArguments}=await import('../plugin/saved-presentation.mjs');
 const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
 const start=source.indexOf("case 'speediance_get_saved_program': {");const end=source.indexOf("case 'speediance_preview_saved_program_update':",start);assert.ok(start>0&&end>start);
 let io=0;const resolveProfile=async()=>{io++;throw Error('PROFILE_IO_MUST_NOT_RUN');};
 const actualServices=installSavedHeaderFixture({assertSavedPresentationArguments,resolveProfile});
 const dispatch=new Function(...Object.keys(actualServices),"return async function(args){switch('speediance_get_saved_program'){"+source.slice(start,end)+"}}")(...Object.values(actualServices));
 for(const value of [null,undefined])await assert.rejects(dispatch({output_view:value}),/Invalid output_view/);
 let getterCalls=0;const getter={};Object.defineProperty(getter,'output_view',{get(){getterCalls++;return 'presentation';}});await assert.rejects(dispatch(getter),/Invalid output_view/);assert.equal(getterCalls,0);assert.equal(io,0);
 await assert.rejects(dispatch({}),/PROFILE_IO_MUST_NOT_RUN/);assert.equal(io,1,'absent defaults to full and reaches actual profile boundary');
});


test('saved diagnostic option rejects invalid boolean and presentation before profile access',async()=>{
 const {assertSavedPresentationArguments}=await import('../plugin/saved-presentation.mjs');
 assert.equal(assertSavedPresentationArguments({include_load_diagnostics:true}),'full');assert.equal(assertSavedPresentationArguments({include_load_diagnostics:false}),'full');
 for(const value of [null,undefined,0,'true'])assert.throws(()=>assertSavedPresentationArguments({include_load_diagnostics:value}),/boolean/);
 assert.throws(()=>assertSavedPresentationArguments({output_view:'presentation',include_load_diagnostics:true}),/excludes/);
 let calls=0;const input={};Object.defineProperty(input,'include_load_diagnostics',{get(){calls++;return true;}});assert.throws(()=>assertSavedPresentationArguments(input),/boolean/);assert.equal(calls,0);
});


test('actual saved read optional load diagnostics use already fetched template and retain final account gate',async()=>{
 const {assertSavedPresentationArguments}=await import('../plugin/saved-presentation.mjs');const {projectSavedLoadDiagnostics,projectSavedAccountUnitDiagnostic}=await import('../plugin/saved-templates.mjs');
 const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');const start=source.indexOf("case 'speediance_get_saved_program': {");const end=source.indexOf("case 'speediance_preview_saved_program_update':",start);assert.ok(start>0&&end>start);
 const raw={code:'synthetic',actionLibraryList:[{groupId:1,actionLibraryId:2,weights:'0',counterweight2:0}]};let gets=0,checks=0,failFinal=false;
 const services={assertSavedPresentationArguments,resolveProfile:async()=> 'synthetic',readProfileConfig:async()=>({config:{deviceType:1}}),assertUnitMemoryAccountBinding:()=>({synthetic:true}),getSavedTemplateByCode:async()=>{gets++;return raw;},assertUnitMemoryAccountCurrent:async()=>{checks++;if(failFinal&&checks%3===0)throw Error('ACCOUNT_CHANGED');},createSavedTemplateSnapshot:()=>({code:'synthetic'}),buildReadableSavedTemplate:async(_t,_p,_u,_w,_b,diagnostic)=>({exercises:[],...(diagnostic?{accountUnitInspectionReadOnly:projectSavedAccountUnitDiagnostic({})}:{})}),readProgramCoachNotes:async()=>({programs:{}}),reconciledProgramCoachNotes:()=>({}),savedIdentityAccountFingerprint:()=> 'synthetic-fingerprint',resolveStaticProtocolReadContext:()=>({}),markReadOnlyProgramResult:value=>({...value,operationStatus:'read-only',programCreatedByThisCall:false}),savedTemplateDigest:()=> 'synthetic-digest',projectSavedLoadDiagnostics};
 const actualServices=installSavedHeaderFixture(services);
 const call=new Function(...Object.keys(actualServices),"return async function(args){switch('speediance_get_saved_program'){"+source.slice(start,end)+"}}")(...Object.values(actualServices));
 const plain=await call({program_code:'synthetic'});assert.equal(Object.hasOwn(plain,'loadDiagnosticsReadOnly'),false);assert.equal(gets,1);assert.equal(checks,3);
 const diagnostic=await call({program_code:'synthetic',include_load_diagnostics:true});assert.equal(gets,2);assert.equal(checks,6);assert.equal(diagnostic.loadDiagnosticsReadOnly.actions[0].signals.counterweight2.value,0);assert.equal(diagnostic.operationStatus,'read-only');assert.equal(diagnostic.programCreatedByThisCall,false);assert.equal(Object.hasOwn(diagnostic,'actionLibraryList'),false);
 for(const args of [{include_load_diagnostics:'true'},{output_view:'presentation',include_load_diagnostics:true}])await assert.rejects(call(args),/boolean|excludes/);assert.equal(gets,2);
 failFinal=true;await assert.rejects(call({program_code:'synthetic',include_load_diagnostics:true}),/ACCOUNT_CHANGED/);assert.equal(gets,3);
});


test('saved diagnostic paging accepts only validated own fields',async()=>{const {assertSavedPresentationArguments}=await import('../plugin/saved-presentation.mjs');for(const input of [Object.create({include_load_diagnostics:true}),{include_load_diagnostics:true,load_diagnostics_offset:-1},{include_load_diagnostics:true,load_diagnostics_limit:9},{load_diagnostics_offset:0}])assert.throws(()=>assertSavedPresentationArguments(input));assert.equal(assertSavedPresentationArguments({include_load_diagnostics:true,load_diagnostics_offset:4,load_diagnostics_limit:4}),'full');});
