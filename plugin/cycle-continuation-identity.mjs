import {createHash} from 'node:crypto';
import path from 'node:path';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(x);
const safeSnapshot=value=>{let nodes=0;const visit=(x,depth)=>{if(++nodes>20000||depth>16)throw Error('Continuation snapshot exceeds bounds.');if(x===null||['string','boolean'].includes(typeof x))return x;if(typeof x==='number'&&Number.isFinite(x))return x;if(!x||typeof x!=='object')throw Error('Continuation requires bounded JSON records.');const array=Array.isArray(x);if(Object.getPrototypeOf(x)!==(array?Array.prototype:Object.prototype))throw Error('Continuation requires plain own records.');const descriptors=Object.getOwnPropertyDescriptors(x),out=array?[]:{};for(const key of Reflect.ownKeys(descriptors)){const d=descriptors[key];if(array&&key==='length')continue;if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key)||(array&&!/^(0|[1-9][0-9]*)$/.test(key)))throw Error('Unsafe continuation property.');Object.defineProperty(out,key,{value:visit(d.value,depth+1),enumerable:true,writable:true,configurable:true});}if(array&&Object.keys(out).length!==x.length)throw Error('Sparse continuation array.');return out;};const clean=visit(value,0);if(Buffer.byteLength(JSON.stringify(clean))>1000000)throw Error('Continuation snapshot exceeds bytes.');return clean;};
const exact=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).some(k=>!keys.includes(k)))throw Error('Invalid continuation schema.');};
// Internal service only. Caller must safely load authoritative original snapshots
// under existing storage/profile locks; this registry never reads public archives.
export function createCycleContinuationRegistry({now=Date.now}={}){
 const records=new WeakMap();
 function mint(input){
  const {profile,accountFingerprint,prescriptionDigest,sessions,occurrences,journalPath,journalRoot,journal}=safeSnapshot(input);
  if(!id(profile)||!hash(accountFingerprint)||!hash(prescriptionDigest)||!Array.isArray(sessions)||!sessions.length||sessions.length>364||!Array.isArray(occurrences)||!occurrences.length||occurrences.length>364)throw Error('Invalid original continuation identity.');
  const ordered=sessions.map(s=>{exact(s,['sessionId','executionDigest']);if(!id(s.sessionId)||!hash(s.executionDigest))throw Error('Invalid original execution.');return{sessionId:s.sessionId,executionDigest:s.executionDigest};});
  const dates=occurrences.map(o=>{exact(o,['date','occurrenceId','sessionId']);if(!id(o.occurrenceId)||!id(o.sessionId)||typeof o.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||new Date(o.date+'T00:00:00Z').toISOString().slice(0,10)!==o.date)throw Error('Invalid original occurrence.');return o;});
  if(new Set(ordered.map(s=>s.sessionId)).size!==ordered.length||new Set(dates.map(o=>o.occurrenceId)).size!==dates.length||new Set(dates.map(o=>o.date)).size!==dates.length||dates.some(o=>!ordered.some(s=>s.sessionId===o.sessionId))||ordered.some(s=>!dates.some(o=>o.sessionId===s.sessionId)))throw Error('Ambiguous original continuation identities.');
  if(typeof journalRoot!=='string'||typeof journalPath!=='string'||!path.isAbsolute(journalRoot)||!path.isAbsolute(journalPath))throw Error('Continuation journal outside server root.');
  const relative=path.relative(path.resolve(journalRoot),path.resolve(journalPath));
  if(!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Continuation journal outside server root.');
  const identity=digest({accountFingerprint,prescriptionDigest,sessions:ordered,occurrences:dates});
  if(journal?.version!==1||journal.identity!==identity||!journal.sessions||!journal.occurrences||Object.keys(journal.sessions).length!==ordered.length||Object.keys(journal.occurrences).length!==dates.length)throw Error('Original journal mismatch.');
  for(const s of ordered){const e=journal.sessions[s.sessionId];if(!e||e.executionDigest!==s.executionDigest||!['new','preparing','pending','verified'].includes(e.state)||(e.state==='verified'&&!id(e.templateCode)))throw Error('Invalid original checkpoint.');}
  for(const o of dates)if(!['new','preparing','pending','verified'].includes(journal.occurrences[o.occurrenceId]?.state))throw Error('Invalid original reservation checkpoint.');
  const handle=Object.freeze(Object.create(null));records.set(handle,{profile,accountFingerprint,prescriptionDigest,sessions:ordered,occurrences:dates,journalPath:path.resolve(journalPath),identity,expiresAt:now()+600000});
  return{handle,scientificApproval:false,mutationAuthorized:false};
 }
 function bindRenewedExecution(handle,input){
  const {profile,accountFingerprint,sessions,occurrences,explicitResumeIntent}=safeSnapshot(input);
  const r=records.get(handle);if(!r||r.expiresAt<=now()||r.profile!==profile||r.accountFingerprint!==accountFingerprint||explicitResumeIntent!=='resume-original-exact-cycle')throw Error('Fresh private continuation and explicit resume intent required.');
  const rows=sessions?.map(s=>({sessionId:s.sessionId,executionDigest:s.executionDigest}));
  if(JSON.stringify(rows)!==JSON.stringify(r.sessions)||JSON.stringify(occurrences)!==JSON.stringify(r.occurrences))throw Error('Renewed execution differs from original continuation.');
  // Returns identity only, NEVER a scientific grant. Executor still requires all
  // existing fresh-science, calendar, reconciliation and readback callbacks.
  return{journalPath:r.journalPath,accountFingerprint:r.accountFingerprint,prescriptionDigest:r.prescriptionDigest,scientificApproval:false,mutationAuthorized:false};
 }
 return Object.freeze({mint,bindRenewedExecution,revoke:handle=>records.delete(handle)});
}
