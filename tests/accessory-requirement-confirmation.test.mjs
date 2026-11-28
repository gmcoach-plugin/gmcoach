import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAccessoryConfirmations, inspectAccessoryDeclarationCatalogue, createAccessoryConfirmationChallenges, createAccessoryConfirmationStorage, forgetAccessoryConfirmation, normalizeAccessoryConfirmationStore, readAccessoryConfirmationFile } from '../plugin/accessory-requirement-confirmation.mjs';
import { mkdtemp, readFile, writeFile, rename, unlink, readdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const scope = { profile: 'synthetic', accountFingerprint: 'a'.repeat(64), deviceType: 1, groupId: 101, actionLibraryId: 201, rawRequirementDigest: 'b'.repeat(64) };
function fixture() { let at = 1000, counter = 0; return { service: createAccessoryConfirmationChallenges({ now: () => at, randomId: () => (++counter).toString(16).padStart(48, '0') }), advance: ms => { at += ms; } }; }
function declaration(challengeId, requiredAccessoryIds = []) { return { challengeId, requiredAccessoryIds, complete: true, confirm: true, rationale: 'Explicit complete user declaration' }; }
test('internal challenge supports explicit empty requirements without detected ownership and expires record exactly', () => {
  const { service, advance } = fixture(); const challenge = service.prepare(scope, [1,2]);
  assert.equal(challenge.detectedOwnership, false);
  assert.equal(challenge.expiresAt - challenge.createdAt, 900000);
  const result = service.confirm(null, declaration(challenge.challengeId), scope, [2,1]);
  assert.deepEqual(result.confirmation.requiredAccessoryIds, []);
  assert.equal(result.confirmation.source, 'user-confirmed-complete');
  assert.throws(() => service.confirm(null, declaration(challenge.challengeId), scope, [1,2]), /missing or expired/);
  assert.equal(activeAccessoryConfirmations(result.record, 1000 + 30 * 86400000 - 1).records.length, 1);
  assert.equal(activeAccessoryConfirmations(result.record, 1000 + 30 * 86400000).records.length, 0);
  assert.equal(forgetAccessoryConfirmation(result.record, result.confirmation.id).removed, true);
  advance(900000); assert.throws(() => service.confirm(null, declaration(challenge.challengeId), scope, [1,2]));
});
test('confirmation rejects missing human authorization, changed exact scope, unknown IDs and valid requirement contradictions', () => {
  for (const mutation of [{ confirm: false }, { complete: false }, { requiredAccessoryIds: [9] }, { requiredAccessoryIds: [1,1] }, { rationale: '' }, { extra: true }]) {
    const { service } = fixture(); const challenge = service.prepare(scope, [1,2], [1]);
    assert.throws(() => service.confirm(null, { ...declaration(challenge.challengeId, [1]), ...mutation }, scope, [1,2], [1]));
  }
  for (const mutation of [{ profile: 'other' }, { accountFingerprint: 'c'.repeat(64) }, { deviceType: 2 }, { groupId: 102 }, { actionLibraryId: 202 }, { rawRequirementDigest: 'c'.repeat(64) }]) {
    const { service } = fixture(); const challenge = service.prepare(scope, [1]);
    assert.throws(() => service.confirm(null, declaration(challenge.challengeId), { ...scope, ...mutation }, [1]));
  }
  const { service } = fixture(); const challenge = service.prepare(scope, [1], [1]);
  assert.throws(() => service.confirm(null, declaration(challenge.challengeId), scope, [1], [1]), /contradicts/);
});
test('challenge boundary and malformed persistence remain strict', () => {
  const { service, advance } = fixture(); const challenge = service.prepare(scope, [1]);
  advance(900000); assert.throws(() => service.confirm(null, declaration(challenge.challengeId), scope, [1]), /expired/);
  assert.throws(() => normalizeAccessoryConfirmationStore({ schemaVersion: 1, records: Array(1) }));
  const sparse = Array(1); sparse.extra = 1;
  assert.throws(() => normalizeAccessoryConfirmationStore({ schemaVersion: 1, records: sparse }));
  assert.throws(() => service.prepare(scope, sparse));
  const second = fixture(); const next = second.service.prepare(scope, [1]);
  const result = second.service.confirm(null, declaration(next.challengeId, [1]), scope, [1]);
  assert.throws(() => normalizeAccessoryConfirmationStore({ ...result.record, records: [result.confirmation, result.confirmation] }), /identity/);
  assert.throws(() => normalizeAccessoryConfirmationStore({ ...result.record, records: [{ ...result.confirmation, expiresAt: result.confirmation.expiresAt + 1 }] }), /lifetime/);
});

test('actual host atomic writer rollback preserves persisted confirmation and removes temporary and lock files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'accessory-confirm-store-'));
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function writeTrainingProfileAtomically('), end = source.indexOf('const emailPlaceholders', start);
  let failRename = false;
  const actualWriter = new Function('randomBytes', 'writeFile', 'rename', 'unlink', `${source.slice(start,end)};return writeTrainingProfileAtomically;`)(randomBytes, writeFile, async (...args) => { if (failRename) throw new Error('synthetic rename failure'); return rename(...args); }, unlink);
  const storage = createAccessoryConfirmationStorage({ profilePaths: profile => ({ profile, dir: path.join(directory, profile) }), assertSafeProfileStorage: async () => {}, withProfileMutationLock: (_profile, callback) => callback(), writeTrainingProfileAtomically: actualWriter });
  try {
    const { service } = fixture(); const challenge = service.prepare(scope, [1]);
    const confirmed = await storage.mutate('synthetic', current => service.confirm(current, declaration(challenge.challengeId, [1]), scope, [1]));
    assert.equal((await storage.read('synthetic')).records[0].id, confirmed.confirmation.id);
    assert.deepEqual((await storage.read('other')).records, []);
    failRename = true;
    await assert.rejects(storage.mutate('synthetic', current => forgetAccessoryConfirmation(current, confirmed.confirmation.id)), /rename failure/);
    assert.equal((await storage.read('synthetic')).records[0].id, confirmed.confirmation.id);
    assert.deepEqual(await readdir(path.join(directory, 'synthetic')), ['accessory-requirement-confirmations.json']);
    failRename = false;
    await storage.mutate('synthetic', current => forgetAccessoryConfirmation(current, confirmed.confirmation.id));
    assert.deepEqual((await storage.read('synthetic')).records, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bounded filehandle reader rejects replacement growth and short reads and closes handle', async () => {
  const text = JSON.stringify({ schemaVersion: 1, records: [] }), bytes = Buffer.from(text);
  const stat = { dev: 1, ino: 2, size: bytes.length, mtimeMs: 3, ctimeMs: 4, isFile: () => true, isSymbolicLink: () => false };
  for (const mode of ['positive', 'replaced-before', 'replaced-after', 'growth', 'short']) {
    let pathCalls = 0, statCalls = 0, reads = 0, closed = false;
    const services = {
      lstat: async () => { pathCalls++; return mode === 'replaced-after' && pathCalls > 1 ? { ...stat, ino: 9 } : stat; },
      open: async () => ({ stat: async () => { statCalls++; return mode === 'replaced-before' ? { ...stat, ino: 9 } : mode === 'growth' && statCalls > 1 ? { ...stat, size: stat.size + 1 } : stat; },
        read: async buffer => { if (reads++) return { bytesRead: 0 }; const count = mode === 'short' ? bytes.length - 1 : bytes.length; bytes.copy(buffer, 0, 0, count); return { bytesRead: count }; }, close: async () => { closed = true; } })
    };
    if (mode === 'positive') assert.deepEqual(await readAccessoryConfirmationFile('synthetic', services), { schemaVersion: 1, records: [] });
    else await assert.rejects(readAccessoryConfirmationFile('synthetic', services), /replaced|changed/);
    assert.equal(closed, true);
  }
});

test('missing after initial file observation never becomes a new empty store', async () => {
  const stat = { dev: 1, ino: 2, size: 0, mtimeMs: 3, ctimeMs: 4, isFile: () => true, isSymbolicLink: () => false };
  const gone = () => Object.assign(new Error('synthetic disappeared'), { code: 'ENOENT' });
  for (const stage of ['open', 'final-path']) {
    let calls = 0, closed = false;
    const services = { lstat: async () => { if (calls++ && stage === 'final-path') throw gone(); return stat; },
      open: async () => { if (stage === 'open') throw gone(); return { stat: async () => stat, read: async () => ({ bytesRead: 0 }), close: async () => { closed = true; } }; } };
    await assert.rejects(readAccessoryConfirmationFile('synthetic', services), { code: 'GM_COACH_ACCESSORY_STORE_CHANGED' });
    assert.equal(closed, stage === 'final-path');
  }
});


test('observed catalogue qualifies independent IDs and binds complete raw snapshot',()=>{
 const raw={code:0,data:[{id:1,name:'Handle'},{id:2,name:''},{id:3,name:'A'},{id:3,name:'A'},{id:4,name:'Four',accessoryId:5},{id:null,name:'Unknown'}]};
 const e=inspectAccessoryDeclarationCatalogue(raw);assert.deepEqual(e.accessories,[{id:1,name:'Handle'}]);assert.deepEqual(e.evidence.reasons,{invalidId:1,invalidName:1,duplicateId:1,conflictingAlias:1});
 const {service}=fixture(),c=service.prepare(scope,[1],[],e.evidence);
 assert.throws(()=>service.confirm(null,declaration(c.challengeId,[2]),scope,[1],[],e.evidence),/contradicts/);
 assert.deepEqual(service.confirm(null,declaration(c.challengeId,[]),scope,[1],[],e.evidence).confirmation.requiredAccessoryIds,[]);
 assert.throws(()=>inspectAccessoryDeclarationCatalogue({data:Array.from({length:4097},(_,i)=>({id:i+1,name:'A'}))}),/oversized/);
 const getter={};Object.defineProperty(getter,'data',{enumerable:true,get(){throw Error('MUST_NOT_RUN');}});assert.throws(()=>inspectAccessoryDeclarationCatalogue(getter),/accessors/);
 assert.throws(()=>inspectAccessoryDeclarationCatalogue({data:[,]}),/dense/);
});


test('malformed primary or conflicting secondary identity cannot certify an independent alias ID',()=>{
 for(const bad of [{id:null,accessoryId:1,name:'Broken'},{id:2,accessoryId:1,name:'Conflict'}]){
  const e=inspectAccessoryDeclarationCatalogue({data:[{id:1,name:'Handle'},bad]});assert.equal(e.accessories.some(x=>x.id===1),false);
 }
});


test('catalogue budgets huge values, keys and cumulative escaped UTF8 before snapshot encoding',()=>{
 const ok={data:[{id:1,name:'Handle'}],metadata:['ASCII','\u00e9','\ud83d\ude00','\ud800','\u0001','"','\\']};
 assert.deepEqual(inspectAccessoryDeclarationCatalogue(ok).accessories,[{id:1,name:'Handle'}]);
 for(const raw of [
  {data:[],note:'x'.repeat(1_000_001)},
  {data:[],['x'.repeat(1_000_001)]:0},
  {data:[],notes:Array.from({length:2000},()=> 'x'.repeat(600))},
  {data:[],notes:Array.from({length:2000},()=> '\u0001'.repeat(100))},
  {data:[],notes:Array.from({length:2000},()=> '\u0800'.repeat(200))},
  {data:[],notes:Array.from({length:2000},()=> '\ud800'.repeat(100))}
 ])assert.throws(()=>inspectAccessoryDeclarationCatalogue(raw),/byte bound/);
});

test('catalogue entry bounds precede descriptor traversal and retain dense evidence guards',()=>{
 const excessive=Array(50_001);Object.defineProperty(excessive,'0',{enumerable:true,get(){throw Error('MUST_NOT_RUN');}});
 assert.throws(()=>inspectAccessoryDeclarationCatalogue({data:[],extra:excessive}),/entry bound/);
 const excessiveObject=Object.fromEntries(Array.from({length:50_001},(_,i)=>['k'+i,0]));
 assert.throws(()=>inspectAccessoryDeclarationCatalogue({data:[],extra:excessiveObject}),/entry bound/);
});
