import { createHash, randomBytes } from 'node:crypto';
import { withCoachingMemoryFileLock } from './coaching-memory-lock.mjs';
import { lstat, open, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const CHALLENGE_MS = 15 * 60_000, RECORD_MS = 30 * 86_400_000, MAX_RECORDS = 200;
const scopeKeys = ['profile', 'accountFingerprint', 'deviceType', 'groupId', 'actionLibraryId', 'rawRequirementDigest'];
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid accessory confirmation fields.');
}
function clock(now) { if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - RECORD_MS) throw new Error('Invalid accessory confirmation clock.'); return now; }
function identifier(value) { return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value); }
function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function denseArray(values, limit) {
  if (!Array.isArray(values) || values.length > limit || Object.keys(values).length !== values.length) return false;
  for (let i = 0; i < values.length; i++) if (!Object.hasOwn(values, i)) return false;
  return true;
}
function ids(values, limit = 128) {
  if (!denseArray(values, limit) || values.some(value => !Number.isSafeInteger(value) || value <= 0) || new Set(values).size !== values.length) throw new Error('Invalid complete accessory ID list.');
  return [...values].sort((a,b) => a-b);
}
function scope(value) {
  exact(value, scopeKeys);
  if (typeof value.profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.profile) || !digest(value.accountFingerprint) || value.deviceType !== 1 || !Number.isSafeInteger(value.groupId) || value.groupId <= 0 || !Number.isSafeInteger(value.actionLibraryId) || value.actionLibraryId <= 0 || !digest(value.rawRequirementDigest)) throw new Error('Invalid exact accessory scope.');
  return Object.fromEntries(scopeKeys.map(key => [key, value[key]]));
}
function sameScope(a, b) { return JSON.stringify(scope(a)) === JSON.stringify(scope(b)); }
function boundedRationale(value) { if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Explicit accessory confirmation rationale required.'); return value.trim(); }
export function normalizeAccessoryConfirmationStore(value) {
  if (value === null || value === undefined) return { schemaVersion: 1, records: [] };
  exact(value, ['schemaVersion', 'records']);
  if (value.schemaVersion !== 1 || !denseArray(value.records, MAX_RECORDS)) throw new Error('Invalid accessory confirmation store.');
  const seen = new Set(), scopes = new Set();
  return { schemaVersion: 1, records: value.records.map(record => {
    exact(record, ['id', 'scope', 'requiredAccessoryIds', 'complete', 'source', 'rationale', 'createdAt', 'expiresAt']);
    if (!identifier(record.id) || seen.has(record.id) || record.complete !== true || record.source !== 'user-confirmed-complete') throw new Error('Invalid accessory confirmation identity/source.');
    clock(record.createdAt); clock(record.expiresAt);
    if (record.expiresAt - record.createdAt !== RECORD_MS) throw new Error('Invalid accessory confirmation lifetime.');
    const normalizedScope = scope(record.scope), key = JSON.stringify(normalizedScope);
    if (scopes.has(key)) throw new Error('Duplicate accessory confirmation scope.');
    seen.add(record.id); scopes.add(key);
    return { id: record.id, scope: normalizedScope, requiredAccessoryIds: ids(record.requiredAccessoryIds), complete: true, source: record.source, rationale: boundedRationale(record.rationale), createdAt: record.createdAt, expiresAt: record.expiresAt };
  }) };
}
export function activeAccessoryConfirmations(value, now = Date.now()) {
  clock(now);
  const records = normalizeAccessoryConfirmationStore(value).records.filter(record => record.createdAt <= now && record.expiresAt > now).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { records, digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'), nextExpiresAt: records.reduce((next, row) => Math.min(next, row.expiresAt), Infinity), userConfirmedOnly: true };
}
export function forgetAccessoryConfirmation(value, id) {
  if (!identifier(id)) throw new Error('Invalid accessory confirmation ID.');
  const normalized = normalizeAccessoryConfirmationStore(value);
  return { record: { schemaVersion: 1, records: normalized.records.filter(row => row.id !== id) }, removed: normalized.records.some(row => row.id === id) };
}


// Bounded observed identities for an explicit human declaration, not ownership.
export function inspectAccessoryDeclarationCatalogue(response) {
  const MAX_BYTES=1_000_000,MAX_ENTRIES=50_000;
  let nodes=0,remainingBytes=MAX_BYTES;const active=new Set();
  function reserve(bytes){if(bytes>remainingBytes)throw Error('Accessory catalogue byte bound exceeded.');remainingBytes-=bytes;}
  // Count escaped JSON UTF-8 bytes without allocating a JSON string or clone.
  // A string's UTF-16 length is a lower bound, including lone surrogates.
  function reserveString(value){
    if(value.length+2>remainingBytes)throw Error('Accessory catalogue byte bound exceeded.');
    reserve(2);
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);
      if(c===34||c===92||c===8||c===9||c===10||c===12||c===13)reserve(2);
      else if(c<32)reserve(6);
      else if(c<128)reserve(1);
      else if(c<2048)reserve(2);
      else if(c>=0xd800&&c<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){reserve(4);i++;}
      else if(c>=0xd800&&c<=0xdfff)reserve(6);
      else reserve(3);
    }
  }
  function copy(v,depth=0){
    if(++nodes>50000||depth>12)throw Error('Accessory catalogue resource bound exceeded.');
    if(typeof v==='string'){reserveString(v);return v;}
    if(v===null){reserve(4);return v;}
    if(typeof v==='boolean'){reserve(v?4:5);return v;}
    // 25 bytes conservatively covers any finite JSON number spelling.
    if(typeof v==='number'&&Number.isFinite(v)){reserve(25);return v;}
    if(!v||typeof v!=='object'||active.has(v)||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(v)))throw Error('Accessory catalogue requires plain JSON evidence.');
    const array=Array.isArray(v);
    if(array&&v.length>MAX_ENTRIES)throw Error('Accessory catalogue entry bound exceeded.');
    // Reflect provides descriptors without invoking getters. Check cardinality
    // before filter/sort/clone allocations; JS provides no bounded ownKeys API.
    const ownKeys=Reflect.ownKeys(v);
    if(ownKeys.length>MAX_ENTRIES+(array?1:0))throw Error('Accessory catalogue entry bound exceeded.');
    const keys=ownKeys.filter(k=>!(array&&k==='length'));
    if(keys.some(k=>typeof k!=='string')||array&&(keys.length!==v.length||keys.some((k,i)=>k!==String(i))))throw Error('Accessory catalogue requires dense JSON evidence.');
    reserve(2+Math.max(0,keys.length-1));
    // Budget every key before sorting or allocating the output container.
    if(!array)for(const k of keys){reserveString(k);reserve(1);}
    active.add(v);const out=array?[]:{};
    for(const k of (array?keys:keys.sort())){const d=Object.getOwnPropertyDescriptor(v,k);if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error('Accessory catalogue rejects accessors.');Object.defineProperty(out,k,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}
    active.delete(v);return out;
  }
  const snapshot=copy(response);const encoded=JSON.stringify(snapshot);
  if(Buffer.byteLength(encoded,'utf8')>1000000)throw Error('Accessory catalogue byte bound exceeded.');
  if(!snapshot||!Array.isArray(snapshot.data))throw Error('Accessory catalogue data array unavailable.');
  if(snapshot.data.length>4096)throw Error('Accessory catalogue oversized: maximum4096 rows.');
  const tainted=new Set(),byId=new Map(),reasons={invalidId:0,invalidName:0,duplicateId:0,conflictingAlias:0};
  const numberId=v=>(typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v.trim()))&&Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
  for(const row of snapshot.data){
    if(!row||typeof row!=='object'||Array.isArray(row)){reasons.invalidId++;continue;}
    const id=numberId(row.id);if(id===null){reasons.invalidId++;for(const key of ['accessoryId','accessory_id','value']){const claimed=numberId(row[key]);if(claimed!==null)tainted.add(claimed);}continue;}
    const aliases=['accessoryId','accessory_id','value'].filter(k=>Object.hasOwn(row,k));
    const aliasBad=aliases.some(k=>numberId(row[k])!==id);
    const nameValid=typeof row.name==='string'&&Boolean(row.name.trim())&&row.name.length<=200&&!/[\u0000-\u001f\u007f]/.test(row.name);
    if(aliasBad){reasons.conflictingAlias++;tainted.add(id);for(const k of aliases){const claimed=numberId(row[k]);if(claimed!==null)tainted.add(claimed);}}if(!nameValid)reasons.invalidName++;
    const previous=byId.get(id);if(previous){previous.qualified=false;reasons.duplicateId++;continue;}
    byId.set(id,{id,name:nameValid?row.name.trim():null,qualified:nameValid&&!aliasBad});
  }
  const accessories=[...byId.values()].filter(x=>x.qualified&&!tainted.has(x.id)).sort((a,b)=>a.id-b.id).map(({id,name})=>({id,name}));
  return {accessories,evidence:{version:1,snapshotDigest:createHash('sha256').update(encoded).digest('hex'),status:Object.values(reasons).some(Boolean)?'partial':'observed-valid',observedRows:snapshot.data.length,qualifiedIds:accessories.map(x=>x.id),reasons,upstreamUniverseStatus:'unknown',source:'returned-accessory-catalogue'}};
}
function declarationEvidence(value) {
  if(value===undefined)return null;
  const copy=JSON.parse(JSON.stringify(value));
  exact(copy,['version','snapshotDigest','status','observedRows','qualifiedIds','reasons','upstreamUniverseStatus','source']);
  if(copy.version!==1||!digest(copy.snapshotDigest)||!['partial','observed-valid'].includes(copy.status)||!Number.isSafeInteger(copy.observedRows)||copy.observedRows<0||copy.observedRows>4096||copy.upstreamUniverseStatus!=='unknown'||copy.source!=='returned-accessory-catalogue')throw Error('Invalid accessory catalogue evidence.');
  copy.qualifiedIds=ids(copy.qualifiedIds,4096);exact(copy.reasons,['invalidId','invalidName','duplicateId','conflictingAlias']);
  if(Object.values(copy.reasons).some(v=>!Number.isSafeInteger(v)||v<0||v>4096))throw Error('Invalid accessory catalogue diagnostics.');
  return copy;
}

// Internal only: caller supplies trusted fresh scope/catalog, never public raw args.
export function createAccessoryConfirmationChallenges({ now = Date.now, randomId = () => randomBytes(24).toString('hex') } = {}) {
  const challenges = new Map();
  return {
    prepare(trustedScope, trustedCatalogIds, reportedValidIds = [], catalogueEvidence) {
      const at = clock(now()), normalizedScope = scope(trustedScope), availableIds = ids(trustedCatalogIds, 4096), validIds = ids(reportedValidIds);
      for (const [id, row] of challenges) if (row.expiresAt <= at) challenges.delete(id);
      if (challenges.size >= MAX_RECORDS) throw new Error('Accessory challenge limit reached.');
      const id = randomId(); if (!identifier(id) || challenges.has(id)) throw new Error('Invalid accessory challenge ID.');
      const evidence = declarationEvidence(catalogueEvidence);
      if(evidence && JSON.stringify(evidence.qualifiedIds)!==JSON.stringify(availableIds))throw Error('Accessory catalogue identity evidence differs.');
      const row = { id, scope: normalizedScope, availableIds, validIds, evidence, createdAt: at, expiresAt: at + CHALLENGE_MS };
      challenges.set(id, row);
      return { challengeId: id, scope: { ...normalizedScope }, availableAccessoryIds: [...availableIds], createdAt: at, expiresAt: row.expiresAt, detectedOwnership: false, ...(evidence ? { catalogueEvidence:evidence, declarationScope:'explicit-human-complete-list; empty-only-if-no-reported-valid-ids' } : {}) };
    },
    confirm(value, input, freshTrustedScope, freshCatalogIds, freshReportedValidIds = [], freshCatalogueEvidence) {
      exact(input, ['challengeId', 'requiredAccessoryIds', 'complete', 'confirm', 'rationale']);
      const at = clock(now()), challenge = challenges.get(input.challengeId);
      if (!challenge || challenge.expiresAt <= at || challenge.createdAt > at) throw new Error('Accessory challenge missing or expired.');
      if (input.complete !== true || input.confirm !== true) throw new Error('Explicit complete accessory confirmation required.');
      if (!sameScope(challenge.scope, freshTrustedScope)) throw new Error('Accessory scope changed.');
      const catalog = ids(freshCatalogIds, 4096), valid = ids(freshReportedValidIds), required = ids(input.requiredAccessoryIds);
      const evidence=declarationEvidence(freshCatalogueEvidence);
      if(JSON.stringify(evidence)!==JSON.stringify(challenge.evidence) || evidence && JSON.stringify(evidence.qualifiedIds)!==JSON.stringify(catalog))throw Error('Accessory catalogue snapshot evidence changed.');
      if (JSON.stringify(catalog) !== JSON.stringify(challenge.availableIds) || JSON.stringify(valid) !== JSON.stringify(challenge.validIds)) throw new Error('Accessory catalogue evidence changed.');
      if (required.some(id => !catalog.includes(id)) || valid.some(id => !required.includes(id))) throw new Error('Accessory declaration contradicts available or reported requirements.');
      const rationale = boundedRationale(input.rationale), active = activeAccessoryConfirmations(value, at).records.filter(row => !sameScope(row.scope, challenge.scope));
      if (active.length >= MAX_RECORDS) throw new Error('Accessory confirmation limit reached.');
      const id = randomId(); if (!identifier(id) || active.some(row => row.id === id)) throw new Error('Invalid accessory confirmation ID.');
      const confirmed = { id, scope: { ...challenge.scope }, requiredAccessoryIds: required, complete: true, source: 'user-confirmed-complete', rationale, createdAt: at, expiresAt: at + RECORD_MS };
      // Consumed before persistence: a failed disk write requires a fresh challenge.
      challenges.delete(input.challengeId);
      return { record: { schemaVersion: 1, records: [...active, confirmed] }, confirmation: confirmed };
    }
  };
}
// Existing host supplies safe profile storage + atomic write callbacks.
export async function mutateAccessoryConfirmationStore({ file, assertSafe, read, writeAtomically, mutate }) {
  if (![assertSafe, read, writeAtomically, mutate].every(fn => typeof fn === 'function')) throw new Error('Invalid accessory store services.');
  await assertSafe();
  return withCoachingMemoryFileLock(file, async () => {
    await assertSafe();
    const current = normalizeAccessoryConfirmationStore(await read());
    const result = await mutate(current);
    const normalized = normalizeAccessoryConfirmationStore(result.record);
    await assertSafe(); await writeAtomically(normalized);
    return { ...result, record: normalized };
  });
}

export async function readAccessoryConfirmationFile(file, services = { lstat, open }) {
  const before = await services.lstat(file);
  const safe = stat => stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_000_000;
  const same = (a,b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
  if (!safe(before)) throw new Error('Unsafe accessory confirmation storage.');
  let handle;
  try {
    handle = await services.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const initial = await handle.stat();
    if (!safe(initial) || !same(before, initial)) throw new Error('Accessory confirmation file replaced before read.');
    const buffer = Buffer.alloc(1_000_001); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length - length) throw new Error('Invalid accessory confirmation read length.');
      if (!bytesRead) break;
      length += bytesRead;
    }
    const final = await handle.stat(), pathStat = await services.lstat(file);
    if (length > 1_000_000 || length !== initial.size || !safe(final) || !safe(pathStat) || !same(initial, final) || !same(final, pathStat)) throw new Error('Accessory confirmation file changed during read.');
    return normalizeAccessoryConfirmationStore(JSON.parse(buffer.subarray(0, length).toString('utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const changed = new Error('Accessory confirmation file disappeared during read.');
      changed.code = 'GM_COACH_ACCESSORY_STORE_CHANGED'; throw changed;
    }
    throw error;
  } finally { if (handle) await handle.close(); }
}

export function createAccessoryConfirmationStorage({ profilePaths, assertSafeProfileStorage, withProfileMutationLock, writeTrainingProfileAtomically }) {
  if (![profilePaths, assertSafeProfileStorage, withProfileMutationLock, writeTrainingProfileAtomically].every(fn => typeof fn === 'function')) throw new Error('Invalid accessory host storage services.');
  function locations(profile) {
    const paths = profilePaths(profile);
    if (typeof paths?.dir !== 'string' || !path.isAbsolute(paths.dir) || paths.profile !== profile) throw new Error('Invalid accessory profile storage scope.');
    return { paths, file: path.join(paths.dir, 'accessory-requirement-confirmations.json') };
  }
  async function read(profile) {
    const { paths, file } = locations(profile); await assertSafeProfileStorage(paths);
    try {
      const record = await readAccessoryConfirmationFile(file);
      if (record.records.some(row => row.scope.profile !== profile)) throw new Error('Accessory confirmation belongs to another profile.');
      return record;
    } catch (error) { if (error.code === 'ENOENT') return normalizeAccessoryConfirmationStore(null); throw error; }
  }
  return {
    read,
    mutate(profile, operation) {
      return withProfileMutationLock(profile, async () => {
        const { paths, file } = locations(profile);
        await assertSafeProfileStorage(paths); await mkdir(paths.dir, { recursive: true }); await assertSafeProfileStorage(paths);
        return mutateAccessoryConfirmationStore({ file, assertSafe: () => assertSafeProfileStorage(paths), read: () => read(profile), writeAtomically: record => {
          if (record.records.some(row => row.scope.profile !== profile)) throw new Error('Accessory confirmation belongs to another profile.');
          return writeTrainingProfileAtomically(file, record);
        }, mutate: operation });
      });
    }
  };
}
