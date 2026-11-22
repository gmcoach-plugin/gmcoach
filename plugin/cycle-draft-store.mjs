import { createHash, randomBytes } from 'node:crypto';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { mkdir, lstat, open, rename, unlink, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeCyclePreferenceReviews } from './preference-compliance.mjs';

export const DRAFT_LIMITS = Object.freeze({ request: 1_000_000, part: 1_000_000, total: 64_000_000, page: 1_000_000, parts: 1000, pages: 1000, lifetime: 86_400_000, approvalLifetime: 1_800_000 });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const token = () => randomBytes(24).toString('hex');
const idPattern = /^[a-f0-9]{48}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const partPattern = /^[A-Za-z0-9._-]{1,128}$/;
const clone = (value, limit) => {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || Buffer.byteLength(text) > limit) throw new Error('Draft byte limit exceeded.');
  return JSON.parse(text);
};
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unexpected draft fields.');
}
/** Local durable storage only. Scientific validation and account resolution are
 * mandatory integration callbacks, never conclusions inferred by this module. */
export function createCycleDraftStore({ directory, processEpoch = token(), now = Date.now, validateHeader, validatePart, presentationProjection = page => page }) {
  if (!path.isAbsolute(directory) || !partPattern.test(processEpoch) || typeof validateHeader !== 'function' || typeof validatePart !== 'function') throw new Error('Invalid draft store capabilities.');
  const queue = new Map();
  const storageAccounting = new AsyncLocalStorage();
  const grants = new WeakSet(), active = new Map(), grantSnapshots = new WeakMap();
  async function directorySafe(dir) {
    const absolute = path.resolve(dir), ancestors = [];
    for (let current = absolute; ; current = path.dirname(current)) { ancestors.push(current); if (current === path.dirname(current)) break; }
    for (const ancestor of ancestors.reverse()) {
      const stat = await lstat(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe draft directory ancestry.');
    }
  }
  // Dispatch hooks are synchronous: compare the authoritative persisted grant
  // snapshot through a bounded descriptor, including every ancestor identity.
  function authorizationSnapshot(dir) {
    for (let current = path.resolve(dir); ; current = path.dirname(current)) {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe authorization ancestry.');
      if (current === path.dirname(current)) break;
    }
    const file = path.join(dir, 'manifest.json'), before = lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > DRAFT_LIMITS.part) throw new Error('Unsafe authorization manifest.');
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const first = fstatSync(fd), buffer = Buffer.alloc(DRAFT_LIMITS.part + 1); let offset = 0;
      if (first.dev !== before.dev || first.ino !== before.ino || !first.isFile()) throw new Error('Authorization identity changed.');
      while (offset < buffer.length) { const count = readSync(fd, buffer, offset, buffer.length - offset, offset); if (!count) break; offset += count; }
      const last = fstatSync(fd);
      if (offset > DRAFT_LIMITS.part || offset !== first.size || last.size !== first.size || last.mtimeMs !== first.mtimeMs) throw new Error('Authorization manifest changed.');
      return createHash('sha256').update(buffer.subarray(0, offset)).digest('hex');
    } finally { closeSync(fd); }
  }
  async function root() { await directorySafe(path.dirname(directory)); await mkdir(directory, { recursive: false, mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; }); await directorySafe(directory); }
  function location(id) { if (!idPattern.test(id ?? '')) throw new Error('Invalid draft identity.'); return path.join(directory, id); }
  async function read(file, limit) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Unsafe draft file.');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const actual = await handle.stat();
      if (!actual.isFile() || actual.size > limit) throw new Error('Draft file limit exceeded.');
      const buffer = Buffer.alloc(actual.size + 1);
      if (actual.dev !== stat.dev || actual.ino !== stat.ino) throw new Error('Draft file identity changed.');
      let offset = 0;
      while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
      const after = await handle.stat();
      if (offset > limit || offset !== actual.size || after.size !== actual.size || after.mtimeMs !== actual.mtimeMs) throw new Error('Draft file changed or exceeds byte limit.');
      return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
    } finally { await handle.close(); }
  }
  async function scanStorage() {
    // Conservative account-profile disk accounting includes orphan/temp files.
    // Storage races are excluded by the shared profile-storage lock below.
    let used = 0;
    for (const entry of await readdir(directory)) {
      if (!idPattern.test(entry)) { if (entry !== 'storage.lock') throw new Error('Unknown draft store entry.'); continue; }
      const dir = location(entry); await directorySafe(dir);
      for (const child of await readdir(dir)) { const stat = await lstat(path.join(dir, child)); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe draft storage member.'); used += stat.size; if (used > 128_000_000) throw new Error('Profile draft storage quota exceeded.'); }
    }
    return used;
  }
  async function write(file, value, limit) {
    const valueCopy = clone(value, limit), text = JSON.stringify(valueCopy), temporary = `${file}.${token()}.tmp`;
    const accounting = storageAccounting.getStore();
    // The profile lock excludes cooperating writers. Scan once before the
    // first intermediate write and again before each manifest publication.
    const used = !accounting || accounting.used === null || path.basename(file) === 'manifest.json'
      ? await scanStorage() : accounting.used;
    const existing = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Unsafe existing draft member.');
    if (used + Buffer.byteLength(text) - (existing?.size ?? 0) > 128_000_000) throw new Error('Profile draft storage quota exceeded.');
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); handle = null; }
      await rename(temporary, file);
      if (accounting) accounting.used = used + Buffer.byteLength(text) - (existing?.size ?? 0);
    } finally { if (handle) await handle.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function acquire(file) {
    let handle;
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const recoveryFile = `${file}.recovery`, recovery = await open(recoveryFile, 'wx', 0o600);
      try {
        const owner = await read(file, 1000); exact(owner, ['pid', 'epoch']);
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !partPattern.test(owner.epoch ?? '')) throw new Error('Unconfirmed draft lock owner.');
        let dead = false;
        try { process.kill(owner.pid, 0); } catch (status) { dead = status.code === 'ESRCH'; }
        if (!dead || digest(await read(file, 1000)) !== digest(owner)) throw new Error('Draft lock owner is live, reused or unconfirmed.');
        await unlink(file); handle = await open(file, 'wx', 0o600);
      } finally { await recovery.close(); await unlink(recoveryFile); }
    }
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, epoch: processEpoch })); await handle.sync(); }
    catch (error) { await handle.close(); await unlink(file); throw error; }
    return handle;
  }
  async function locked(id, operation) {
    const previous = queue.get(id) ?? Promise.resolve();
    const next = previous.then(async () => {
      await root(); const dir = location(id); await directorySafe(dir);
      const profileLock = await acquire(path.join(directory, 'storage.lock'));
      const lockFile = path.join(dir, 'owner.lock');
      // Conservative across processes: stale locks require explicit recovery.
      let lock;
      try { lock = await acquire(lockFile); return await storageAccounting.run({ used: null }, () => operation(dir)); }
      finally { if (lock) { await lock.close(); await unlink(lockFile); } await profileLock.close(); await unlink(path.join(directory, 'storage.lock')); }
    });
    const tail = next.catch(() => {}); queue.set(id, tail);
    try { return await next; } finally { if (queue.get(id) === tail) queue.delete(id); }
  }
  async function manifest(dir, account, allowExpired = false) {
    if (!hashPattern.test(account ?? '')) throw new Error('Invalid resolved account identity.');
    const record = await read(path.join(dir, 'manifest.json'), DRAFT_LIMITS.part);
    exact(record, ['version', 'id', 'account', 'profile', 'header', 'state', 'createdAt', 'expiresAt', 'parts', 'pages', 'bytes', 'manifestDigest', 'presentationDigest', 'preparedEpoch', 'pageReceipts', 'receiptEpoch', 'review', 'reviewInput', 'approvalConsumed', 'preparedRecords', 'continuation']);
    if (record.version !== 1 || record.id !== path.basename(dir) || record.account !== account || !idPattern.test(record.id) || typeof record.profile !== 'string' || record.profile.length > 128 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > DRAFT_LIMITS.total || !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= record.createdAt || record.expiresAt - record.createdAt > DRAFT_LIMITS.lifetime || !Array.isArray(record.parts) || record.parts.length > DRAFT_LIMITS.parts || !Array.isArray(record.pages) || record.pages.length > DRAFT_LIMITS.pages || !['uploading', 'sealed', 'prepared', 'reviewed', 'cancelled'].includes(record.state)) throw new Error('Draft account/schema mismatch.');
    if (record.header?.input?.cyclePreferenceReviews !== undefined) {
      if (!Array.isArray(record.header.input.cyclePreferenceReviews)) throw new Error('Invalid persisted cycle preference reviews.');
      normalizeCyclePreferenceReviews(record.header.input.cyclePreferenceReviews);
    }
    const keys = new Set(), batches = new Set();
    for (const row of record.parts) {
      exact(row, ['batchId', 'kind', 'key', 'digest', 'bytes']);
      if (!partPattern.test(row.batchId ?? '') || !idPattern.test(row.key ?? '') || !hashPattern.test(row.digest ?? '') || !['sessions', 'occurrences'].includes(row.kind) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes > DRAFT_LIMITS.part || keys.has(row.key) || batches.has(row.batchId)) throw new Error('Invalid persisted part.');
      keys.add(row.key); batches.add(row.batchId);
    }
    for (const row of record.pages) {
      exact(row, ['key', 'digest', 'stableDigest', 'bytes']);
      if (!/^[a-f0-9]{48}-\d{1,4}$/.test(row.key ?? '') || !hashPattern.test(row.digest ?? '') || (row.stableDigest !== undefined && !hashPattern.test(row.stableDigest)) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes > DRAFT_LIMITS.page || keys.has(row.key)) throw new Error('Invalid persisted page.');
      keys.add(row.key);
    }
    if (record.preparedRecords !== undefined) {
      if (!Array.isArray(record.preparedRecords) || record.preparedRecords.length > 364) throw new Error('Invalid prepared record index.');
      const ids = new Set();
      for (const row of record.preparedRecords) { exact(row, ['sessionId', 'key', 'digest', 'bytes']); if (!partPattern.test(row.sessionId ?? '') || !idPattern.test(row.key ?? '') || !hashPattern.test(row.digest ?? '') || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes > DRAFT_LIMITS.part || ids.has(row.sessionId) || keys.has(row.key)) throw new Error('Invalid prepared record.'); ids.add(row.sessionId); keys.add(row.key); }
    }
    if (record.state !== 'uploading' && record.state !== 'cancelled' && !hashPattern.test(record.manifestDigest ?? '')) throw new Error('Missing sealed identity.');
    if (['prepared', 'reviewed'].includes(record.state) && (!hashPattern.test(record.presentationDigest ?? '') || !record.pages.length || !Array.isArray(record.pageReceipts) || new Set(record.pageReceipts).size !== record.pageReceipts.length || record.pageReceipts.some(index => !Number.isSafeInteger(index) || index < 0 || index >= record.pages.length))) throw new Error('Invalid presentation state.');
    if (record.review) { exact(record.review, ['contextDigest', 'prescriptionDigest', 'researchReviewDigest', 'epoch', 'expiresAt']); if (['contextDigest', 'prescriptionDigest', 'researchReviewDigest'].some(key => !hashPattern.test(record.review[key] ?? '')) || !partPattern.test(record.review.epoch ?? '') || !Number.isSafeInteger(record.review.expiresAt) || record.review.expiresAt > record.expiresAt) throw new Error('Invalid persisted review.'); }
    if (record.continuation !== undefined) { exact(record.continuation, ['originalDraftId','sourceSnapshotDigest','originalDossierDigest','sessions','occurrences','checkpointFloor','ancestorSources']); if (!idPattern.test(record.continuation.originalDraftId ?? '') || ['sourceSnapshotDigest','originalDossierDigest'].some(key => !hashPattern.test(record.continuation[key] ?? '')) || !Array.isArray(record.continuation.sessions) || !Array.isArray(record.continuation.occurrences) || !Array.isArray(record.continuation.ancestorSources) || record.continuation.ancestorSources.length>364) throw new Error('Invalid continuation lineage.'); const seen=new Set([record.continuation.originalDraftId]); for(const ancestor of record.continuation.ancestorSources){exact(ancestor,['draftId','snapshotDigest']);if(!idPattern.test(ancestor.draftId ?? '')||!hashPattern.test(ancestor.snapshotDigest ?? '')||seen.has(ancestor.draftId))throw new Error('Invalid continuation ancestry.');seen.add(ancestor.draftId);} }
    if (record.approvalConsumed !== undefined && typeof record.approvalConsumed !== 'boolean') throw new Error('Invalid approval consumption.');
    if (!allowExpired && record.expiresAt <= now()) throw new Error('Draft expired; existing execution journal must be retained.');
    if (!allowExpired && record.state === 'cancelled') throw new Error('Draft cancelled.');
    return record;
  }
  const save = (dir, record) => write(path.join(dir, 'manifest.json'), record, DRAFT_LIMITS.part);
  function publicStatus(record) { return { draftId: record.id, state: record.state, expiresAt: record.expiresAt, receivedParts: record.parts.length, receivedBytes: record.bytes, storageBudget: { totalBytes: DRAFT_LIMITS.total, usedBytes: record.bytes, remainingBytes: DRAFT_LIMITS.total - record.bytes, includes: ['input', 'prepared-definitions', 'presentation-pages'], acceptedUploadGuaranteesPreparation: false }, manifestDigest: record.manifestDigest ?? null, pageCount: record.pages.length, researchReviewComplete: record.state === 'reviewed', mutationAuthorized: false }; }
  async function verifyPart(dir, row) {
    const value = await read(path.join(dir, `part-${row.key}.json`), DRAFT_LIMITS.part);
    if (digest(value) !== row.digest) throw new Error('Draft part digest mismatch.');
    return value;
  }
  return Object.freeze({
    /** Newest-first summary of this account's drafts; optional stored review of the newest draft that has one. */
    async list({ account, includeStoredReview = false }) {
      let entries = [];
      try { entries = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return { drafts: [] }; throw error; }
      const drafts = [];
      for (const entry of entries) {
        if (!idPattern.test(entry)) continue;
        let record;
        try { const dir = location(entry); await directorySafe(dir); record = await manifest(dir, account, true); } catch { continue; }
        const input = record.header?.input ?? {};
        const start = typeof input.startDate === 'string' ? input.startDate : null;
        const end = start && Number.isSafeInteger(input.totalWeeks) ? new Date(Date.parse(start + 'T00:00:00Z') + (input.totalWeeks * 7 - 1) * 86400000).toISOString().slice(0, 10) : null;
        drafts.push({ draftId: record.id, state: record.state, expired: record.expiresAt <= now(), createdAt: new Date(record.createdAt).toISOString(), expiresAt: new Date(record.expiresAt).toISOString(), sessionCount: record.header?.expectedSessions ?? null, occurrenceCount: record.header?.expectedOccurrences ?? null, dateRange: start ? { from: start, to: end } : null, presentationDigest: record.presentationDigest ?? null, pageCount: record.pages?.length ?? 0, hasStoredReview: Boolean(record.reviewInput), ...(record.reviewInput ? { storedReviewCounts: { evidence: record.reviewInput.evidence?.length ?? 0, decisionEvidence: record.reviewInput.decisionEvidence?.length ?? 0 } } : {}), _record: record });
      }
      drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const withReview = includeStoredReview ? drafts.find(row => row.hasStoredReview && !row.expired && row.state !== 'cancelled') : null;
      return { drafts: drafts.map(({ _record, ...row }) => row), ...(withReview ? { storedReview: { draftId: withReview.draftId, presentationDigest: withReview.presentationDigest, reviewInput: clone(withReview._record.reviewInput, DRAFT_LIMITS.request) } } : {}), nextStep: 'Użyj draftId; po restarcie serwera pobierz ponownie wszystkie strony, potem gm_coach_review_training_cycle_draft z reuseStoredReview:true i tym samym presentationDigest.' };
    },
    async begin({ account, profile, header }) {
      if (!hashPattern.test(account ?? '') || typeof profile !== 'string' || profile.length > 128) throw new Error('Invalid account/profile.');
      const clean = clone(header, DRAFT_LIMITS.request); await validateHeader(clean);
      await root(); const profileLock = await acquire(path.join(directory, 'storage.lock'));
      let id, dir;
      try {
      let count = 0;
      for (const entry of await readdir(directory)) if (idPattern.test(entry)) { const candidate = location(entry); await directorySafe(candidate); if (!(await readdir(candidate)).length) continue; const record = await manifest(candidate, account, true); if (record.state !== 'cancelled' && record.expiresAt > now()) count++; }
      if (count >= 8) throw new Error('Active durable draft limit reached.');
      id = token(); dir = location(id); await mkdir(dir, { mode: 0o700 });
      const createdAt = now();
      const record = { version: 1, id, account, profile, header: clean, state: 'uploading', createdAt, expiresAt: createdAt + DRAFT_LIMITS.lifetime, parts: [], pages: [], bytes: Buffer.byteLength(JSON.stringify(clean)) };
      await save(dir, record); return publicStatus(record);
      } catch (error) { if (dir) await rmdir(dir).catch(cleanup => { if (!['ENOENT', 'ENOTEMPTY'].includes(cleanup.code)) throw cleanup; }); throw error; } finally { await profileLock.close(); await unlink(path.join(directory, 'storage.lock')); }
    },
    async upload({ draftId, account, batchId, kind, items }) {
      if (!partPattern.test(batchId ?? '') || !['sessions', 'occurrences'].includes(kind) || !Array.isArray(items) || !items.length) throw new Error('Invalid upload batch.');
      const clean = clone({ batchId, kind, items }, DRAFT_LIMITS.request);
      return locked(draftId, async dir => {
        const record = await manifest(dir, account), valueDigest = digest(clean);
        const existing = record.parts.find(row => row.batchId === batchId);
        if (existing) { if (existing.digest !== valueDigest) throw new Error('Conflicting upload retry.'); await verifyPart(dir, existing); return publicStatus(record); }
        if (record.state !== 'uploading') throw new Error('Sealed draft is immutable.');
        await validatePart(kind, clean.items, record.header);
        if (record.expiresAt <= now()) throw new Error('Draft expired during part validation.');
        const bytes = Buffer.byteLength(JSON.stringify(clean));
        if (record.parts.length >= DRAFT_LIMITS.parts || record.bytes + bytes > DRAFT_LIMITS.total) throw new Error('Draft storage limit exceeded; plan was not shortened.');
        const key = token(); await write(path.join(dir, `part-${key}.json`), clean, DRAFT_LIMITS.part);
        record.parts.push({ batchId, kind, key, digest: valueDigest, bytes }); record.bytes += bytes;
        try { await save(dir, record); } catch (error) { await unlink(path.join(dir, `part-${key}.json`)); throw error; } return publicStatus(record);
      });
    },
    async seal({ draftId, account, validateComplete }) {
      if (typeof validateComplete !== 'function') throw new Error('Missing complete cycle validator.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account);
        if (record.state !== 'uploading') return publicStatus(record);
        // Callback receives bounded async parts. It must enforce all global
        // references, dates, weeks, blocks, progression and deload rules.
        async function* parts() { for (const row of record.parts) yield await verifyPart(dir, row); }
        await validateComplete(clone(record.header, DRAFT_LIMITS.part), parts());
        if (record.expiresAt <= now()) throw new Error('Draft expired during complete validation.');
        record.manifestDigest = digest({ version: record.version, profile: record.profile, header: record.header, parts: record.parts.map(({ batchId, kind, digest: valueDigest }) => ({ batchId, kind, digest: valueDigest })) });
        record.state = 'sealed'; await save(dir, record); return publicStatus(record);
      });
    },
    /** Add cycle-level preference confirmation to a sealed draft without resending sessions; prepared pages and review are discarded. */
    async setPreferenceReviews({ draftId, account, reviews, blockOverrides = [] }) {
      return locked(draftId, async dir => {
        const record = await manifest(dir, account);
        if (!['sealed', 'prepared', 'reviewed'].includes(record.state)) throw new Error('Draft must be sealed (finalized) before adding cycle preference reviews.');
        const input = { ...record.header.input };
        if (reviews !== undefined) {
          if (!Array.isArray(reviews)) throw new Error('Invalid cycle preference reviews.');
          input.cyclePreferenceReviews = normalizeCyclePreferenceReviews(clone(reviews, DRAFT_LIMITS.part));
        }
        if (blockOverrides.length) {
          const blocks = input.organization?.blocks;
          if (!Array.isArray(blocks)) throw new Error('Draft has no cycle blocks to annotate.');
          input.organization = { ...input.organization, blocks: blocks.map(block => { const found = blockOverrides.find(row => row.blockId === block.id); return found ? { ...block, unchangedDoseReason: found.unchangedDoseReason, progressionOverrideUserAuthorized: true } : block; }) };
          const missing = blockOverrides.filter(row => !blocks.some(block => block.id === row.blockId)).map(row => row.blockId);
          if (missing.length) throw new Error('Unknown cycle block id: ' + missing.join(', '));
        }
        record.header = { ...record.header, input };
        record.manifestDigest = digest({ version: record.version, profile: record.profile, header: record.header, parts: record.parts.map(({ batchId, kind, digest: valueDigest }) => ({ batchId, kind, digest: valueDigest })) });
        // Stored reviewInput is kept so a later review can reuse it (reuseStoredReview) against the fresh preparation.
        record.pages = []; record.preparedRecords = []; delete record.presentationDigest; delete record.review; delete record.pageReceipts; delete record.preparedEpoch; delete record.approvalConsumed;
        record.bytes = Buffer.byteLength(JSON.stringify(record.header)) + record.parts.reduce((sum, row) => sum + row.bytes, 0);
        record.state = 'sealed'; await save(dir, record); return { ...publicStatus(record), cyclePreferenceReviews: record.header.input.cyclePreferenceReviews ?? [], blockProgressionOverrides: blockOverrides, nextStep: 'speediance_prepare_training_cycle_draft' };
      });
    },
    async prepare({ draftId, account, buildPages }) {
      if (typeof buildPages !== 'function') throw new Error('Missing full science preparation capability.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account);
        if (record.state !== 'sealed') throw new Error('Draft must be sealed before preparation.');
        const capturedPartsDigest = digest(record.parts);
        let capabilityActive = true;
        async function assertPreparing() {
          if (!capabilityActive) throw new Error('Unpublished preparation capability has expired.');
          await directorySafe(dir);
          const current = await manifest(dir, account);
          if (current.state !== 'sealed' || current.manifestDigest !== record.manifestDigest || digest(current.parts) !== capturedPartsDigest) throw new Error('Preparation generation changed.');
        }
        async function* parts() { for (const row of record.parts) { await assertPreparing(); const value = await verifyPart(dir, row); await assertPreparing(); yield value; } await assertPreparing(); }
        const pages = [], preparedRecords = [], generation = token(); let bytes = record.bytes, committed = false;
        // No prepared state is published until the generator finishes all
        // global validation and freshness checks successfully.
        try {
        const capabilities = {
          inputParts: parts,
          async savePrepared(sessionId, value) {
            await assertPreparing();
            if (!partPattern.test(sessionId ?? '') || preparedRecords.some(row => row.sessionId === sessionId) || preparedRecords.length >= 364) throw new Error('Invalid prepared definition identity.');
            const clean = clone(value, DRAFT_LIMITS.part), size = Buffer.byteLength(JSON.stringify(clean));
            if (bytes + size > DRAFT_LIMITS.total) throw new Error('Prepared draft storage limit exceeded.');
            const key = token(); await write(path.join(dir, `prepared-${key}.json`), clean, DRAFT_LIMITS.part);
            const row = { sessionId, key, digest: digest(clean), bytes: size }; preparedRecords.push(row); bytes += size; return { ...row };
          },
          async readPrepared(sessionId) {
            await assertPreparing();
            const row = preparedRecords.find(row => row.sessionId === sessionId); if (!row) throw new Error('Unknown prepared session.');
            const value = await read(path.join(dir, `prepared-${row.key}.json`), DRAFT_LIMITS.part); if (digest(value) !== row.digest) throw new Error('Prepared session digest mismatch.'); return value;
          }
        };
        for await (const page of buildPages(clone(record.header, DRAFT_LIMITS.part), parts(), capabilities)) {
          const clean = clone(page, DRAFT_LIMITS.page), size = Buffer.byteLength(JSON.stringify(clean));
          if (pages.length >= DRAFT_LIMITS.pages || bytes + size > DRAFT_LIMITS.total) throw new Error('Prepared draft storage limit exceeded.');
          const key = `${generation}-${pages.length}`; await write(path.join(dir, `page-${key}.json`), clean, DRAFT_LIMITS.page);
          // stableDigest excludes live, process-dependent fields (e.g. template slots) from the presentation identity.
          pages.push({ key, digest: digest(clean), stableDigest: digest(presentationProjection(clean)), bytes: size }); bytes += size;
        }
        if (!pages.length) throw new Error('Preparation produced no review pages.');
        if (record.expiresAt <= now()) throw new Error('Draft expired during scientific preparation.');
        record.pages = pages; record.preparedRecords = preparedRecords; record.bytes = bytes; record.presentationDigest = digest({ manifestDigest: record.manifestDigest, pages: pages.map(row => row.stableDigest ?? row.digest) });
        record.state = 'prepared'; record.preparedEpoch = processEpoch; record.pageReceipts = []; await save(dir, record); committed = true; return { ...publicStatus(record), presentationDigest: record.presentationDigest };
        } finally { capabilityActive = false; if (!committed) { for (const row of pages) await unlink(path.join(dir, `page-${row.key}.json`)); for (const row of preparedRecords) await unlink(path.join(dir, `prepared-${row.key}.json`)); } }
      });
    },
    async page({ draftId, account, index, projectPage = value => value }) {
      if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid page index.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account), row = record.pages[index];
        if (!row || !['prepared', 'reviewed'].includes(record.state)) throw new Error('Page unavailable.');
        const data = await read(path.join(dir, `page-${row.key}.json`), DRAFT_LIMITS.page);
        if (digest(data) !== row.digest) throw new Error('Review page digest mismatch.');
        if (record.receiptEpoch !== processEpoch) { record.pageReceipts = []; record.receiptEpoch = processEpoch; }
        if (!record.pageReceipts.includes(index)) record.pageReceipts.push(index);
        await save(dir, record);
        return { draftId, index, pageCount: record.pages.length, pageDigest: row.digest, presentationDigest: record.presentationDigest, data: projectPage(data), humanReadVerified: false };
      });
    },
    async pages({ draftId, account, indexes, maxOutputBytes = 64000, projectPage = value => value }) {
      // Capture dense own-data indices before the lock/any await; never invoke getters.
      if (!Array.isArray(indexes) || Object.getPrototypeOf(indexes) !== Array.prototype || indexes.length < 1 || indexes.length > 16 || Reflect.ownKeys(indexes).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= indexes.length))) throw new Error('Invalid page batch indexes.');
      const selected = [];
      for (let i = 0; i < indexes.length; i++) { const cell = Object.getOwnPropertyDescriptor(indexes, String(i)); if (!cell || !Object.hasOwn(cell, 'value') || !Number.isSafeInteger(cell.value) || cell.value < 0 || selected.includes(cell.value)) throw new Error('Invalid page batch indexes.'); selected.push(cell.value); }
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > DRAFT_LIMITS.request) throw new Error('Invalid page batch byte budget.');
      return locked(draftId, async dir => {
        const initial = await manifest(dir, account), generation = digest(initial);
        if (!['prepared', 'reviewed'].includes(initial.state) || selected.some(index => !initial.pages[index])) throw new Error('Page batch unavailable.');
        const response = { draftId, pageCount: initial.pages.length, presentationDigest: initial.presentationDigest, indexes: selected, pages: [], readOnly: true, mutationAuthorized: false, scientificApproval: false, humanReadVerified: false };
        const bounded = () => { if (Buffer.byteLength(JSON.stringify(response), 'utf8') > maxOutputBytes) throw new Error('Page batch output byte budget exceeded; no receipts updated.'); };
        bounded();
        for (const index of selected) {
          const row = initial.pages[index], data = await read(path.join(dir, `page-${row.key}.json`), DRAFT_LIMITS.page);
          if (digest(data) !== row.digest) throw new Error('Review page digest mismatch.');
          response.pages.push({ index, pageDigest: row.digest, presentationDigest: initial.presentationDigest, data: projectPage(data), humanReadVerified: false }); bounded();
        }
        await directorySafe(dir);
        const fresh = await manifest(dir, account);
        if (digest(fresh) !== generation) throw new Error('Page batch manifest generation changed; no receipts updated.');
        if (fresh.expiresAt <= now()) throw new Error('Draft expired before page batch receipts.');
        let changed = fresh.receiptEpoch !== processEpoch;
        if (changed) { fresh.pageReceipts = []; fresh.receiptEpoch = processEpoch; }
        for (const index of selected) if (!fresh.pageReceipts.includes(index)) { fresh.pageReceipts.push(index); changed = true; }
        bounded();
        // Existing save scans every draft/orphan/temp member under the held profile lock.
        if (changed) await save(dir, fresh);
        if (fresh.expiresAt <= now()) throw new Error('Draft expired after page batch receipt persistence; no page data returned.');
        return response;
      });
    },
    async review({ draftId, account, presentationDigest, reviewInput, validateReview }) {
      if (typeof validateReview !== 'function') throw new Error('Missing scientific review capability.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account);
        if (!['prepared', 'reviewed'].includes(record.state) || presentationDigest !== record.presentationDigest || record.receiptEpoch !== processEpoch || record.pageReceipts.length !== record.pages.length) throw new Error('Full current presentation must be retrieved before review.');
        const clean = clone(reviewInput, DRAFT_LIMITS.request);
        const proof = await validateReview({ header: clone(record.header, DRAFT_LIMITS.part), manifestDigest: record.manifestDigest, presentationDigest, reviewInput: clean });
        exact(proof, ['contextDigest', 'prescriptionDigest', 'researchReviewDigest']);
        if (Object.values(proof).length !== 3 || Object.values(proof).some(value => !hashPattern.test(value ?? ''))) throw new Error('Invalid server review proof.');
        // Check expiration after awaited research/context reads.
        if (record.expiresAt <= now()) throw new Error('Draft expired during review.');
        record.review = { ...proof, epoch: processEpoch, expiresAt: Math.min(record.expiresAt, now() + DRAFT_LIMITS.approvalLifetime) };
        record.reviewInput = clean;
        record.approvalConsumed = false; active.delete(draftId);
        record.state = 'reviewed'; await save(dir, record); return { ...publicStatus(record), ...proof, presentationDigest };
      });
    },
    async authorize({ draftId, account, presentationDigest, researchReviewDigest, confirm, revalidate, allowConsumedResume = false }) {
      if (confirm !== true || typeof revalidate !== 'function') throw new Error('Explicit complete plan approval and fresh validator required.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account), review = record.review;
        // A consumed approval may resume the same journal (identical payload digests are re-checked by the executor).
        if (record.state !== 'reviewed' || (record.approvalConsumed === true && !allowConsumedResume) || !review?.researchReviewDigest || review.expiresAt <= now() || presentationDigest !== record.presentationDigest || researchReviewDigest !== review.researchReviewDigest) throw new Error('Approval is consumed, stale or belongs to another process/presentation. Naprawa: jeśli plan jest niezmieniony, wywołaj speediance_execute_training_cycle_draft z {"draftId":"'+draftId+'","presentationDigest":"'+presentationDigest+'","confirm":true,"finishFromStoredReview":true}; serwer sam przygotuje szkic, odczyta strony i ponowi ocenę.');
        await revalidate({ manifestDigest: record.manifestDigest, ...review });
        if (record.expiresAt <= now() || review.expiresAt <= now()) throw new Error('Approval expired during final validation.');
        // Returned proof is local integration data, never an automatic POST.
        record.approvalConsumed = true; await save(dir, record);
        // Execution window: a started background execution may outlive the 30-minute approval window; revocation still applies.
        const proof = Object.freeze({ draftId, manifestDigest: record.manifestDigest, presentationDigest, ...review, epoch: processEpoch, reviewEpoch: review.epoch, executionExpiresAt: Math.min(record.expiresAt, now() + 2 * 60 * 60 * 1000), resumedFromConsumedApproval: record.approvalConsumed === true && allowConsumedResume });
        grantSnapshots.set(proof, authorizationSnapshot(dir)); grants.add(proof); active.set(draftId, proof); return proof;
      });
    },
    assertAuthorization(proof) { if (!grants.has(proof) || active.get(proof.draftId) !== proof || proof.epoch !== processEpoch || (proof.executionExpiresAt ?? proof.expiresAt) <= now() || authorizationSnapshot(location(proof.draftId)) !== grantSnapshots.get(proof)) throw new Error('Cycle authorization expired or revoked before dispatch.'); },
    releaseAuthorization(proof) { if (active.get(proof?.draftId) === proof) active.delete(proof.draftId); },
    async status({ draftId, account }) { return locked(draftId, async dir => publicStatus(await manifest(dir, account, true))); },
    async inspect({ draftId, account, consume, originalContinuation = false }) {
      if (typeof consume !== 'function') throw new Error('Missing internal inspection capability.');
      return locked(draftId, async dir => {
        const record = await manifest(dir, account, originalContinuation);
        if (originalContinuation && (record.state !== 'reviewed' || !record.review || !record.preparedRecords?.length)) throw new Error('Original reviewed durable cycle is unavailable.');
        const generation = digest({ manifestDigest: record.manifestDigest, presentationDigest: record.presentationDigest, preparedEpoch: record.preparedEpoch, parts: record.parts, preparedRecords: record.preparedRecords });
        async function currentGeneration() {
          await directorySafe(dir);
          const current = await manifest(dir, account, originalContinuation);
          if (current.state === 'cancelled' || digest({ manifestDigest: current.manifestDigest, presentationDigest: current.presentationDigest, preparedEpoch: current.preparedEpoch, parts: current.parts, preparedRecords: current.preparedRecords }) !== generation) throw new Error('Draft capability generation changed or was cancelled.');
          return current;
        }
        async function* parts() {
          for (const captured of record.parts) {
            const current = await currentGeneration(), row = current.parts.find(item => item.key === captured.key);
            if (!row) throw new Error('Draft part no longer belongs to this generation.');
            const value = await verifyPart(dir, row); await currentGeneration(); yield value;
          }
          await currentGeneration();
        }
        const access = {
          inputParts: parts,
          async readContinuationPresentation() {
            const current=await currentGeneration();if(!current.continuation)return null;
            const row=current.pages.at(-1);if(!row)throw Error('Continuation presentation is missing.');
            const value=await read(path.join(dir,`page-${row.key}.json`),DRAFT_LIMITS.page);
            if(digest(value)!==row.digest||value.section!=='continuation')throw Error('Continuation presentation digest mismatch.');
            await currentGeneration();return value;
          },
          async readPrepared(sessionId) {
            const current = await currentGeneration(), row = current.preparedRecords?.find(row => row.sessionId === sessionId); if (!row) throw new Error('Unknown prepared session.');
            const value = await read(path.join(dir, `prepared-${row.key}.json`), DRAFT_LIMITS.part); if (digest(value) !== row.digest) throw new Error('Prepared session digest mismatch.'); await currentGeneration(); return value;
          }
        };
        return consume(clone(record, DRAFT_LIMITS.part), parts(), access);
      });
    },
    continuationSourceSnapshot(draftId) { return authorizationSnapshot(location(draftId)); },
    assertContinuationSource(lineage) { if (authorizationSnapshot(location(lineage.originalDraftId)) !== lineage.sourceSnapshotDigest) throw new Error('Original continuation generation changed.');for(const ancestor of lineage.ancestorSources){if(authorizationSnapshot(location(ancestor.draftId))!==ancestor.snapshotDigest)throw new Error('Original continuation ancestor generation changed.');} },
    async bindContinuation({ draftId, account, expectedPresentationDigest, lineage, page }) {
      return locked(draftId, async dir => {
        const record = await manifest(dir, account);
        if (record.state !== 'prepared' || record.review || record.approvalConsumed || record.continuation || record.presentationDigest !== expectedPresentationDigest) throw new Error('Fresh unreviewed prepared revision required.');
        const cleanLineage = clone(lineage,DRAFT_LIMITS.part), cleanPage = clone(page,DRAFT_LIMITS.page);
        if (authorizationSnapshot(location(cleanLineage.originalDraftId)) !== cleanLineage.sourceSnapshotDigest) throw new Error('Original continuation generation changed before binding.');
        for(const ancestor of cleanLineage.ancestorSources){if(authorizationSnapshot(location(ancestor.draftId))!==ancestor.snapshotDigest)throw new Error('Original continuation ancestor changed before binding.');}
        if (record.pages.length >= DRAFT_LIMITS.pages) throw new Error('Continuation presentation exceeds page limit.');
        const key = `${token()}-${record.pages.length}`, bytes = Buffer.byteLength(JSON.stringify(cleanPage));
        if (record.bytes + bytes + Buffer.byteLength(JSON.stringify(cleanLineage)) > DRAFT_LIMITS.total) throw new Error('Continuation storage exceeds full draft limit.');
        await write(path.join(dir,`page-${key}.json`),cleanPage,DRAFT_LIMITS.page);
        record.pages.push({key,digest:digest(cleanPage),bytes}); record.bytes += bytes + Buffer.byteLength(JSON.stringify(cleanLineage));
        record.continuation = cleanLineage; record.pageReceipts = []; delete record.receiptEpoch;
        record.presentationDigest = digest({manifestDigest:record.manifestDigest,pages:record.pages.map(row=>row.stableDigest ?? row.digest)});
        await save(dir,record); return {...publicStatus(record),presentationDigest:record.presentationDigest,scientificApproval:false,mutationAuthorized:false};
      });
    },
    async cancel({ draftId, account }) { return locked(draftId, async dir => {
      const record = await manifest(dir, account, true); record.state = 'cancelled'; delete record.review; delete record.reviewInput; active.delete(draftId);
      await save(dir, record);
      for (const row of record.parts) await unlink(path.join(dir, `part-${row.key}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      for (const row of record.pages) await unlink(path.join(dir, `page-${row.key}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      for (const row of record.preparedRecords ?? []) await unlink(path.join(dir, `prepared-${row.key}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      record.parts = []; record.pages = []; record.preparedRecords = []; record.header = {}; record.bytes = 0; delete record.pageReceipts;
      await save(dir, record); return publicStatus(record);
    }); }
  });
}
