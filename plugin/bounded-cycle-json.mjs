import { createHash } from 'node:crypto';
/** Exact JSON hash without constructing one aggregate JSON string. Rejects
 * oversized/deep/cyclic structures before further digest work. */
export function boundedCycleDigest(value, maxBytes = 64_000_000) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid digest byte budget.');
  const hash = createHash('sha256'), ancestors = new Set(); let bytes = 0;
  function emit(text) { bytes += Buffer.byteLength(text); if (bytes > maxBytes) throw new Error('Cycle derived facts exceed byte budget.'); hash.update(text); }
  function visit(item, depth = 0) {
    if (depth > 100) throw new Error('Cycle JSON nesting exceeded.');
    if (item && typeof item.toJSON === 'function') item = item.toJSON();
    if (item === null || typeof item !== 'object') { const text = JSON.stringify(item); if (text === undefined) throw new Error('Unsupported top-level JSON value.'); emit(text); return; }
    if (ancestors.has(item)) throw new Error('Cyclic cycle JSON.'); ancestors.add(item);
    if (Array.isArray(item)) { emit('['); for (let index = 0; index < item.length; index++) { if (index) emit(','); visit(item[index] === undefined || typeof item[index] === 'function' || typeof item[index] === 'symbol' ? null : item[index], depth + 1); } emit(']'); }
    else { emit('{'); let first = true; for (const key of Object.keys(item)) { const entry = item[key]; if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') continue; if (!first) emit(','); first = false; emit(JSON.stringify(key)); emit(':'); visit(entry, depth + 1); } emit('}'); }
    ancestors.delete(item);
  }
  visit(value); return hash.digest('hex');
}
