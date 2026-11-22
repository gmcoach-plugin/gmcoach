import { randomBytes } from 'node:crypto';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

async function owner(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Unsafe coaching memory lock.');
  const value = JSON.parse(await readFile(file, 'utf8'));
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0 || !/^[a-f0-9]{32}$/.test(value.token ?? '')) throw new Error('Unknown coaching memory lock owner.');
  return value;
}
/** Exclusive whole read-modify-write ownership. Age never authorizes recovery. */
export async function withCoachingMemoryFileLock(file, operation) {
  if (!path.isAbsolute(file) || typeof operation !== 'function') throw new Error('Invalid coaching memory lock scope.');
  const directory = await lstat(path.dirname(file));
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Unsafe coaching memory directory.');
  const lockPath = `${file}.lock`, recoveryPath = `${lockPath}.recovery`;
  const identity = { pid: process.pid, token: randomBytes(16).toString('hex') };
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let recovery;
    try { recovery = await open(recoveryPath, 'wx', 0o600); }
    catch { throw new Error('Coaching memory recovery is owned or unresolved.'); }
    try {
      await recovery.writeFile(JSON.stringify(identity)); await recovery.sync();
      const previous = await owner(lockPath);
      let dead = false;
      try { process.kill(previous.pid, 0); } catch (status) { dead = status.code === 'ESRCH'; }
      if (!dead) throw new Error('Coaching memory lock owner is live or unconfirmed; retry after completion.');
      const current = await owner(lockPath);
      if (current.pid !== previous.pid || current.token !== previous.token) throw new Error('Coaching memory lock owner changed.');
      await unlink(lockPath);
      lock = await open(lockPath, 'wx', 0o600);
    } finally { await recovery.close(); await unlink(recoveryPath); }
  }
  try { await lock.writeFile(JSON.stringify(identity)); await lock.sync(); }
  catch (error) { await lock.close().catch(() => {}); throw error; /* Orphan blocks, never infer ownership from age. */ }
  let result, failure;
  try { result = await operation(); } catch (error) { failure = error; }
  let cleanup;
  try {
    await lock.close();
    const current = await owner(lockPath);
    if (current.pid !== identity.pid || current.token !== identity.token) throw new Error('Coaching memory lock ownership changed during cleanup.');
    await unlink(lockPath);
  } catch (error) { cleanup = error; }
  if (failure) throw failure;
  if (cleanup) {
    const error = new Error('Coaching memory operation completed, but local lock cleanup failed; its result must not be replayed automatically.');
    error.code = 'GM_COACH_MEMORY_LOCK_CLEANUP'; error.operationCompleted = true; error.cause = cleanup;
    throw error;
  }
  return result;
}
