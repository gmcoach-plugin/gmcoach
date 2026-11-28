import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeWorkoutReader} from '../plugin/native-workout-reader.mjs';
import {readSessionHeartSummary} from '../plugin/session-heart-rate.mjs';
import {readSessionRowingSummary} from '../plugin/session-rowing-telemetry.mjs';
import {assertWritableDeviceType} from '../plugin/program-payload.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    case 'speediance_get_session_detail': {"),end=source.indexOf("    case 'speediance_search_exercises': {",start);
function month(entries){return Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,trainingPlanList:i===7?entries:[]}));}
function harness({type='program',uuid='bound-u',graph={avgHeartRate:100,maxHeartRate:130},identity=true,late=false,afterDetail=false}={}){
 const state={reads:[],graph:0,profile:0,account:'original',locks:0};
 const detail=[{finishedReps:[{finishedCount:8,trainingInfoDetail:{uuid}}]}];
 const c={createNativeWorkoutReader,readSessionHeartSummary,readSessionRowingSummary,assertWritableDeviceType,
  resolveProfile:async()=>{state.profile++;return'synthetic';},
  readProfileConfig:async()=>({config:{deviceType:1,account:state.account},password:'synthetic'}),profileConfigFingerprint:config=>config.account,
  withProfileMutationLock:async(_p,fn)=>{state.locks++;return fn();},
  speedianceApiRequest:async(profile,path,options)=>{
   assert.equal(profile,'synthetic');
   if(path.includes('getHeartRateGraph')&&late)state.account='changed';
   options?.beforeSend?.({deviceType:1,account:state.account},'synthetic');state.reads.push(path);
   if(path.includes('getHeartRateGraph')){state.graph++;if(graph instanceof Error)throw graph;return{code:0,data:graph};}
   if(path.startsWith('/mobile/'))return{code:0,data:identity?[{trainingId:42,type:type==='free'?1:5,startTimestamp:new Date(2026,9,8,12).getTime()}]:[]};
   if(path.includes('monthNew'))return{code:0,data:month(identity?[{trainingId:42,type:type==='course'?2:4,isFinish:1}]:[])};
   return{code:0,data:detail};
  },readSessionForProfile:async()=>{if(afterDetail)state.account='changed';return{payload:{training_id:'42',kind:type,...(type==='free'?{info:{uuid},detail:[]}:{detail})},source:'synthetic',partial:false,fallback:{attempted:false}};},
  annotateWorkoutForProfile:async text=>text,parseCliJson:JSON.parse,readHistoryForProfile:async()=>JSON.stringify([])
 };
 const run=new Function(...Object.keys(c),`return async args=>{switch('speediance_get_session_detail'){${source.slice(start,end)}}};`)(...Object.values(c));
 return{run,state};
}
const args={training_id:'42',date:'2026-10-08',include_heart_rate:true,consent_to_read_health:true};
for(const type of ['program','free','course','ai'])test(`actual public opt-in exact ${type} reports session average`,async()=>{
 const h=harness({type});const r=await h.run({...args,type});assert.equal(r.gmCoachSessionHeartRate.reportedAvgBpm,100);assert.equal(r.gmCoachSessionHeartRate.session.namespace,type);assert.equal(h.state.graph,1);assert.equal(h.state.locks,1);assert.doesNotMatch(JSON.stringify(r.gmCoachSessionHeartRate),/bound-u/);
});
test('actual public consent/date/options errors precede profile and reads',async()=>{
 for(const patch of [{consent_to_read_health:false},{consent_to_read_health:undefined},{date:undefined},{include_heart_rate:'yes'},{consent_to_read_health:1}]){const h=harness();await assert.rejects(h.run({...args,...patch}));assert.equal(h.state.profile,0);assert.equal(h.state.reads.length,0);}
});
test('actual public default detail makes no graph request',async()=>{const h=harness();const r=await h.run({training_id:'42',type:'program'});assert.equal(h.state.graph,0);assert.equal(r.gmCoachSessionHeartRate,undefined);assert.equal(h.state.locks,0);});
test('actual public dated identity mismatch issues no graph',async()=>{for(const type of ['program','free','course','ai']){const h=harness({type,identity:false});await assert.rejects(h.run({...args,type}));assert.equal(h.state.graph,0);}});
test('actual public account drift at detail and transport blocks graph',async()=>{for(const options of [{afterDetail:true},{late:true}]){const h=harness(options);await assert.rejects(h.run({...args,type:'program'}),/Konto/);assert.equal(h.state.graph,0);}});
test('actual public no UUID and graph error preserve completed detail',async()=>{
 for(const options of [{uuid:null},{graph:new Error('secret-password')}]){const h=harness(options);const r=await h.run({...args,type:'program'});assert.equal(r.detail[0].finishedReps[0].finishedCount,8);assert.equal(r.gmCoachSessionHeartRate.status,'unavailable');assert.doesNotMatch(JSON.stringify(r),/secret-password/);}
});
