import { boundedCycleDigest } from './bounded-cycle-json.mjs';

const MAX_INDEX_BYTES = 1_000_000;
const MAX_COMPACT_BYTES = 8_000_000;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
/** Consume bounded upload parts once; retain only definition identities and dates.
 * No raw plan or research document enters the global index. */
export async function readCycleIndex(header, parts, validateIndex) {
  const sessionIds = [], occurrences = [], seen = new Set();
  for await (const part of parts) {
    if (part.kind === 'sessions') {
      for (const row of part.items) {
        if (seen.has(row.sessionId)) throw new Error('Duplicate cycle session identity across batches.');
        seen.add(row.sessionId); sessionIds.push(row.sessionId);
      }
    } else if (part.kind === 'occurrences') occurrences.push(...part.items);
    else throw new Error('Unsupported cycle part.');
    if (sessionIds.length > 364 || occurrences.length > 364 || bytes({ sessionIds, occurrences }) > MAX_INDEX_BYTES) throw new Error('Cycle index exceeds bounded budget.');
  }
  if (sessionIds.length !== header.expectedSessions || occurrences.length !== header.expectedOccurrences) throw new Error('Incomplete announced cycle counts.');
  const index = { ...header.input, sessionIds, occurrences };
  await validateIndex(index); return index;
}

/** All capabilities are server-owned. Each prepared definition is durably stored
 * once; global computation receives only independently validated projections. */
export async function prepareStreamingCycle({ index, parts, begin, prepareSession, projectSession, compactProof, savePrepared, finalize }) {
  const context = await begin(index), definitions = [], projections = new Map(), proofs = [];
  let projectionBytes = 0, proofBytes = 0;
  for await (const part of parts) {
    if (part.kind !== 'sessions') continue;
    for (const raw of part.items) {
      const prepared = await prepareSession(raw, index, context);
      const projection = projectSession(prepared), proof = compactProof(prepared, context);
      projectionBytes += bytes(projection); proofBytes += bytes(proof.plan?.evidence ? { ...proof, plan: { ...proof.plan, evidence: proof.plan.evidence.map(source => ({ id: source.id, citationDigest: boundedCycleDigest(source, 1_000_000) })) } } : proof);
      if (projectionBytes > MAX_COMPACT_BYTES || proofBytes > MAX_COMPACT_BYTES || bytes(prepared) > 1_000_000) throw new Error('Prepared definition/projection/science proof exceeds bounded budget.');
      const stored = await savePrepared(raw.sessionId, prepared);
      definitions.push({ sessionId: raw.sessionId, executionDigest: prepared.executionDigest, storedDigest: stored.digest, serializedWorkRows: prepared.serializedWorkRows, intakeFingerprint: prepared.intakeFingerprint, displayUnit: prepared.displayUnit, staticContextDigest: prepared.staticContextDigest });
      projections.set(raw.sessionId, projection); proofs.push(proof);
      // The raw and normalized plan fall out of scope here. Only this part's
      // request-size buffer and compact projections/proofs remain resident.
    }
  }
  if (definitions.length !== index.sessionIds.length) throw new Error('Prepared definition coverage mismatch.');
  const prepared = await finalize(index, context, definitions, projections, proofs);
  if (bytes({ definitions, contextDigest: prepared.contextDigest }) > MAX_INDEX_BYTES) throw new Error('Prepared index exceeds bounded budget.');
  return { ...prepared, sessions: definitions, compactProofs: proofs, indexDigest: boundedCycleDigest(index, MAX_INDEX_BYTES) };
}
