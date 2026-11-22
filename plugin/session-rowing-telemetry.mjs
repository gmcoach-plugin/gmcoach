// Community consumer schema, not official Speediance unit evidence.
export const ROWING_SOURCE = 'https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/speediance/parsing.py';
import { extractSessionHeartUuid } from './session-heart-rate.mjs';
const MAX_POINTS = 10000;
// Public-response resource bound; not an API or physiological limit.
const MAX_PUBLIC_BLOCKS = 64;
const FIELDS = ['time','spm','pace','power','resistance','minSpm','maxSpm','minResistance','maxResistance'];
function record(value) {
  if (!value || typeof value !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) throw new Error('Unsupported rowing record.');
  const keys=Object.getOwnPropertyNames(value);
  if(keys.length>256 || keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))) throw new Error('Unsupported rowing descriptors.');
  return value;
}
export async function readSessionRowingSummary({payload,type,trainingId,date,apiRead,assertCurrent}={}) {
 const base={requested:true,sourceEndpoint:'/app/boatingSkiDataGraph/{uuid}',session:{trainingId,date,namespace:type},unitStatus:'unverified',durationCalculated:false,biologicalReadinessCalculated:false};
 if(!['program','free','course','ai'].includes(type)||typeof trainingId!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(trainingId)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof apiRead!=='function'||typeof assertCurrent!=='function') throw new Error('Bound rowing identity and guards required.');
 await assertCurrent();
 let uuid,flag;
 try {record(payload);const info=payload.info===undefined||payload.info===null?null:record(payload.info);flag=info?.existBoatingSkiDataGraph;if(flag!==undefined&&typeof flag!=='boolean')throw new Error('Flag');uuid=extractSessionHeartUuid(payload,type);} catch {return {...base,status:'unsupported-schema',diagnostic:'session-rowing-identity-or-flag-unrecognized'};}
 if(flag!==true)return {...base,status:'unavailable',diagnostic:'session-rowing-flag-not-confirmed'};
 if(!uuid)return {...base,status:'unavailable',diagnostic:'session-rowing-uuid-missing'};
 let response;
 try {response=await apiRead(`/app/boatingSkiDataGraph/${encodeURIComponent(uuid)}`);}catch {await assertCurrent();return {...base,status:'unavailable',diagnostic:'session-rowing-read-failed'};}
 await assertCurrent();
 try {record(response);if(response.code!==0)return {...base,status:'unavailable',diagnostic:'session-rowing-api-rejected'};
  const parsed=normalizeSessionRowingGraph(response.data);const {points,blocks,...summary}=parsed;
  const publicBlocks=blocks.slice(0,MAX_PUBLIC_BLOCKS);
  return {...base,...summary,blocks:publicBlocks,totalReportedBlockCount:blocks.length,returnedBlockCount:publicBlocks.length,blocksTruncated:blocks.length>publicBlocks.length,blockOutputLimit:MAX_PUBLIC_BLOCKS,blockOutputLimitSemantics:'public-response-resource-bound-not-api-or-physiological-limit',reportedSampleTimeRange:points.length?[points[0].time,points.at(-1).time]:null};
 }catch{return {...base,status:'unsupported-schema',diagnostic:'session-rowing-graph-unrecognized'};}
}
function dense(value) {
  if(!Array.isArray(value)||value.length>MAX_POINTS||Object.getOwnPropertySymbols(value).length) throw new Error('Unsupported rowing array.');
  const keys=Object.getOwnPropertyNames(value);
  if(keys.length!==value.length+1||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))) throw new Error('Unsupported rowing array descriptors.');
  for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) throw new Error('Sparse rowing array.');
  return value;
}
/** Finite numeric API fields only; zero is retained, never interpreted as missing. */
export function normalizeSessionRowingGraph(graph) {
  const raw=Array.isArray(graph)?dense(graph):dense(record(graph).pointDataList);
  const diagnostics=[];
  const points=[];
  let invalidCount=0;
  for(const item of raw) {
    record(item);
    const point={};
    let invalid=false;
    for(const key of FIELDS) {
      const value=item[key];
      if(value===undefined||value===null) {point[key]=null;continue;}
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9) {invalid=true;continue;}
      point[key]=value;
    }
    if(invalid||point.time===null) {invalidCount++;continue;}
    if(point.minSpm!==null&&point.maxSpm!==null&&point.minSpm>point.maxSpm || point.minResistance!==null&&point.maxResistance!==null&&point.minResistance>point.maxResistance) {invalidCount++;continue;}
    points.push(point);
  }
  if(invalidCount) diagnostics.push('invalid-or-missing-point-fields');
  const times=new Set();
  for(const p of points) {if(times.has(p.time)) diagnostics.push('duplicate-timestamps');times.add(p.time);}
  const originalOrdered=points.every((p,i)=>i===0||p.time>=points[i-1].time);
  points.sort((a,b)=>a.time-b.time);
  const gaps=points.slice(1).map((p,i)=>p.time-points[i].time);
  const regular=gaps.length>0&&gaps.every(x=>x>0&&x===gaps[0]);
  const band=p=>JSON.stringify([p.minSpm,p.maxSpm,p.minResistance,p.maxResistance]);
  const blocks=[];
  for(const point of points) {
    if(!blocks.length||blocks.at(-1).bandKey!==band(point)) blocks.push({bandKey:band(point),points:[]});
    blocks.at(-1).points.push(point);
  }
  const summarize=list=>{
    const known=list.filter(p=>p.spm!==null), stroking=known.filter(p=>p.spm>0);
    const stats=key=>{const values=stroking.map(p=>p[key]).filter(v=>v!==null);return {sampleCount:values.length,sampleMean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};};
    const eligible=stroking.filter(p=>p.minSpm!==null&&p.maxSpm!==null);
    return {sampleCount:list.length,reportedZeroSpmSampleCount:known.length-stroking.length,reportedPositiveSpmSampleCount:stroking.length,unknownSpmSampleCount:list.length-known.length,spm:stats('spm'),pace:stats('pace'),power:stats('power'),resistance:stats('resistance'),targetEligibleSampleCount:eligible.length,inTargetSamplePercent:eligible.length?100*eligible.filter(p=>p.spm>=p.minSpm&&p.spm<=p.maxSpm).length/eligible.length:null};
  };
  return {status:points.length?'reported-samples':'unavailable',source:ROWING_SOURCE,rawSampleCount:raw.length,acceptedSampleCount:points.length,invalidSampleCount:invalidCount,partial:invalidCount>0||diagnostics.includes('duplicate-timestamps'),diagnostics:[...new Set(diagnostics)],originalTimestampOrderNondecreasing:originalOrdered,observedTimestampStep:regular?gaps[0]:null,observedTimestampStepStatus:regular?'uniform-in-observed-samples':'unverified-or-irregular',timeUnit:'unverified',paceUnit:'unverified',powerUnit:'unverified',resistanceUnit:'unverified',durationCalculated:false,caloriesCalculated:false,timeInTargetCalculated:false,biologicalReadinessCalculated:false,points,summary:summarize(points),blocks:blocks.map((b,i)=>({block:i+1,firstReportedTime:b.points[0].time,lastReportedTime:b.points.at(-1).time,reportedTargetSpm:[b.points[0].minSpm,b.points[0].maxSpm],reportedTargetResistance:[b.points[0].minResistance,b.points[0].maxResistance],...summarize(b.points)}))};
}
