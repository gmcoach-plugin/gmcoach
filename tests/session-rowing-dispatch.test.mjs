import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {staticProtocolConfigurationDigest} from '../plugin/static-protocol-context.mjs';
import vm from 'node:vm';
import {normalizeLoginClientType} from '../plugin/native-login.mjs';

import {readFileSync} from 'node:fs';
import {createNativeWorkoutReader} from '../plugin/native-workout-reader.mjs';
import {readSessionHeartSummary} from '../plugin/session-heart-rate.mjs';
import {readSessionRowingSummary} from '../plugin/session-rowing-telemetry.mjs';
import {assertWritableDeviceType} from '../plugin/program-payload.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const fpStart=source.indexOf('function profileConfigFingerprint('),fpEnd=source.indexOf('\nfunction normalizedExerciseName(',fpStart);
assert.ok(fpStart>=0&&fpEnd>fpStart);
const actualFingerprint=vm.runInNewContext(`${source.slice(fpStart,fpEnd)};profileConfigFingerprint`,{createHash,normalizeLoginClientType,staticProtocolConfigurationDigest});

const start=source.indexOf("    case 'speediance_get_session_detail': {"),end=source.indexOf("    case 'speediance_search_exercises': {",start);
function month(entries){return Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===7?entries:[]}));}
function harness({type='program',uuid='bound-u',graph={pointDataList:[{time:0,spm:20,power:100}]} ,identity=true,late=false,afterDetail=false,deviceType=1}={}){
 const state={reads:[],graph:0,profile:0,account:'original',locks:0};
 const detail=[{finishedReps:[{finishedCount:8,trainingInfoDetail:{uuid}}]}];
 const c={createNativeWorkoutReader,readSessionHeartSummary,readSessionRowingSummary,assertWritableDeviceType,
  resolveProfile:async()=>{state.profile++;return'synthetic';},
  readProfileConfig:async()=>({config:{deviceType,email:state.account+'@synthetic.invalid',region:'EU'},password:'synthetic'}),profileConfigFingerprint:actualFingerprint,
  withProfileMutationLock:async(_p,fn)=>{state.locks++;return fn();},
  speedianceApiRequest:async(profile,path,options)=>{
   assert.equal(profile,'synthetic');
   if(path.includes('boatingSkiDataGraph')&&late)state.account='changed';
   options?.beforeSend?.({deviceType,email:state.account+'@synthetic.invalid',region:'EU'},'synthetic');state.reads.push(path);
   if(path.includes('boatingSkiDataGraph')){state.graph++;if(graph instanceof Error)throw graph;return{code:0,data:graph};}
   if(path.startsWith('/mobile/'))return{code:0,data:identity?[{trainingId:42,type:type==='free'?1:5,startTimestamp:new Date(2026,9,8,12).getTime()}]:[]};
   if(path.includes('monthNew'))return{code:0,data:month(identity?[{trainingId:42,type:type==='course'?2:4,isFinish:1}]:[])};
   return{code:0,data:detail};
  },readSessionForProfile:async()=>{if(afterDetail)state.account='changed';return{payload:{training_id:'42',kind:type,info:{uuid,existBoatingSkiDataGraph:true},...(type==='free'?{detail:[]}:{detail})},source:'synthetic',partial:false,fallback:{attempted:false}};},
  annotateWorkoutForProfile:async text=>text,parseCliJson:JSON.parse,readHistoryForProfile:async()=>JSON.stringify([])
 };
 const run=new Function(...Object.keys(c),`return async args=>{switch('speediance_get_session_detail'){${source.slice(start,end)}}};`)(...Object.values(c));
 return{run,state};
}
const args={training_id:'42',date:'2026-10-08',include_rowing_telemetry:true};
for(const type of ['program','free','course','ai'])test(`actual public rowing ${type} is exact-session scoped`,async()=>{
 const h=harness({type});const r=await h.run({...args,type});const row=r.gmCoachSessionRowingTelemetry;
 assert.equal(row.status,['course','ai'].includes(type)?'unavailable':'reported-samples');
 assert.equal(h.state.graph,['course','ai'].includes(type)?0:1);assert.equal(h.state.locks,1);
 assert.equal(row.unitStatus,'unverified');assert.doesNotMatch(JSON.stringify(row),/bound-u|"points"|"uuid"/);
});
test('row options precede profile and reads',async()=>{for(const patch of [{date:undefined},{include_rowing_telemetry:'yes'},{include_heart_rate:true}]){const h=harness();await assert.rejects(h.run({...args,...patch}));assert.equal(h.state.profile,0);}});
test('row optout retains default behavior',async()=>{const h=harness();const r=await h.run({training_id:'42',type:'program'});assert.equal(h.state.graph,0);assert.equal(r.gmCoachSessionRowingTelemetry,undefined);});
test('row identity mismatches block graph for every namespace',async()=>{for(const type of ['program','free','course','ai']){const h=harness({type,identity:false});await assert.rejects(h.run({...args,type}));assert.equal(h.state.graph,0);}});
test('row account drift before graph blocks request',async()=>{for(const options of [{afterDetail:true},{late:true}]){const h=harness(options);await assert.rejects(h.run({...args,type:'program'}),/Konto/);assert.equal(h.state.graph,0);}});
test('row missingUUID readfailure preserve detail',async()=>{for(const options of [{uuid:null},{graph:new Error('secret-password')}]){const h=harness(options);const r=await h.run({...args,type:'program'});assert.equal(r.detail[0].finishedReps[0].finishedCount,8);assert.equal(r.gmCoachSessionRowingTelemetry.status,'unavailable');assert.doesNotMatch(JSON.stringify(r),/secret-password/);}});

test('row family guard rejects nonGymMonster before API read',async()=>{for(const deviceType of [2,3,'1',undefined]){if(deviceType===undefined)continue;const h=harness({deviceType});await assert.rejects(h.run({...args,type:'program'}));assert.equal(h.state.reads.length,0);}});
