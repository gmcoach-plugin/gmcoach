import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeTrainingCycle } from '../plugin/training-cycle-executor.mjs';
import { spawn } from 'node:child_process';

test('executor accepts 33 104 and 364 fully referenced definitions before isolated preflight stop', async t => {
  for (const count of [33,104,364]) {
    const { input, state } = await fixture(t);
    input.sessions=Array.from({length:count},(_,i)=>({sessionId:`s${i}`,executionDigest:'c'.repeat(64)}));
    input.occurrences=input.sessions.map((x,i)=>({occurrenceId:`o${i}`,sessionId:x.sessionId,date:'2026-10-05'}));
    input.revalidate=async()=>{throw Error('boundary-preflight-reached');};
    await assert.rejects(executeTrainingCycle(input),/boundary-preflight-reached/);
    assert.equal(state.creates,0); assert.equal(state.reserves,0);
  }
});
test('executor rejects 365 definitions orphan unknown reference and fewer occurrences before callbacks',async t=>{
  for(const shape of ['365','orphan','unknown','fewer']){
    const {input,state}=await fixture(t);let called=0;input.revalidate=async()=>{called++;};
    if(shape==='365'){input.sessions=Array.from({length:365},(_,i)=>({sessionId:`s${i}`,executionDigest:'c'.repeat(64)}));input.occurrences=input.sessions.map((x,i)=>({occurrenceId:`o${i}`,sessionId:x.sessionId}));}
    if(shape==='orphan'){input.sessions.push({sessionId:'unused',executionDigest:'c'.repeat(64)});input.occurrences.push({occurrenceId:'repeat',sessionId:'one'});}
    if(shape==='unknown')input.occurrences[0].sessionId='missing';
    if(shape==='fewer')input.sessions.push({sessionId:'unused',executionDigest:'c'.repeat(64)});
    await assert.rejects(executeTrainingCycle(input));assert.equal(called,0);assert.equal(state.creates,0);
  }
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gm-cycle-executor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { creates: 0, reserves: 0, remoteProgram: false, reservation: false, uncertain: false, changed: false, fresh: true };
  const input = { journalPath: path.join(directory, 'cycle.json'), accountFingerprint: 'a'.repeat(64), prescriptionDigest: 'b'.repeat(64),
    sessions: [{ sessionId: 'one', executionDigest: 'c'.repeat(64) }], occurrences: [{ occurrenceId: 'day', date: '2026-10-05', sessionId: 'one' }],
    revalidate: async () => { if (!state.fresh) throw new Error('expired science'); }, checkCalendar: async () => {},
    createSession: async (_session, checkpoint, markDispatch) => { await checkpoint([]); await markDispatch(); state.creates++; state.remoteProgram = true; if (state.uncertain) throw new Error('transport unknown'); return 'code'; },
    reconcileSession: async () => state.remoteProgram ? 'code' : null,
    verifySession: async () => state.remoteProgram && !state.changed,
    reserve: async (_row, _code, markDispatch) => { await markDispatch(); state.reserves++; state.reservation = true; }, verifyReservation: async () => state.reservation };
  return { input, state };
}
test('durable cycle completes once and rereads verified programs/calendar on repeat', async t => {
  const { input, state } = await fixture(t);
  assert.equal((await executeTrainingCycle(input)).complete, true);
  assert.equal((await executeTrainingCycle(input)).complete, true);
  assert.equal(state.creates, 1); assert.equal(state.reserves, 1);
  state.reservation = false;
  await assert.rejects(executeTrainingCycle(input), /no automatic resend/);
  assert.equal(state.reserves, 1);
});
test('uncertain program POST reconciles read-only without creating duplicate', async t => {
  const { input, state } = await fixture(t); state.uncertain = true;
  await assert.rejects(executeTrainingCycle(input), /transport unknown/);
  const checkpoint = JSON.parse(await readFile(input.journalPath, 'utf8'));
  assert.equal(checkpoint.sessions.one.state, 'pending');
  state.uncertain = false;
  assert.equal((await executeTrainingCycle(input)).complete, true);
  assert.equal(state.creates, 1);
});
test('unprovable pending, changed verified template and expired science never replay', async t => {
  const { input, state } = await fixture(t); state.uncertain = true;
  await assert.rejects(executeTrainingCycle(input)); state.remoteProgram = false;
  await assert.rejects(executeTrainingCycle(input), /no POST replay/); assert.equal(state.creates, 1);
  state.remoteProgram = true; state.uncertain = false; await executeTrainingCycle(input);
  state.changed = true; await assert.rejects(executeTrainingCycle(input), /do not recreate/);
  state.changed = false; state.fresh = false; await assert.rejects(executeTrainingCycle(input), /expired science/);
  assert.equal(state.creates, 1);
});
test('live owner lock never expires by age', async t => {
  const { input } = await fixture(t);
  await writeFile(`${input.journalPath}.lock`, JSON.stringify({ pid: process.pid, token: 'fixture', startedAt: '1900-01-01' }));
  await assert.rejects(executeTrainingCycle(input), /live or unconfirmed/);
});
test('proven pre-dispatch preparation failure is retryable while pending remains uncertain', async t => {
  const { input, state } = await fixture(t);
  const original = input.createSession;
  input.createSession = async (_session, checkpoint) => { await checkpoint([]); throw new Error('preflight changed'); };
  await assert.rejects(executeTrainingCycle(input), /preflight/);
  assert.equal(JSON.parse(await readFile(input.journalPath, 'utf8')).sessions.one.state, 'preparing');
  assert.equal(state.creates, 0);
  input.createSession = original;
  assert.equal((await executeTrainingCycle(input)).complete, true);
  assert.equal(state.creates, 1);
});
test('reservation preparation failure retries without recreating a verified template', async t => {
  const { input, state } = await fixture(t), original = input.reserve;
  input.reserve = async () => { throw new Error('source expired before dispatch'); };
  await assert.rejects(executeTrainingCycle(input), /expired/);
  assert.equal(JSON.parse(await readFile(input.journalPath, 'utf8')).occurrences.day.state, 'preparing');
  input.reserve = original; await executeTrainingCycle(input);
  assert.equal(state.creates, 1); assert.equal(state.reserves, 1);
});
test('account or complete prescription identity mismatch cannot reuse journal', async t => {
  const { input } = await fixture(t); await executeTrainingCycle(input);
  await assert.rejects(executeTrainingCycle({ ...input, accountFingerprint: 'd'.repeat(64) }), /identity/);
});
test('dead owner recovery has exclusive guard and cannot remove another recoverers lock', async t => {
  const { input } = await fixture(t);
  const deadPid = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true });
    child.once('error', reject); child.once('exit', () => resolve(child.pid));
  });
  await writeFile(`${input.journalPath}.lock`, JSON.stringify({ pid: deadPid, token: 'dead-owner' }));
  await writeFile(`${input.journalPath}.lock.recovery`, 'another owner');
  await assert.rejects(executeTrainingCycle(input), /recovery is owned/);
  assert.equal(JSON.parse(await readFile(`${input.journalPath}.lock`, 'utf8')).token, 'dead-owner');
  await rm(`${input.journalPath}.lock.recovery`);
  assert.equal((await executeTrainingCycle(input)).complete, true);
});

// Actual production reader and executor with deterministic filesystem read faults.
async function journalReadFaultFixture(kind) {
  const { default: vm } = await import('node:vm');
  const { createHash, randomBytes } = await import('node:crypto');
  const { constants } = await import('node:fs');
  const actual = await readFile(new URL('../plugin/training-cycle-executor.mjs', import.meta.url), 'utf8');
  const text = actual.replace(/^import .*;\r?\n/gm, '').replace('export async function executeTrainingCycle', 'async function executeTrainingCycle').replace('export async function readCycleContinuationJournal', 'async function readCycleContinuationJournal').replace('export function assertContinuationCheckpointFloor', 'function assertContinuationCheckpointFloor');
  const bytes = Buffer.from(JSON.stringify({ version: 1, identity: 'synthetic', sessions: {}, occurrences: {} }));
  let reads = 0, stats = 0, closes = 0, creates = 0, reserves = 0;
  const stat = { dev: 1, ino: 2, size: bytes.length, mtimeMs: 10, isFile: () => true, isSymbolicLink: () => false, isDirectory: () => false };
  const file = path.join(os.tmpdir(), 'synthetic-journal-reader.json');
  const context = vm.createContext({ Buffer, createHash, randomBytes, constants, path, process,
    lstat: async p => p === path.dirname(file) ? { isDirectory: () => true, isSymbolicLink: () => false } : { ...stat },
    open: async p => p.endsWith('.lock') ? { writeFile: async () => {}, sync: async () => {}, close: async () => {} } : {
      stat: async () => { stats++; return { ...stat, ...(kind === 'replace' ? { ino: 3 } : {}), ...(stats > 1 && kind === 'mtime' ? { mtimeMs: 11 } : {}), ...(stats > 1 && kind === 'truncate' ? { size: bytes.length - 1 } : {}) }; },
      read: async (buffer, offset, length, position) => { reads++; const count = Math.min(7, length, Math.max(0, bytes.length - position)); bytes.copy(buffer, offset, position, position + count); return { bytesRead: count }; },
      close: async () => { closes++; }
    }, rename: async () => {}, unlink: async () => {}
  });
  vm.runInContext(text, context);
  return { context, file, expected: JSON.parse(bytes), counts: () => ({ reads, closes, creates, reserves }),
    execute: () => context.executeTrainingCycle({ journalPath: file, accountFingerprint: 'a'.repeat(64), prescriptionDigest: 'b'.repeat(64), sessions: [{ sessionId: 's', executionDigest: 'c'.repeat(64) }], occurrences: [{ occurrenceId: 'o', sessionId: 's' }], revalidate: async () => {}, checkCalendar: async () => {}, createSession: async () => { creates++; }, reserve: async () => { reserves++; }, reconcileSession: async () => null, verifySession: async () => true, verifyReservation: async () => true }) };
}
test('actual journal reader completes repeated short reads and closes descriptor', async () => {
  const fixture = await journalReadFaultFixture('short');
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture.context.read(fixture.file))), fixture.expected);
  assert.ok(fixture.counts().reads > 2); assert.equal(fixture.counts().closes, 1);
});
for (const fault of ['replace', 'mtime', 'truncate']) test(`actual executor rejects journal ${fault} read before mutation callbacks`, async () => {
  const fixture = await journalReadFaultFixture(fault);
  await assert.rejects(fixture.execute(), /Cycle journal (identity changed|changed during read)/);
  assert.equal(fixture.counts().creates, 0); assert.equal(fixture.counts().reserves, 0); assert.equal(fixture.counts().closes, 1);
});


test('actual executor renews exact original verified checkpoints without recreate or re-reserve',async t=>{
 const {input,state}=await fixture(t);await executeTrainingCycle(input);
 const floor=JSON.parse(await readFile(input.journalPath,'utf8'));assert.equal(floor.sessions.one.state,'verified');assert.equal(floor.occurrences.day.state,'verified');
 const result=await executeTrainingCycle({...input,continuationCheckpointFloor:floor});assert.equal(result.complete,true);assert.equal(result.programs.one.templateCode,'code');assert.equal(state.creates,1);assert.equal(state.reserves,1);
});
test('actual executor continuation preserves ambiguous pending and sends no second POST',async t=>{
 const {input,state}=await fixture(t);state.uncertain=true;await assert.rejects(executeTrainingCycle(input),/transport unknown/);
 const floor=JSON.parse(await readFile(input.journalPath,'utf8'));assert.equal(floor.sessions.one.state,'pending');assert.equal(state.creates,1);state.remoteProgram=false;
 await assert.rejects(executeTrainingCycle({...input,continuationCheckpointFloor:floor}),/Uncertain cycle creation remains blocked/);assert.equal(state.creates,1);assert.equal(state.reserves,0);
});
test('actual executor continuation reconciles confirmed pending and never repeats create',async t=>{
 const {input,state}=await fixture(t);state.uncertain=true;await assert.rejects(executeTrainingCycle(input),/transport unknown/);
 const floor=JSON.parse(await readFile(input.journalPath,'utf8'));assert.equal(floor.sessions.one.state,'pending');state.uncertain=false;
 const result=await executeTrainingCycle({...input,continuationCheckpointFloor:floor});assert.equal(result.complete,true);assert.equal(state.creates,1);assert.equal(state.reserves,1);
});
for(const changed of ['missing','verified-program-reset','verified-reservation-reset','pending-reset','pending-baseline'])test(`actual executor rejects continuation checkpoint regression ${changed}`,async t=>{
 const {input,state}=await fixture(t);if(changed.startsWith('pending')){state.uncertain=true;await assert.rejects(executeTrainingCycle(input));}else await executeTrainingCycle(input);
 const floor=JSON.parse(await readFile(input.journalPath,'utf8')),current=structuredClone(floor);const writes=state.creates,reservations=state.reserves;
 if(changed==='missing'){await rm(input.journalPath);}else{if(changed==='verified-program-reset'||changed==='pending-reset')current.sessions.one.state='new';if(changed==='verified-reservation-reset')current.occurrences.day.state='new';if(changed==='pending-baseline')current.sessions.one.baselineCodes=['different'];await writeFile(input.journalPath,JSON.stringify(current));}
 await assert.rejects(executeTrainingCycle({...input,continuationCheckpointFloor:floor}));assert.equal(state.creates,writes);assert.equal(state.reserves,reservations);
});
test('actual executor continuation still requires current science before reused checkpoint success',async t=>{
 const {input,state}=await fixture(t);await executeTrainingCycle(input);const floor=JSON.parse(await readFile(input.journalPath,'utf8'));state.fresh=false;
 await assert.rejects(executeTrainingCycle({...input,continuationCheckpointFloor:floor}),/expired science/);assert.equal(state.creates,1);assert.equal(state.reserves,1);
});
