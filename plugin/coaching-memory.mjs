import { createHash, randomBytes } from 'node:crypto';

export const COACHING_FACT_CATEGORIES = Object.freeze(['goal', 'schedule', 'injury', 'preference', 'dislike', 'equipment', 'body', 'note']);
const MAX_FACTS = 200;
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid coaching memory fields.');
}
function text(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('Invalid bounded coaching fact text.');
  return value.trim();
}
export function normalizeCoachingMemory(record) {
  if (record === null || record === undefined) return { schemaVersion: 1, facts: [] };
  exact(record, ['schemaVersion', 'facts']);
  if (record.schemaVersion !== 1 || !Array.isArray(record.facts) || record.facts.length > MAX_FACTS) throw new Error('Invalid coaching memory record.');
  const ids = new Set();
  const facts = Array.from(record.facts, fact => {
    exact(fact, ['id', 'category', 'text', 'source', 'created_at', 'expires_at']);
    if (!/^[a-f0-9]{48}$/.test(fact.id) || ids.has(fact.id) || !COACHING_FACT_CATEGORIES.includes(fact.category)) throw new Error('Invalid coaching fact identity/category.');
    ids.add(fact.id);
    const created = Date.parse(fact.created_at), expires = fact.expires_at === null ? null : Date.parse(fact.expires_at);
    if (!Number.isFinite(created) || expires !== null && (!Number.isFinite(expires) || expires <= created || expires - created > 3650 * 86400000)) throw new Error('Invalid coaching fact dates.');
    return { id: fact.id, category: fact.category, text: text(fact.text, 1500), source: text(fact.source, 200), created_at: new Date(created).toISOString(), expires_at: expires === null ? null : new Date(expires).toISOString() };
  });
  return { schemaVersion: 1, facts };
}
export function activeCoachingMemory(record, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Invalid coaching memory clock.');
  const normalized = normalizeCoachingMemory(record);
  const facts = normalized.facts.filter(fact => fact.expires_at === null || Date.parse(fact.expires_at) > now).sort((a, b) => a.id.localeCompare(b.id));
  return { facts, digest: createHash('sha256').update(JSON.stringify(facts)).digest('hex'), nextExpiresAt: facts.reduce((next, fact) => fact.expires_at === null ? next : Math.min(next, Date.parse(fact.expires_at)), Infinity), contextualOnly: true };
}
export function rememberCoachingFact(record, input, now = Date.now()) {
  exact(input, ['category', 'text', 'source', 'expires_days']);
  if (!COACHING_FACT_CATEGORIES.includes(input.category)) throw new Error('Invalid coaching fact category.');
  if (input.expires_days !== null && (!Number.isSafeInteger(input.expires_days) || input.expires_days < 1 || input.expires_days > 3650)) throw new Error('expires_days must be null or integer 1–3650.');
  const active = activeCoachingMemory(record, now).facts;
  if (active.length >= MAX_FACTS) throw new Error('Coaching memory active fact limit reached; forget a fact first.');
  const fact = { id: randomBytes(24).toString('hex'), category: input.category, text: text(input.text, 1500), source: text(input.source, 200), created_at: new Date(now).toISOString(), expires_at: input.expires_days === null ? null : new Date(now + input.expires_days * 86400000).toISOString() };
  return { record: { schemaVersion: 1, facts: [...active, fact] }, fact };
}
export function forgetCoachingFact(record, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) throw new Error('Invalid coaching fact id.');
  const normalized = normalizeCoachingMemory(record);
  return { record: { schemaVersion: 1, facts: normalized.facts.filter(fact => fact.id !== id) }, removed: normalized.facts.some(fact => fact.id === id) };
}
export function assertCoachingMemoryUnchanged(expected, current, now = Date.now()) {
  if (expected.digest !== current.digest || expected.nextExpiresAt <= now) {
    const error = new Error('Coaching memory changed or expired; prepare and review again.');
    error.code = 'GM_COACH_COACHING_MEMORY_CHANGED';
    throw error;
  }
}
