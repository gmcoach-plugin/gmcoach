import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const queues = new Map();
const maxBytes = 1_000_000;
async function locked(file, operation) {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  queues.set(file, next.catch(() => {}));
  try { return await next; } finally { /* Keep settled queue to serialize followers. */ }
}
async function safe(file) {
  if (!path.isAbsolute(file)) throw new Error('Cycle journal requires absolute profile path.');
  const directory = await lstat(path.dirname(file));
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Unsafe cycle profile directory.');
  try { const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error('Unsafe cycle journal.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function read(file) {
  await safe(file);
  let observed;
  try { observed = await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!observed.isFile() || observed.isSymbolicLink() || observed.size > maxBytes) throw new Error('Unsafe cycle journal.');
  let handle;
  try { handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid cycle journal size.');
    if (stat.dev !== observed.dev || stat.ino !== observed.ino) throw new Error('Cycle journal identity changed.');
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (offset > maxBytes || offset !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.dev !== stat.dev || after.ino !== stat.ino) throw new Error('Cycle journal changed during read.');
    return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
  } finally { await handle.close(); }
}
async function save(file, record) {
  await safe(file);
  const data = JSON.stringify(record);
  if (Buffer.byteLength(data) > maxBytes) throw new Error('Cycle journal too large.');
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(data, 'utf8'); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, file); } finally { try { await unlink(temp); } catch { /* renamed or preserved pending */ } }
}
function validate(record, identity, sessions, occurrences) {
  if (record?.version !== 1 || record.identity !== identity || !record.sessions || !record.occurrences || Object.keys(record.sessions).length !== sessions.length || Object.keys(record.occurrences).length !== occurrences.length) throw new Error('Cycle journal identity/schema mismatch.');
  for (const session of sessions) {
    const entry = record.sessions[session.sessionId];
    if (!entry || !['new', 'preparing', 'pending', 'verified'].includes(entry.state) || entry.executionDigest !== session.executionDigest || (entry.state === 'verified' && !/^[A-Za-z0-9._-]{1,128}$/.test(entry.templateCode ?? ''))) throw new Error('Invalid cycle session checkpoint.');
  }
  for (const row of occurrences) if (!['new', 'preparing', 'pending', 'verified'].includes(record.occurrences[row.occurrenceId]?.state)) throw new Error('Invalid occurrence checkpoint.');
}
/** Production orchestrator. Callbacks must perform real science/context checks,
 * remote mutations and readback; none of their success is inferred here. */
export async function executeTrainingCycle({ journalPath, accountFingerprint, prescriptionDigest, sessions, occurrences, continuationCheckpointFloor = null, adoptableJournals = null,
  revalidate, checkCalendar, createSession, reconcileSession, verifySession, reserve, verifyReservation, isRequestNotSent = () => false }) {
  if (!/^[a-f0-9]{64}$/.test(accountFingerprint ?? '') || !/^[a-f0-9]{64}$/.test(prescriptionDigest ?? '') || !Array.isArray(sessions) || !sessions.length || sessions.length > 364 || !Array.isArray(occurrences) || !occurrences.length || occurrences.length > 364) throw new Error('Invalid cycle execution identity.');
  for (const fn of [revalidate, checkCalendar, createSession, reconcileSession, verifySession, reserve, verifyReservation]) if (typeof fn !== 'function') throw new Error('Missing cycle execution capability.');
  if (new Set(sessions.map(row => row.sessionId)).size !== sessions.length || new Set(occurrences.map(row => row.occurrenceId)).size !== occurrences.length) throw new Error('Duplicate cycle operation identities.');
  const sessionIds = new Set(sessions.map(row => row.sessionId));
  const referencedIds = new Set(occurrences.map(row => row.sessionId));
  if (sessions.length > occurrences.length || referencedIds.size !== sessionIds.size || [...referencedIds].some(id => !sessionIds.has(id))) throw new Error('Every cycle definition requires a matching occurrence.');
  const identity = hash({ accountFingerprint, prescriptionDigest, sessions: sessions.map(({ sessionId, executionDigest }) => ({ sessionId, executionDigest })), occurrences });
  return locked(journalPath, async () => {
    const lockPath = `${journalPath}.lock`;
    await safe(journalPath);
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const recoveryPath = `${lockPath}.recovery`;
      let recovery;
      try { recovery = await open(recoveryPath, 'wx', 0o600); }
      catch { throw new Error('Cycle recovery is owned or unresolved; no lock removal permitted.'); }
      try {
      await recovery.writeFile(JSON.stringify({ pid: process.pid, token: randomBytes(16).toString('hex') }), 'utf8');
      await recovery.sync();
      // Only affirmative OS evidence that the recorded process no longer exists
      // permits recovery. PID reuse blocks conservatively; age never authorizes it.
      await safe(lockPath);
      const owner = await read(lockPath);
      if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0) throw new Error('Unknown cycle lock owner; explicit local reconciliation required.');
      let dead = false;
      try { process.kill(owner.pid, 0); } catch (status) { dead = status.code === 'ESRCH'; }
      if (!dead) throw new Error('Cycle execution lock owner is live or unconfirmed; do not replay.');
      const unchanged = await read(lockPath);
      if (hash(unchanged) !== hash(owner)) throw new Error('Cycle lock changed during reconciliation.');
      await unlink(lockPath);
      lock = await open(lockPath, 'wx', 0o600);
      } finally { await recovery.close(); await unlink(recoveryPath); }
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, token: randomBytes(16).toString('hex') }), 'utf8');
    await lock.sync();
    let completed;
    try {
      let record = await read(journalPath);
      if (!record && continuationCheckpointFloor !== null) throw new Error('Original continuation journal is missing; no new journal or replay permitted.');
      // Adopt an already started journal of the same cycle (same session ids, payload digests and occurrences) so a re-prepared
      // draft resumes instead of creating duplicates; a started journal with different payloads blocks.
      if (!record && continuationCheckpointFloor === null && Array.isArray(adoptableJournals)) {
        for (const other of adoptableJournals) {
          if (other === journalPath) continue;
          let old; try { old = await read(other); } catch { continue; }
          if (!old?.sessions || !old?.occurrences) continue;
          if (Object.keys(old.sessions).length !== sessions.length || !sessions.every(row => old.sessions[row.sessionId])) continue;
          const started = Object.values(old.sessions).some(entry => entry.state !== 'new') || Object.values(old.occurrences).some(entry => entry.state !== 'new');
          if (!started) continue;
          const same = sessions.every(row => old.sessions[row.sessionId].executionDigest === row.executionDigest) && Object.keys(old.occurrences).length === occurrences.length && occurrences.every(row => old.occurrences[row.occurrenceId]);
          if (!same) throw new Error('Wcześniejszy dziennik tego cyklu ma rozpoczęte sesje z innym payloadem; nowe tworzenie zablokowano, aby uniknąć duplikatów.');
          record = { ...old, identity };
          await save(journalPath, record);
          break;
        }
      }
      if (!record) {
        record = { version: 1, identity, sessions: Object.fromEntries(sessions.map(row => [row.sessionId, { state: 'new', executionDigest: row.executionDigest }])), occurrences: Object.fromEntries(occurrences.map(row => [row.occurrenceId, { state: 'new' }])) };
        await save(journalPath, record);
      }
      validate(record, identity, sessions, occurrences);
      if (continuationCheckpointFloor !== null) {
        validate(continuationCheckpointFloor, identity, sessions, occurrences);
        assertContinuationCheckpointFloor(continuationCheckpointFloor, record);
      }
      await revalidate(); await checkCalendar(record);
      for (const session of sessions) {
        const entry = record.sessions[session.sessionId];
        if (entry.state === 'pending') {
          const code = await reconcileSession(session, entry);
          if (!code || !await verifySession(session, code)) throw new Error('Uncertain cycle creation remains blocked; no POST replay.');
          entry.state = 'verified'; entry.templateCode = code; await save(journalPath, record);
        } else if (['new', 'preparing'].includes(entry.state)) {
          await checkCalendar(record); await revalidate();
          entry.state = 'preparing'; await save(journalPath, record);
          // Preserve uncertainty unless the private transport capability proves this request never reached fetch.
          let code;
          try { code = await createSession(session, async baseline => { entry.baselineCodes = baseline; await save(journalPath, record); }, async () => { entry.state = 'pending'; await save(journalPath, record); }); }
          catch (error) {
            if (isRequestNotSent(error, 'create') === true) { entry.state = 'preparing'; await save(journalPath, record); }
            throw error;
          }
          if (entry.state !== 'pending') throw new Error('Create callback omitted durable dispatch checkpoint.');
          if (!code || !await verifySession(session, code)) throw new Error('Cycle creation readback failed; no POST replay.');
          entry.templateCode = code; entry.state = 'verified'; await save(journalPath, record);
        } else if (!await verifySession(session, entry.templateCode)) throw new Error('Verified cycle program was removed or changed; do not recreate automatically.');
      }
      for (const row of occurrences) {
        const entry = record.occurrences[row.occurrenceId], code = record.sessions[row.sessionId]?.templateCode;
        if (!code) throw new Error('Cycle occurrence has no verified program.');
        if (!['new', 'preparing'].includes(entry.state)) {
          if (!await verifyReservation(row, code)) throw new Error('Pending/verified reservation missing or unavailable; no automatic resend.');
          entry.state = 'verified'; await save(journalPath, record); continue;
        }
        await checkCalendar(record); await verifySession(sessions.find(session => session.sessionId === row.sessionId), code).then(valid => { if (!valid) throw new Error('Cycle program changed before scheduling.'); });
        await revalidate(); entry.state = 'preparing'; await save(journalPath, record);
        try { await reserve(row, code, async () => { entry.state = 'pending'; await save(journalPath, record); }); }
        catch (error) {
          if (isRequestNotSent(error) === true) { entry.state = 'preparing'; await save(journalPath, record); }
          throw error;
        }
        if (entry.state !== 'pending') throw new Error('Reservation callback omitted durable dispatch checkpoint.');
        if (!await verifyReservation(row, code)) throw new Error('Cycle calendar readback failed; no automatic resend.');
        entry.state = 'verified'; await save(journalPath, record);
      }
      // Historical checkpoints never replace current account state at completion.
      await revalidate(); await checkCalendar(record);
      for (const session of sessions) if (!await verifySession(session, record.sessions[session.sessionId].templateCode)) throw new Error('Final cycle template readback failed.');
      for (const row of occurrences) if (!await verifyReservation(row, record.sessions[row.sessionId].templateCode)) throw new Error('Final cycle calendar readback failed.');
      completed = { complete: true, programs: Object.fromEntries(Object.entries(record.sessions).map(([key, entry]) => [key, { state: entry.state, executionDigest: entry.executionDigest, templateCode: entry.templateCode }])), occurrences: record.occurrences };
      return completed;
    } finally {
      try { await lock.close(); await unlink(lockPath); }
      catch { if (completed) completed.localCleanupDiagnostic = 'Verified cycle remains saved; lock cleanup failed. Do not recreate programs.'; }
    }
  });
}

/** Read only through the same bounded descriptor as the executor. Account and
 * server-derived path must be resolved by the caller; absence is never resumable. */
export async function readCycleContinuationJournal(journalPath) {
  const record = await read(journalPath);
  if (!record) throw new Error('Original continuation journal is missing.');
  return record;
}
export function assertContinuationCheckpointFloor(floor, current) {
  for (const [id, old] of Object.entries(floor.sessions)) {
    const fresh = current.sessions[id];
    if (old.state === 'verified' && (fresh.state !== 'verified' || fresh.templateCode !== old.templateCode)) throw new Error('Verified continuation program checkpoint regressed.');
    if (old.state === 'pending' && !['pending','verified'].includes(fresh.state)) throw new Error('Uncertain continuation creation checkpoint regressed.');
    if (old.state === 'pending' && JSON.stringify(fresh.baselineCodes) !== JSON.stringify(old.baselineCodes)) throw new Error('Original uncertain creation baseline changed.');
  }
  for (const [id, old] of Object.entries(floor.occurrences)) {
    const fresh = current.occurrences[id];
    if (['pending','verified'].includes(old.state) && !['pending','verified'].includes(fresh.state)) throw new Error('Continuation reservation uncertainty regressed.');
    if (old.state === 'verified' && fresh.state !== 'verified') throw new Error('Verified continuation reservation checkpoint regressed.');
  }
}
