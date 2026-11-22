import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
/** Sent wire of a verified cycle session for templateCode: journal (cycle-*.json) -> executionDigest -> draft prepared record.
 * Read-only and bounded; returns null when the journal or the draft record is gone. */
export async function findCycleSentPayloadForTemplate(dir, templateCode) {
  try {
    const journals = (await readdir(dir)).filter(name => /^cycle-[a-f0-9]{64}\.json$/.test(name)).slice(0, 20);
    const digests = new Set();
    for (const name of journals) {
      const journal = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      for (const entry of Object.values(journal?.sessions ?? {})) if (entry?.state === 'verified' && entry.templateCode === templateCode && typeof entry.executionDigest === 'string') digests.add(entry.executionDigest);
    }
    if (!digests.size) return null;
    const draftsDir = path.join(dir, 'cycle-drafts');
    for (const draft of (await readdir(draftsDir).catch(() => [])).slice(0, 50)) {
      for (const file of (await readdir(path.join(draftsDir, draft)).catch(() => [])).filter(name => name.startsWith('prepared-')).slice(0, 400)) {
        const record = JSON.parse(await readFile(path.join(draftsDir, draft, file), 'utf8'));
        if (digests.has(record?.executionDigest) && Array.isArray(record?.payload?.actionLibraryList)) return record.payload;
      }
    }
  } catch { /* identity fallback is optional */ }
  return null;
}

