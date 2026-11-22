import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 1_000_000;
function validateCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(code)) throw new Error('Invalid reviewed template code.');
}
function plainJson(value) {
  const active = new Set();
  let nodes = 0;
  function visit(item, depth) {
    if (++nodes > 50_000 || depth > 20) throw new Error('Reviewed record exceeds JSON bounds.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || active.has(item)) throw new Error('Reviewed record requires finite plain JSON.');
    const array = Array.isArray(item);
    const proto = Object.getPrototypeOf(item);
    if (!(array ? proto === Array.prototype : proto === Object.prototype || proto === null) || Object.getOwnPropertySymbols(item).length) throw new Error('Reviewed record requires plain JSON.');
    active.add(item);
    const keys = Object.getOwnPropertyNames(item).filter(key => !(array && key === 'length'));
    if (array && (keys.length !== item.length || keys.some((key, index) => key !== String(index)))) throw new Error('Reviewed record requires dense arrays.');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Reviewed record rejects accessors and hidden fields.');
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
}
async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function locate(directory, code, create = false) {
  validateCode(code);
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Reviewed store requires an absolute profile directory.');
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Unsafe reviewed profile directory.');
  const folder = path.join(directory, 'reviewed-plans');
  let stat = await statOrNull(folder);
  if (!stat && create) {
    try { await mkdir(folder, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    stat = await lstat(folder);
  }
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Unsafe reviewed store directory.');
  const file = path.join(folder, `${createHash('sha256').update(code).digest('hex')}.json`);
  const existing = stat ? await statOrNull(file) : null;
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Unsafe reviewed record file.');
  return { folder, file, existing };
}
export async function readReviewedPlanRecord(directory, templateCode) {
  const { file, existing } = await locate(directory, templateCode);
  if (!existing) return null;
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Reviewed record exceeds size bounds.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) throw new Error('Reviewed record exceeds size bounds.');
    let record;
    try { record = JSON.parse(buffer.subarray(0, length).toString('utf8')); } catch { throw new Error('Malformed reviewed record.'); }
    plainJson(record);
    if (!record || Array.isArray(record) || record.templateCode !== templateCode) throw new Error('Reviewed record template mismatch.');
    return record;
  } finally { await handle.close(); }
}
export async function writeReviewedPlanRecord(directory, templateCode, record) {
  validateCode(templateCode);
  plainJson(record);
  if (!record || Array.isArray(record) || record.templateCode !== templateCode) throw new Error('Reviewed record template mismatch.');
  const body = JSON.stringify(record);
  if (Buffer.byteLength(body) > MAX_BYTES) throw new Error('Reviewed record exceeds size bounds.');
  const { folder, file } = await locate(directory, templateCode, true);
  const temporary = path.join(folder, `.${randomBytes(16).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(body, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await locate(directory, templateCode);
    await rename(temporary, file);
  } finally {
    if (handle) await handle.close();
    try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function deleteReviewedPlanRecord(directory, templateCode) {
  const { file, existing } = await locate(directory, templateCode);
  if (!existing) return false;
  await unlink(file);
  return true;
}
