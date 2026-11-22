import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {calculateSketchTime,sketchTimeInputSchema} from '../sketch-time.mjs';
test('actual public sketch branch is local and returns server arithmetic',async()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf("    case 'gm_coach_calculate_sketch_time':");const end=source.indexOf("    case 'gm_coach_compare_completed_sessions':",start);assert.ok(start>=0&&end>start);
 const dispatch=vm.runInNewContext(`async args=>{switch('gm_coach_calculate_sketch_time'){${source.slice(start,end)}}}`,{calculateSketchTime,resolveProfile:()=>{throw Error('Account access forbidden');},speedianceApiRequest:()=>{throw Error('API forbidden');}});
 const z={minSeconds:0,maxSeconds:0};const r=await dispatch({rows:[{label:'one',section:'main',side:'bilateral',work:{unit:'seconds',durationSeconds:30},restAfterRange:z,transitionAfterRange:z,overlapAfterSeconds:0}],additionalSetupRange:z});
 assert.equal(r.totalSeconds.minSeconds,30);assert.equal(r.writeReady,false);assert.equal(r.source,'caller-declared-sketch');
});
test('actual public registration exposes pure bounded schema and no private paths',()=>{
 const source=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf("  {\n    name: 'gm_coach_calculate_sketch_time',");const end=source.indexOf("  {\n    name: 'gm_coach_calculate_compact_sketch_time',",start);assert.ok(start>=0&&end>start);
 const registration=source.slice(start,end).trim().replace(/,$/,'');
 const entry=vm.runInNewContext(`(${registration})`,{sketchTimeInputSchema});assert.equal(entry.name,'gm_coach_calculate_sketch_time');assert.equal(entry.inputSchema,sketchTimeInputSchema);
 assert.equal(entry.inputSchema.additionalProperties,false);assert.equal(entry.inputSchema.properties.rows.maxItems,100);assert.deepEqual(entry.inputSchema.required,['rows','additionalSetupRange']);
 for(const key of ['profile','account','evidence','executionScopeDigest','timeEstimation','confirm','weights','exercise_id'])assert.equal(Object.hasOwn(entry.inputSchema.properties,key),false);
 const branchStart=source.indexOf("    case 'gm_coach_calculate_sketch_time':");const branchEnd=source.indexOf("    case 'gm_coach_compare_completed_sessions':",branchStart);
 assert.doesNotMatch(source.slice(branchStart,branchEnd),/resolveProfile|speedianceApiRequest|readProfile|withProfileMutationLock|\/app\/|\/mobile\//);
});
