import { createHash } from 'node:crypto';
/** Template saving (verified on the account 2026-11-08: Speediance accepts one template reserved on several dates and the
 * calendar readback shows both entries with the same code). Sessions whose write payload is identical apart from the
 * template name share one template: the first session (in plan order) keeps its sessionId and receives every date. */
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function templateSavingKey(payload) {
  if (!payload || !Array.isArray(payload.actionLibraryList) || !payload.actionLibraryList.length) return null;
  const { name: _name, ...rest } = payload;
  return createHash('sha256').update(JSON.stringify(canonical(rest))).digest('hex');
}
export function mergeIdenticalCycleSessions(sessions, occurrences) {
  const owner = new Map(), alias = new Map(), groups = [];
  for (const session of sessions) {
    const key = templateSavingKey(session.payload);
    if (key && owner.has(key)) { const first = owner.get(key); alias.set(session.sessionId, first.sessionId); groups.find(group => group.sessionId === first.sessionId).merged.push(session.sessionId); continue; }
    if (key) { owner.set(key, session); groups.push({ sessionId: session.sessionId, merged: [] }); }
  }
  if (!alias.size) return { sessions, occurrences, savedTemplates: 0, groups: [] };
  const kept = sessions.filter(session => !alias.has(session.sessionId));
  const remapped = occurrences.map(row => alias.has(row.sessionId) ? { ...row, sessionId: alias.get(row.sessionId) } : row);
  const dates = new Map();
  for (const row of remapped) { const key = row.sessionId + '|' + row.date; if (dates.has(key)) throw new Error('Template saving would reserve one template twice on ' + row.date + '.'); dates.set(key, true); }
  return { sessions: kept, occurrences: remapped, savedTemplates: alias.size, groups: groups.filter(group => group.merged.length) };
}

