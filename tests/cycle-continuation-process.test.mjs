import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('two terminal processes preserve actual executor verified lineage while a fresh private registry resumes remaining work',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'gm-continuation-process-'));let retain=false;
 const child=phase=>new Promise((resolve,reject)=>{const processHandle=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/continuation-process-worker.mjs',import.meta.url)),phase,directory],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',closed=false,lateTimer;const timer=setTimeout(()=>{processHandle.kill();lateTimer=setTimeout(()=>{if(!closed){retain=true;reject(Error(`Child did not confirm terminal exit; retained ${directory}`));}},20000);},30000);processHandle.stdout.on('data',data=>{out+=data;if(out.length>64000)processHandle.kill();});processHandle.stderr.on('data',data=>{err+=data;if(err.length>64000)processHandle.kill();});processHandle.on('error',error=>{if(!processHandle.pid){closed=true;clearTimeout(timer);reject(error);}});processHandle.on('close',code=>{closed=true;clearTimeout(timer);clearTimeout(lateTimer);if(code!==0)return reject(Error(`Confirmed terminal child ${phase} exit ${code}: ${err.slice(0,4000)}`));try{resolve(JSON.parse(out.trim()));}catch(error){reject(error);}});});
 try{const first=await child('first');assert.equal(first.creates,1);assert.equal(first.verifiedCode,'literal-a');assert.equal(first.terminalExpected,true);const renewed=await child('renewed');assert.equal(renewed.creates,2);assert.equal(renewed.reserves,2);assert.equal(renewed.verifiedCode,'literal-a');assert.equal(renewed.terminalExpected,true);}finally{if(!retain)await rm(directory,{recursive:true,force:true});}
});
