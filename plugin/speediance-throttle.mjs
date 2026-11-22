import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Shared Speediance transport throttle: per-profile serialized limiter, 2001 backoff and TTL read cache (memory + disk). */
export const DEFAULT_CACHE_TTLS = Object.freeze([
  [/^\/app\/accessories\/list/, 30 * 60_000],
  [/^\/app\/actionLibraryGroup\//, 30 * 60_000],
  [/^\/app\/v4\/customTrainingTemplate\/appPage/, 60_000],
  [/^\/app\/v3\/customTrainingTemplate\/detailByCode/, 60_000],
  [/^\/app\/v5\/trainingCalendar\/monthNew/, 60_000]
]);
const DISK_MIN_TTL = 10 * 60_000;
const hash = value => createHash('sha256').update(value).digest('hex');

export function isSpeedianceRateLimited(envelope) {
  if (!envelope || typeof envelope !== 'object') return false;
  const message = [envelope.message, envelope.msg].find(value => typeof value === 'string') ?? '';
  return Number(envelope.code) === 2001 || /request too frequent/i.test(message);
}
/** 2001 "Request too frequent" is a gateway rejection before execution; only then may a write be retried. */
export function isRejectedBeforeExecution(envelope) {
  const message = [envelope?.message, envelope?.msg].find(value => typeof value === 'string') ?? '';
  return Number(envelope?.code) === 2001 && /request too frequent/i.test(message);
}

export function createSpeedianceThrottle({ minIntervalMs = 300, maxAttempts = 5, baseDelayMs = 1500, maxDelayMs = 20_000, cooldownMs = 60_000, random = Math.random, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), cacheDir = null, ttls = DEFAULT_CACHE_TTLS, maxEntries = 500 } = {}) {
  const tails = new Map(), lastAt = new Map(), memory = new Map();
  async function acquire(key) {
    const previous = tails.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    tails.set(key, tail);
    await previous;
    try {
      const wait = (lastAt.get(key) ?? -Infinity) + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastAt.set(key, now());
    } finally { release(); if (tails.get(key) === tail) tails.delete(key); }
  }
  const delay = attempt => Math.round(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + random() * 0.5));
  const ttlFor = apiPath => (ttls.find(([pattern]) => pattern.test(apiPath)) ?? [null, 0])[1];
  const fileFor = (scope, apiPath) => cacheDir ? path.join(cacheDir, hash(scope + '\n' + apiPath) + '.json') : null;
  function cacheGet(scope, apiPath) {
    const ttl = ttlFor(apiPath); if (!ttl) return null;
    const key = scope + '\n' + apiPath, time = now();
    const hit = memory.get(key);
    if (hit && hit.expiresAt > time) return structuredClone(hit.value);
    memory.delete(key);
    const file = ttl >= DISK_MIN_TTL ? fileFor(scope, apiPath) : null;
    if (!file) return null;
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored.key !== hash(key) || !(stored.expiresAt > time)) return null;
      memory.set(key, { value: stored.value, expiresAt: stored.expiresAt });
      return structuredClone(stored.value);
    } catch { return null; }
  }
  function cacheSet(scope, apiPath, value) {
    const ttl = ttlFor(apiPath); if (!ttl) return;
    const key = scope + '\n' + apiPath, expiresAt = now() + ttl;
    memory.set(key, { value: structuredClone(value), expiresAt, scope });
    while (memory.size > maxEntries) memory.delete(memory.keys().next().value);
    const file = ttl >= DISK_MIN_TTL ? fileFor(scope, apiPath) : null;
    if (!file) return;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const temp = file + '.' + process.pid + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ key: hash(key), scope: hash(scope), expiresAt, value }));
      fs.renameSync(temp, file);
    } catch { /* cache is best effort */ }
  }
  /** Any write for a profile/account drops its short-lived template/calendar entries. */
  function invalidate(scope) { for (const [key, entry] of memory) if (entry.scope === scope) memory.delete(key); }
  function rateLimitError(attempts, write) {
    const seconds = Math.ceil(cooldownMs / 1000);
    const error = new Error(`API Speediance ogranicza liczbę żądań (kod 2001, Request too frequent). GM Coach ponowił żądanie ${attempts} razy z rosnącą przerwą. Spróbuj ponownie za około ${seconds} s.${write ? ' Zapis został odrzucony przed wykonaniem; niczego nie zapisano.' : ''}`);
    error.code = 'SPEEDIANCE_RATE_LIMITED'; error.retryAfterSeconds = seconds; error.retryAt = new Date(now() + cooldownMs).toISOString();
    return error;
  }
  return Object.freeze({ acquire, delay, sleep, maxAttempts, cacheGet, cacheSet, invalidate, ttlFor, rateLimitError, isRateLimited: isSpeedianceRateLimited, isRejectedBeforeExecution });
}

