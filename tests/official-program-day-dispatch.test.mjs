import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readOfficialPrograms,readOfficialProgramDay} from '../plugin/official-programs.mjs';
import {markReadOnlyProgramResult} from '../plugin/program-calendar.mjs';
const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    case 'speediance_browse_official_programs': {");
const end=source.indexOf("    case 'speediance_list_saved_programs': {",start);
const raw={id:77,name:'P',weekCount:1,isPermission:true,exclusivePlanWeekList:[{week:1,exclusivePlanDayList:[{day:1,courseList:[{id:9,courseTitle:'C'}]},{day:2,courseList:[]}]}]};
function harness(driftAt=0,{programRaw=raw,beforeSendDriftAt=0}={}){
 let account='A',locked=false;const calls=[];
 const call=vm.runInNewContext(`(async args=>{switch('speediance_browse_official_programs'){${source.slice(start,end)}}})`,{
 Object,Number,readOfficialPrograms,readOfficialProgramDay,markReadOnlyProgramResult,resolveProfile:async()=> 'P',
 readProfileConfig:async()=>({config:account,password:'secret'}),profileConfigFingerprint:(config,password)=>config+password,
 withProfileMutationLock:async(profile,fn)=>{locked=true;try{return await fn();}finally{locked=false;}},
 speedianceApiRequest:async(profile,path,options)=>{if(calls.length+1===beforeSendDriftAt)account='B';if(options?.beforeSend)options.beforeSend(account,'secret');calls.push(path);assert.equal(locked||!options,true);if(calls.length===driftAt)account='B';return path==='/app/exclusivePlan/77'?programRaw:{id:Number(path.match(/\/info\/(\d+)/)[1]),courseTitle:'C',isPermission:true,actionLibraryList:[{title:'E'}]};}
 });return {call,calls};
}
const args={consent_to_read_speediance:true,program_id:77,include_course_details:true,selected_week:1,selected_day:1};
test('actual public selected-day branch qualifies positive and default/false no extra GET',async()=>{
 const h=harness();const out=await h.call(args);assert.equal(out.selectedDay.courses[0].detail.course.id,9);assert.equal(out.mutationSent,false);assert.deepEqual(h.calls,['/app/exclusivePlan/77','/app/v2/course/info/9?weightConfig=1']);
 for(const extra of [{},{include_course_details:false}]){const h=harness();await h.call({consent_to_read_speediance:true,program_id:77,...extra});assert.deepEqual(h.calls,['/app/exclusivePlan/77']);}
 const rest=harness();assert.equal((await rest.call({...args,selected_day:2})).selectedDay.status,'rest-day');assert.equal(rest.calls.length,1);
});
test('actual public account drift after each response throws, prevents later reads',async()=>{
 for(const n of [1,2]){const h=harness(n);await assert.rejects(h.call(args),/Account changed/);assert.equal(h.calls.length,n);}
});
test('actual public argument/consent rejection performs zero GET and never invokes getter',async()=>{
 for(const patch of [{selected_day:0},{selected_week:10001},{program_id:undefined},{include_course_details:'yes'},{consent_to_read_speediance:false}]){const h=harness();await assert.rejects(h.call({...args,...patch}));assert.equal(h.calls.length,0);}
 let invoked=0;const getter={...args};Object.defineProperty(getter,'selected_day',{get(){invoked++;return 1;}});const h=harness();await assert.rejects(h.call(getter),/data properties/);assert.equal(invoked,0);assert.equal(h.calls.length,0);
});

test('actual public selected-day accepts exactly five courses with one plus five GETs',async()=>{
 const five=structuredClone(raw);five.exclusivePlanWeekList[0].exclusivePlanDayList[0].courseList=Array.from({length:5},(_,i)=>({id:i+9,courseTitle:'C'}));
 const h=harness(0,{programRaw:five});const out=await h.call(args);
 assert.deepEqual(h.calls,['/app/exclusivePlan/77',...Array.from({length:5},(_,i)=>`/app/v2/course/info/${i+9}?weightConfig=1`)]);
 assert.deepEqual(out.selectedDay.courses.map(row=>row.detail.course.id),[9,10,11,12,13]);
 assert.equal(out.selectedDay.partial,false);assert.equal(out.selectedDay.status,'read');
});

test('actual public fingerprint drift at course beforeSend prevents the course GET',async()=>{
 const h=harness(0,{beforeSendDriftAt:2});
 await assert.rejects(h.call(args),/Account changed/);
 assert.deepEqual(h.calls,['/app/exclusivePlan/77']);
});
