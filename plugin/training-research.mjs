import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { TRAINING_EVIDENCE_CATEGORIES } from './training-evidence.mjs';

const trainingResearchRequestScope = new AsyncLocalStorage();
const MAX_REQUEST_CITATION_CACHE_ENTRIES = 1024;
const registryRequestIds = new WeakMap();
let nextRegistryRequestId = 1;

function freezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function captureEvidenceSnapshot(value, depth = 0, state = { nodes: 0, active: new Set() }) {
  if (++state.nodes > 10_000 || depth > 20) return null;
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return { kind: 'scalar', value };
  if (!value || typeof value !== 'object' || state.active.has(value) || Object.getOwnPropertySymbols(value).length) return null;
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return null;
  state.active.add(value);
  const names = Object.getOwnPropertyNames(value).filter(key => !(array && key === 'length'));
  if (array && (names.length !== value.length || names.some((key, index) => key !== String(index)))) { state.active.delete(value); return null; }
  const entries = [];
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) { state.active.delete(value); return null; }
    const child = captureEvidenceSnapshot(descriptor.value, depth + 1, state);
    if (!child) { state.active.delete(value); return null; }
    entries.push(array ? child : [key, child]);
  }
  state.active.delete(value);
  return { kind: array ? 'array' : 'object', entries };
}

function evidenceMatchesSnapshot(value, snapshot, depth = 0) {
  if (!snapshot || depth > 20) return false;
  if (snapshot.kind === 'scalar') return Object.is(value, snapshot.value);
  if (!value || typeof value !== 'object' || Object.getOwnPropertySymbols(value).length) return false;
  const array = snapshot.kind === 'array';
  if (Array.isArray(value) !== array || (array ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) return false;
  const names = Object.getOwnPropertyNames(value).filter(key => !(array && key === 'length'));
  if (names.length !== snapshot.entries.length || array && (names.length !== value.length || names.some((key, index) => key !== String(index)))) return false;
  for (let index = 0; index < names.length; index++) {
    const key = array ? String(index) : names[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
    if (!array && snapshot.entries[index][0] !== key || !evidenceMatchesSnapshot(descriptor.value, array ? snapshot.entries[index] : snapshot.entries[index][1], depth + 1)) return false;
  }
  return true;
}

function citationEvidenceDigest(scope, evidence) {
  const cached = scope.evidenceDigests.get(evidence);
  if (cached && evidenceMatchesSnapshot(evidence, cached.snapshot)) {
    scope.stats.citationEvidenceDigestCacheHits += 1;
    return cached.digest;
  }
  const snapshot = captureEvidenceSnapshot(evidence);
  if (!snapshot) return null;
  let serialized;
  try { serialized = JSON.stringify(evidence); } catch { return null; }
  if (typeof serialized !== 'string') return null;
  const digest = createHash('sha256').update(serialized, 'utf8').digest('hex');
  scope.evidenceDigests.set(evidence, { snapshot, digest });
  scope.stats.citationEvidenceDigestCacheMisses += 1;
  return digest;
}

/** Run one MCP operation with a private, short-lived citation lookup cache. */
export function withTrainingResearchRequestScope(operation, onComplete) {
  if (typeof operation !== 'function') throw new TypeError('A request operation is required.');
  if (trainingResearchRequestScope.getStore()) return operation();
  const scope = { cache: new Map(), evidenceDigests: new WeakMap(), stats: { citationVerifyCalls: 0, citationCacheHits: 0, citationCacheMisses: 0, citationCacheBypasses: 0, citationBatchRevisionChecks: 0, citationEvidenceDigestCacheHits: 0, citationEvidenceDigestCacheMisses: 0 } };
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    if (typeof onComplete === 'function') onComplete(Object.freeze({ ...scope.stats, citationCacheEntries: scope.cache.size }));
    scope.cache.clear();
  };
  let result;
  try { result = trainingResearchRequestScope.run(scope, operation); }
  catch (error) { finish(); throw error; }
  if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish);
  finish();
  return result;
}

/** Return counters for the active request only; no process-global statistics are retained. */
export function trainingResearchRequestStats() {
  const scope = trainingResearchRequestScope.getStore();
  return scope ? Object.freeze({ ...scope.stats, citationCacheEntries: scope.cache.size }) : null;
}

/**
 * Reuse only a previously successful citation check inside the active MCP
 * request. Batch liveness is checked on every lookup; evidence changes alter
 * the content digest and force a fresh verifier call. Scientific decisions and
 * excerpt/coverage checks stay outside this cache and run at every call site.
 */
export function verifyCitationForRequest(registry, args, evidence) {
  if (!registry || typeof registry.verifyCitation !== 'function') throw new TypeError('A citation registry is required.');
  const scope = trainingResearchRequestScope.getStore();
  if (!scope || typeof registry.getCitationBatchRevision !== 'function') return registry.verifyCitation(args);

  scope.stats.citationBatchRevisionChecks += 1;
  const batchRevision = registry.getCitationBatchRevision(args?.batchId);
  if (batchRevision === null || batchRevision === undefined) {
    scope.stats.citationCacheBypasses += 1;
    scope.stats.citationVerifyCalls += 1;
    return registry.verifyCitation(args);
  }

  const registryId = registryRequestIds.get(registry) ?? nextRegistryRequestId++;
  registryRequestIds.set(registry, registryId);
  const evidenceDigest = citationEvidenceDigest(scope, evidence);
  if (evidenceDigest === null) {
    scope.stats.citationCacheBypasses += 1;
    scope.stats.citationVerifyCalls += 1;
    return registry.verifyCitation(args);
  }
  const key = JSON.stringify([registryId, args?.batchId, batchRevision, args?.category, evidenceDigest]);
  if (scope.cache.has(key)) {
    scope.stats.citationCacheHits += 1;
    const cached = scope.cache.get(key);
    scope.cache.delete(key);
    scope.cache.set(key, cached);
    return cached;
  }

  scope.stats.citationCacheMisses += 1;
  scope.stats.citationVerifyCalls += 1;
  const result = registry.verifyCitation(args);
  if (result?.valid === true && scope.cache.size < MAX_REQUEST_CITATION_CACHE_ENTRIES) {
    scope.cache.set(key, freezeJson(result));
  }
  return result;
}

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const PUBMED_BASE = 'https://pubmed.ncbi.nlm.nih.gov/';
const DEFAULTS = Object.freeze({
  requestTimeoutMs: 10_000,
  minRequestIntervalMs: 350,
  batchTtlMs: 90 * 60 * 1000,
  // Plans must run the search against PubMed instead of receiving a new batch
  // ID for results cached from another plan. Tests/controlled callers may
  // explicitly opt into short-lived caching through this option.
  searchCacheTtlMs: 0,
  maxBatchQueries: 16,
  maxResultsPerQuery: 3,
  maxAllowedResultsPerQuery: 5,
  maxResponseBytes: 2_000_000,
  maxAbstractChars: 12_000,
  maxCachedQueries: 100,
  maxRetainedBatches: 50
});

const RESISTANCE_TRAINING_QUERY = '"resistance training" OR "strength training" OR "weight training" OR "resistance exercise"';
const AEROBIC_TRAINING_QUERY = '"aerobic exercise" OR "aerobic training" OR "endurance exercise" OR "endurance training" OR "cardiorespiratory exercise"';
const AEROBIC_EVIDENCE_CATEGORIES = new Set([
  'cardio_exercise_selection', 'cardio_intensity', 'cardio_work_rest'
]);
const CATEGORY_QUERY_ANCHORS = Object.freeze({
  weekly_volume: '"training volume" OR "weekly volume" OR "weekly sets" OR "sets per week"',
  frequency: '"training frequency" OR "exercise frequency" OR "weekly sessions"',
  intensity_load: '"training load" OR "resistance training load" OR "repetition maximum" OR "relative intensity"',
  rest_intervals: '"rest interval" OR "inter-set rest" OR "between-set rest" OR "rest duration"',
  exercise_order: '"exercise order" OR "exercise sequence" OR "order of exercises"',
  warmup: '"warm-up" OR warmup OR "pre-exercise warm-up"',
  progression_rotation: '"training progression" OR periodization OR "exercise variation" OR "exercise rotation"',
  recovery_deload: 'deload OR "reduced training" OR "recovery week" OR taper',
  recovery_context: '"resistance training" AND (recovery OR fatigue OR sleep OR autoregulation)',
  supersets: 'superset OR supersets OR "paired set" OR "paired sets"',
  resistance_modes: '"variable resistance" OR "eccentric overload" OR "eccentric training" OR "chain resistance" OR "accommodating resistance"',
  intensity_techniques: '"drop set" OR dropset OR "rest-pause" OR "cluster set" OR "training to failure"',
  stretching_mobility: 'stretching OR mobility OR flexibility OR "range of motion"',
  timed_exercise: '"time under tension" OR isometric OR "timed exercise" OR "static hold"',
  post_workout_stretching: '"post-exercise stretching" OR "post-workout stretching" OR "cool-down"',
  nutrition_context: '"energy deficit" OR "energy balance" OR "caloric restriction" OR "energy surplus" OR "body mass change" OR "weight loss" OR "weight gain" OR "weight maintenance"',
  exercise_selection: '"exercise selection" OR "exercise variation" OR "exercise choice"',
  exercise_dose: '"exercise dose" OR "number of sets" OR repetitions OR "training volume"',
  set_work_dose: '"number of repetitions" OR repetitions OR "set volume" OR "training volume"',
  set_load: '"training load" OR "resistance training load" OR "repetition maximum" OR "relative intensity"',
  set_effort_rir: '"repetitions in reserve" OR RIR OR "proximity to failure" OR "repetitions from failure"',
  set_resistance_mode: '"variable resistance" OR "eccentric training" OR "traditional resistance training" OR "standard resistance training"',
  set_rest_interval: '"rest interval" OR "inter-set rest" OR "between-set rest" OR "rest duration"',
  warmup_element: '"warm-up" OR warmup OR "pre-exercise warm-up"',
  post_workout_stretching_item: '"post-exercise stretching" OR "post-workout stretching" OR "cool-down"',
  cardio_exercise_selection: '"exercise modality" OR "mode of exercise" OR "aerobic exercise" OR "endurance exercise" OR "exercise selection"',
  cardio_intensity: '"exercise intensity" OR "training intensity" OR "relative intensity" OR "heart rate reserve" OR "maximum heart rate" OR "perceived exertion" OR "oxygen uptake" OR VO2max OR "ventilatory threshold"',
  cardio_work_rest: '"interval training" OR "high-intensity interval training" OR "work-rest ratio" OR "work to rest ratio" OR "interval duration" OR "exercise duration" OR "recovery interval" OR "active recovery" OR "continuous training"'
});

const MISSING_CATEGORY_ANCHORS = TRAINING_EVIDENCE_CATEGORIES.filter((category) => !CATEGORY_QUERY_ANCHORS[category]);
if (MISSING_CATEGORY_ANCHORS.length) {
  throw new Error(`Missing controlled PubMed query anchors: ${MISSING_CATEGORY_ANCHORS.join(', ')}.`);
}

/**
 * Build an in-memory, fail-closed PubMed search and citation registry.
 *
 * `search({ queries, maxResultsPerQuery })` accepts 1–8 objects containing a
 * plan or research `category` and plain goal-context terms. The server always
 * adds a controlled modality and category query; caller text is treated
 * only as literal title/abstract terms, never as PubMed syntax. It returns a random batch ID and the
 * exact PubMed records returned for each category. The process-local registry
 * is the trust boundary: `verifyCitation(...)` accepts a citation only if its
 * PubMed ID, title, year, canonical URL, batch, and category match a record
 * actually fetched for that batch. A process restart intentionally invalidates
 * all batches. No API key is required or used.
 *
 * This verifies provenance and returned metadata only. PubMed indexing does
 * not guarantee peer review, and this module does not decide whether an
 * abstract supports a particular training claim. Callers must inspect the
 * publication type, abstract, population, limitations, and full text where
 * available. Network, HTTP, timeout, or response-shape errors reject the whole
 * search; partial results are never registered as a valid batch.
 */
export function createTrainingResearchRegistry(options = {}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const config = { ...DEFAULTS, ...options };
  const batches = new Map();
  const batchRevisions = new WeakMap();
  let nextBatchRevision = 1;
  const searchCache = new Map();
  // Optional durable batches: survive server/tunnel restart until their own expiresAt.
  const persistFile = typeof options.persistFile === 'string' && path.isAbsolute(options.persistFile) ? options.persistFile : null;
  if (persistFile) {
    try {
      const stored = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
      for (const batch of Array.isArray(stored?.batches) ? stored.batches : []) {
        if (batch && typeof batch.batchId === 'string' && Number.isFinite(batch.expiresAt) && batch.expiresAt > now() && Array.isArray(batch.sources) && Array.isArray(batch.queries)) {
          freezeJson(batch);
          batches.set(batch.batchId, batch);
          batchRevisions.set(batch, nextBatchRevision++);
        }
      }
      // Trwała pamięć wyszukiwań (24 h): ta sama kategoria i zapytanie w kolejnym planie nie odpytuje PubMed ponownie.
      for (const [key, entry] of Array.isArray(stored?.searchCache) ? stored.searchCache : []) {
        if (typeof key === 'string' && entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > now() && entry.value) searchCache.set(key, entry);
      }
    } catch { /* missing or unreadable store starts empty */ }
  }
  function persistBatches() {
    if (!persistFile) return;
    try {
      fs.mkdirSync(path.dirname(persistFile), { recursive: true });
      const temp = persistFile + '.' + process.pid + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ version: 1, batches: [...batches.values()], searchCache: [...searchCache.entries()] }));
      fs.renameSync(temp, persistFile);
    } catch { /* best effort; in-memory batch remains valid */ }
  }
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let admissionTail = Promise.resolve();
  let cooldownUntil = Number.NEGATIVE_INFINITY;
  let activeRequests = 0;
  const permitWaiters = [];
  const inFlightRequests = new Map();

  async function acquireRequestPermit(signal, deadline) {
    assertRequestDeadline(signal, deadline);
    if (activeRequests < 3) { activeRequests += 1; return; }
    await new Promise((resolve, reject) => {
      const waiter = { grant: null };
      const aborted = () => {
        const index = permitWaiters.indexOf(waiter);
        if (index >= 0) permitWaiters.splice(index, 1);
        signal.removeEventListener('abort', aborted);
        reject(new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed request timed out while waiting for a transport permit.'));
      };
      waiter.grant = () => { signal.removeEventListener('abort', aborted); resolve(); };
      permitWaiters.push(waiter);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }

  function releaseRequestPermit() {
    const next = permitWaiters.shift();
    if (next) next.grant();
    else activeRequests -= 1;
  }

  if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible implementation is required.');
  for (const field of ['requestTimeoutMs', 'minRequestIntervalMs', 'batchTtlMs', 'searchCacheTtlMs', 'maxResponseBytes']) {
    if (!Number.isFinite(config[field]) || config[field] < 0) throw new TypeError(`${field} must be a non-negative finite number.`);
  }
  if (!Number.isSafeInteger(config.maxBatchQueries) || config.maxBatchQueries < 1 || config.maxBatchQueries > DEFAULTS.maxBatchQueries) {
    throw new TypeError(`maxBatchQueries must be between 1 and ${DEFAULTS.maxBatchQueries}.`);
  }
  if (!Number.isSafeInteger(config.maxAllowedResultsPerQuery) || config.maxAllowedResultsPerQuery < 1 || config.maxAllowedResultsPerQuery > DEFAULTS.maxAllowedResultsPerQuery) {
    throw new TypeError(`maxAllowedResultsPerQuery must be between 1 and ${DEFAULTS.maxAllowedResultsPerQuery}.`);
  }
  for (const field of ['maxCachedQueries', 'maxRetainedBatches', 'maxAbstractChars']) {
    if (!Number.isSafeInteger(config[field]) || config[field] < 1 || config[field] > DEFAULTS[field]) {
      throw new TypeError(`${field} must be between 1 and ${DEFAULTS[field]}.`);
    }
  }

  function deadlineValue(deadline) { return typeof deadline === 'function' ? deadline() : deadline; }

  function assertRequestDeadline(signal, deadline) {
    if (signal.aborted || now() >= deadlineValue(deadline)) throw new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed did not respond before the request timeout.');
  }

  async function sleepUntilAdmission(ms, signal, deadline) {
    assertRequestDeadline(signal, deadline);
    if (ms >= deadlineValue(deadline) - now()) throw new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed cooldown exceeds the remaining request timeout.');
    let aborted;
    const stop = new Promise((_, reject) => {
      aborted = () => reject(new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed did not respond before the request timeout.'));
      signal.addEventListener('abort', aborted, { once: true });
    });
    try { await Promise.race([sleep(ms), stop]); }
    finally { signal.removeEventListener('abort', aborted); }
    assertRequestDeadline(signal, deadline);
  }

  function retryAfterDelay(header) {
    // NCBI does not promise this header. RFC delay-seconds or the three HTTP-date
    // forms are accepted; malformed/missing values use conservative local backoff.
    if (typeof header !== 'string') return 1000;
    const value = header.trim();
    if (/^\d+$/.test(value)) {
      if (value.length > 128) return Number.POSITIVE_INFINITY;
      const seconds = Number(value);
      return Number.isSafeInteger(seconds) && seconds <= Math.floor(Number.MAX_SAFE_INTEGER / 1000) ? seconds * 1000 : Number.POSITIVE_INFINITY;
    }
    if (value.length > 128) return 1000;
    // RFC9110 section5.6.7: validate components before calculating UTC.
    // Date.parse silently normalizes nonexistent dates and ignores weekdays.
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const longDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    let match, weekday, day, month, year, hour, minute, second, obsolete = false;
    if ((match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value))) {
      [,weekday,day,month,year,hour,minute,second] = match;
    } else if ((match = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value))) {
      [,weekday,day,month,year,hour,minute,second] = match; obsolete = true;
    } else if ((match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) ([A-Z][a-z]{2}) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(value))) {
      [,weekday,month,day,hour,minute,second,year] = match;
    } else return 1000;
    [day,year,hour,minute,second] = [day,year,hour,minute,second].map(Number);
    const monthIndex = months.indexOf(month);
    if (monthIndex < 0 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return 1000;
    const current = new Date(now());
    const futureLimit = new Date(now()); futureLimit.setUTCFullYear(current.getUTCFullYear()+50);
    if (obsolete) year += Math.floor(futureLimit.getUTCFullYear()/100)*100;
    const date = new Date(0);
    date.setUTCFullYear(year,monthIndex,day); date.setUTCHours(hour,minute,Math.min(second,59),0);
    const leapCarry = second === 60 ? 1000 : 0;
    if (obsolete && date.getTime() + leapCarry > futureLimit.getTime()) { year -= 100; date.setUTCFullYear(year,monthIndex,day); }
    if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day ||
        (obsolete ? longDays : days)[date.getUTCDay()] !== weekday) return 1000;
    // HTTP permits second60. Represent it at the following UTC second, never
    // before the stated instant. This does not certify an announced leap event.
    const time = date.getTime() + leapCarry;
    return Number.isFinite(time) ? Math.max(0,time-now()) : 1000;
  }

  function request(url, expectedFormat) {
    // Registry-local identity includes the complete URL and fixed transport contract.
    const key = JSON.stringify([String(url), expectedFormat, 'GET', 'error', expectedFormat === 'json' ? 'application/json' : 'application/xml,text/xml']);
    let entry = inFlightRequests.get(key);
    const fresh = !entry;
    if (fresh) {
      entry = { controller: new AbortController(), subscribers: new Set(), closed: false };
      inFlightRequests.set(key, entry);
    }
    const result = new Promise((resolve, reject) => {
      const subscriber = { resolve, reject, deadline: now() + config.requestTimeoutMs, timer: null };
      entry.subscribers.add(subscriber);
      subscriber.timer = setTimeout(() => {
        if (!entry.subscribers.delete(subscriber)) return;
        reject(new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed did not respond before the request timeout.'));
        if (!entry.subscribers.size) {
          entry.closed = true;
          if (inFlightRequests.get(key) === entry) inFlightRequests.delete(key);
          entry.controller.abort();
        }
      }, config.requestTimeoutMs);
    });
    if (fresh) {
      const deadline = () => Math.max(...[...entry.subscribers].map(item => item.deadline));
      requestTransport(url, expectedFormat, entry.controller, deadline).then(
        value => finish(null, value), error => finish(error)
      );
      function finish(error, value) {
        entry.closed = true;
        if (inFlightRequests.get(key) === entry) inFlightRequests.delete(key);
        for (const subscriber of entry.subscribers) {
          clearTimeout(subscriber.timer);
          if (now() >= subscriber.deadline) subscriber.reject(new PubMedResearchError('PUBMED_TIMEOUT', 'PubMed did not respond before the request timeout.'));
          else if (error) subscriber.reject(error);
          else subscriber.resolve(value);
        }
        entry.subscribers.clear();
      }
    }
    return result;
  }

  async function requestTransport(url, expectedFormat, controller, deadline) {
    let acquired = false;
    try {
      await acquireRequestPermit(controller.signal, deadline); acquired = true;
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const admitted = await waitForRateLimit(() => fetchImpl(url, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { accept: expectedFormat === 'json' ? 'application/json' : 'application/xml,text/xml' }
        }), controller.signal, deadline);
        response = await admitted.response;
        assertRequestDeadline(controller.signal, deadline);
        if (response?.status !== 429) break;
        const delay = Math.max(1000, retryAfterDelay(response.headers?.get?.('retry-after')));
        // Keep the full valid server delay for OTHER starts. A hint over the
        // local 5s retry budget rejects this request, never retries prematurely.
        // Unsupported numeric delay blocks this registry until a new instance;
        // never multiply an unsafe value or schedule an enormous timeout.
        const requestedUntil = now() + delay;
        cooldownUntil = Math.max(cooldownUntil, Number.isSafeInteger(requestedUntil) ? requestedUntil : Number.POSITIVE_INFINITY);
        try { await response.body?.cancel?.(); } catch { /* discard error body */ }
        if (attempt === 2 || delay > 5000) throw new PubMedResearchError('PUBMED_HTTP_ERROR', 'PubMed returned HTTP 429; bounded retry policy exhausted or server delay exceeds the retry budget.');
      }
      if (!response || response.ok !== true) throw new PubMedResearchError('PUBMED_HTTP_ERROR', `PubMed returned HTTP ${response?.status ?? 'unknown'}.`);
      const contentType = response.headers?.get?.('content-type');
      if (contentType) {
        const expected = expectedFormat === 'json' ? /(?:application|text)\/json/i : /(?:application|text)\/(?:xml|plain\+xml)/i;
        if (!expected.test(contentType)) throw new PubMedResearchError('PUBMED_FORMAT_ERROR', 'PubMed returned an unexpected content type.');
      }
      const body = await readBoundedText(response, config.maxResponseBytes);
      assertRequestDeadline(controller.signal, deadline);
      if (!body.trim()) throw new PubMedResearchError('PUBMED_EMPTY_RESPONSE', 'PubMed returned an empty response.');
      return body;
    } catch (error) {
      if (error instanceof PubMedResearchError) throw error;
      const timedOut = error?.name === 'AbortError' || controller.signal.aborted;
      throw new PubMedResearchError(timedOut ? 'PUBMED_TIMEOUT' : 'PUBMED_NETWORK_ERROR', timedOut ? 'PubMed did not respond before the request timeout.' : 'PubMed could not be reached. No source batch was registered.');
    } finally {
      if (acquired) releaseRequestPermit();
    }
  }

  async function waitForRateLimit(startRequest, signal, deadline) {
    // All ESearch, EFetch and retries share one start queue and cooldown.
    const admission = admissionTail.then(async () => {
      while (true) {
        assertRequestDeadline(signal, deadline);
        const waitMs = Math.max(lastRequestAt + config.minRequestIntervalMs, cooldownUntil) - now();
        if (waitMs <= 0) break;
        await sleepUntilAdmission(waitMs, signal, deadline);
      }
      assertRequestDeadline(signal, deadline);
      lastRequestAt = now();
      return { response: startRequest() };
    });
    admissionTail = admission.catch(() => {});
    return await admission;
  }

  async function search({ queries, maxResultsPerQuery = config.maxResultsPerQuery, broadenEmpty = false } = {}) {
    const validatedQueries = validateQueries(queries, config.maxBatchQueries);
    if (!Number.isSafeInteger(maxResultsPerQuery) || maxResultsPerQuery < 1 || maxResultsPerQuery > config.maxAllowedResultsPerQuery) {
      throw new PubMedResearchError('INVALID_LIMIT', `maxResultsPerQuery must be between 1 and ${config.maxAllowedResultsPerQuery}.`);
    }
    const createdAt = now();
    const expiresAt = createdAt + config.batchTtlMs;
    const recordsById = new Map();
    const blockedById = new Map();
    const queryResults = [];

    try {
      // Search each controlled category freshly; fetch each unique PMID once
      // within this batch. Cached query records remain opt-in and conflict-checked.
      const pending = new Array(validatedQueries.length);
      const uniqueIds = new Set();
      // Share identical searches only within this batch; later plans search afresh.
      const batchSearches = new Map();
      let nextIndex = 0;
      let fatalError = null;
      async function worker() {
        while (!fatalError && nextIndex < validatedQueries.length) {
          const index = nextIndex++;
          const entry = validatedQueries[index];
          try {
            const key = makeCacheKey(entry.compiledQuery, maxResultsPerQuery);
            const cached = getFreshCache(key, createdAt);
            if (!cached && !batchSearches.has(key)) batchSearches.set(key, searchIds(entry.compiledQuery, maxResultsPerQuery));
            let searchedIds = cached ? null : await batchSearches.get(key);
            let effectiveQuery = entry.compiledQuery;
            let searchTier = 'exact-context';
            // A category plus every literal context word is often too narrow.
            // Keep the controlled modality/category anchors, and make one
            // bounded broader search within this same request when it is empty.
            if (broadenEmpty && !cached && searchedIds.length === 0 && entry.query.trim().split(/\s+/u).length > 1) {
              effectiveQuery = buildPubMedCategoryQuery(entry.category, entry.query.trim().split(/\s+/u)[0]);
              const fallbackKey = makeCacheKey(effectiveQuery, maxResultsPerQuery);
              if (!batchSearches.has(fallbackKey)) batchSearches.set(fallbackKey, searchIds(effectiveQuery, maxResultsPerQuery));
              searchedIds = await batchSearches.get(fallbackKey);
              searchTier = 'first-context-term';
            }
            pending[index] = { ...entry, compiledQuery: effectiveQuery, searchTier, key, cached, searchedIds };
          } catch (error) {
            if (!fatalError) fatalError = error;
          }
        }
      }
      // Workers stop scheduling after failure and settle subscriber reads. A noncooperative
      // physical transport can remain pending and keeps its permit until real settlement.
      await Promise.all(Array.from({ length: Math.min(3, validatedQueries.length) }, worker));
      if (fatalError) throw fatalError;
      for (const { searchedIds } of pending) for (const id of searchedIds || []) uniqueIds.add(id);
      const freshRecords = uniqueIds.size ? await fetchRecords([...uniqueIds]) : [];
      const freshById = new Map(freshRecords.map(record => [record.pmid, record]));
      const cacheWrites = [];
      for (const { category, query, compiledQuery, searchTier, key, cached, searchedIds } of pending) {
        const result = cached || { records: searchedIds.map(id => freshById.get(id)) };
        if (!cached && searchTier === 'exact-context' && config.searchCacheTtlMs > 0) cacheWrites.push([key, result]);
        const ids = [];
        const excludedBlockedSources = [];
        for (const record of result.records) {
          // Never offer retracted, erratum, editorial etc. as candidate evidence;
          // the plan validator would reject them later anyway.
          const seenBlocked = blockedById.get(record.pmid);
          if (seenBlocked && !recordsMatch(seenBlocked, record)) {
            throw new PubMedResearchError('PUBMED_RECORD_CONFLICT', 'PubMed returned inconsistent metadata for the same PMID.');
          }
          const blockedType = findBlockedPublicationType(record.publicationTypes);
          if (blockedType) {
            const earlier = recordsById.get(record.pmid);
            if (earlier && !recordsMatch(earlier, record)) throw new PubMedResearchError('PUBMED_RECORD_CONFLICT', 'PubMed returned inconsistent metadata for the same PMID.');
            blockedById.set(record.pmid, record);
            excludedBlockedSources.push({ sourceId: `pubmed:${record.pmid}`, publicationType: blockedType });
            continue;
          }
          const existing = recordsById.get(record.pmid);
          if (existing) {
            if (!recordsMatch(existing, record)) {
              throw new PubMedResearchError('PUBMED_RECORD_CONFLICT', 'PubMed returned inconsistent metadata for the same PMID.');
            }
            if (!existing.matchedCategories.includes(category)) existing.matchedCategories.push(category);
          } else {
            recordsById.set(record.pmid, { ...record, matchedCategories: [category] });
          }
          ids.push(`pubmed:${record.pmid}`);
        }
        queryResults.push({ category, context: query, query: compiledQuery, searchTier, sourceIds: ids, ...(excludedBlockedSources.length ? { excludedBlockedSources } : {}) });
      }
      // No partial cache mutation on a later category/record conflict.
      for (const [key, value] of cacheWrites) setCache(key, value, createdAt + config.searchCacheTtlMs);
    } catch (error) {
      if (error instanceof PubMedResearchError) throw error;
      throw new PubMedResearchError('PUBMED_INVALID_RESPONSE', 'PubMed returned data that could not be validated.');
    }

    const batchId = randomUUID();
    const batch = {
      batchId,
      createdAt,
      expiresAt,
      queries: queryResults,
      sources: [...recordsById.values()].map(publicRecord)
    };
    freezeJson(batch);
    batches.set(batchId, batch);
    batchRevisions.set(batch, nextBatchRevision++);
    trimBatches();
    pruneExpired(now());
    persistBatches();
    return clone(batch);
  }

  function verifyCitation({ batchId, sourceId, title, year, url, category } = {}) {
    pruneExpired(now());
    const batch = typeof batchId === 'string' ? batches.get(batchId) : undefined;
    if (!batch) return { valid: false, reason: 'unknown_or_expired_batch' };
    if (typeof sourceId !== 'string' || !/^pubmed:\d{1,12}$/.test(sourceId)) {
      return { valid: false, reason: 'invalid_source_id' };
    }
    const pmid = sourceId.slice('pubmed:'.length);
    const source = batch.sources.find((item) => item.pmid === pmid);
    if (!source) return { valid: false, reason: 'source_not_in_batch' };
    if (typeof title !== 'string' || normalizeTitle(title) !== normalizeTitle(source.title)) {
      return { valid: false, reason: 'title_mismatch' };
    }
    if (!isMatchingYear(year, source.year)) return { valid: false, reason: 'year_mismatch' };
    if (!isMatchingPubMedUrl(url, pmid)) return { valid: false, reason: 'url_mismatch' };
    if (typeof category !== 'string' || !source.matchedCategories.includes(category)) {
      return { valid: false, reason: 'category_not_searched_in_batch' };
    }
    return { valid: true, source: clone(source) };
  }

  function getBatch(batchId) {
    pruneExpired(now());
    const batch = batches.get(batchId);
    return batch ? clone(batch) : null;
  }

  function getCitationBatchRevision(batchId) {
    const batch = typeof batchId === 'string' ? batches.get(batchId) : undefined;
    if (!batch) return null;
    if (batch.expiresAt <= now()) {
      batches.delete(batchId);
      return null;
    }
    return batchRevisions.get(batch) ?? null;
  }

  function clearExpired() {
    const before = batches.size + searchCache.size;
    pruneExpired(now());
    for (const [key, entry] of searchCache) if (entry.expiresAt <= now()) searchCache.delete(key);
    return before - batches.size - searchCache.size;
  }

  function getFreshCache(key, timestamp) {
    const entry = searchCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= timestamp) {
      searchCache.delete(key);
      return null;
    }
    searchCache.delete(key);
    searchCache.set(key, entry);
    return clone(entry.value);
  }

  function setCache(key, value, expiresAt) {
    searchCache.delete(key);
    searchCache.set(key, { value: clone(value), expiresAt });
    while (searchCache.size > config.maxCachedQueries) searchCache.delete(searchCache.keys().next().value);
    persistBatches();
  }

  function pruneExpired(timestamp) {
    for (const [batchId, batch] of batches) if (batch.expiresAt <= timestamp) batches.delete(batchId);
    for (const [key, entry] of searchCache) if (entry.expiresAt <= timestamp) searchCache.delete(key);
  }

  function trimBatches() {
    while (batches.size > config.maxRetainedBatches) batches.delete(batches.keys().next().value);
  }

  async function searchIds(query, maxResults) {
    const searchUrl = new URL('esearch.fcgi', EUTILS_BASE);
    searchUrl.search = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmode: 'json',
      retmax: String(maxResults),
      sort: 'relevance',
      tool: 'gm_coach_training_research'
    }).toString();
    const searchText = await request(searchUrl.href, 'json');
    let searchPayload;
    try { searchPayload = JSON.parse(searchText); }
    catch { throw new PubMedResearchError('PUBMED_INVALID_SEARCH_RESPONSE', 'PubMed search response was not valid JSON.'); }
    // A syntactically valid idlist does not override a reported query error.
    // WarningList is separate and may accompany a valid search result.
    const hasReportedError = value => {
      if (value == null || value === '') return false;
      if (Array.isArray(value)) return value.some(hasReportedError);
      if (typeof value === 'object') return Object.values(value).some(hasReportedError);
      return true;
    };
    if (hasReportedError(searchPayload?.error) || hasReportedError(searchPayload?.esearchresult?.error) || hasReportedError(searchPayload?.esearchresult?.errorlist)) {
      throw new PubMedResearchError('PUBMED_INVALID_SEARCH_RESPONSE', 'PubMed reported a search error despite its PMID list.');
    }
    const ids = searchPayload?.esearchresult?.idlist;
    if (!Array.isArray(ids) || ids.length > maxResults || ids.some((id) => typeof id !== 'string' || !/^\d{1,12}$/.test(id))) {
      throw new PubMedResearchError('PUBMED_INVALID_SEARCH_RESPONSE', 'PubMed search response did not contain a valid PMID list.');
    }
    if (new Set(ids).size !== ids.length) throw new PubMedResearchError('PUBMED_INVALID_SEARCH_RESPONSE', 'PubMed returned duplicate PMIDs.');
    return ids;
  }

  async function fetchRecords(ids) {
    const fetchUrl = new URL('efetch.fcgi', EUTILS_BASE);
    fetchUrl.search = new URLSearchParams({
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'xml',
      rettype: 'abstract',
      tool: 'gm_coach_training_research'
    }).toString();
    const xml = await request(fetchUrl.href, 'xml');
    const records = parsePubMedArticles(xml, config.maxAbstractChars);
    const parsedIds = records.map(({ pmid }) => pmid);
    if (parsedIds.length !== ids.length || new Set(parsedIds).size !== parsedIds.length || ids.some((id) => !parsedIds.includes(id))) {
      throw new PubMedResearchError('PUBMED_INCOMPLETE_FETCH', 'PubMed fetched records did not exactly match the searched PMID list.');
    }
    return records;
  }

  return Object.freeze({ search, verifyCitation, getBatch, getCitationBatchRevision, clearExpired });
}

export class PubMedResearchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PubMedResearchError';
    this.code = code;
  }
}

export function findBlockedPublicationType(publicationTypes) {
  if (!Array.isArray(publicationTypes)) return null;
  const blockedTypes = new Set([
    'retracted publication',
    'retraction of publication',
    'expression of concern',
    // These PubMed publication types are not themselves reports of original
    // training research or evidence syntheses. A matching abstract is not
    // enough to make an editorial, comment, or letter an appropriate basis
    // for an applied programming decision.
    'editorial',
    'comment',
    'letter',
    'news',
    'newspaper article',
    'interview',
    'book review',
    'biography',
    'autobiography',
    'published erratum',
    'duplicate publication'
  ]);
  return publicationTypes.find((type) => typeof type === 'string' && blockedTypes.has(type.trim().toLocaleLowerCase('en-US'))) ?? null;
}

function validateQueries(queries, maxBatchQueries) {
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > maxBatchQueries) {
    throw new PubMedResearchError('INVALID_QUERIES', `queries must contain between 1 and ${maxBatchQueries} category/query pairs.`);
  }
  return queries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new PubMedResearchError('INVALID_QUERY', `Query ${index + 1} must be an object.`);
    const category = typeof entry.category === 'string' ? entry.category.trim() : '';
    const query = typeof entry.query === 'string' ? entry.query.trim() : '';
    if (!TRAINING_EVIDENCE_CATEGORIES.includes(category)) throw new PubMedResearchError('INVALID_CATEGORY', `Query ${index + 1} has an unsupported training-evidence category.`);
    if (!query || query.length > 300 || /[\u0000-\u001f\u007f]/.test(query)) throw new PubMedResearchError('INVALID_QUERY', `Query ${index + 1} must be 1–300 printable characters.`);
    const compiledQuery = buildPubMedCategoryQuery(category, query);
    return { category, query, compiledQuery };
  });
}

export function buildPubMedCategoryQuery(category, goalContext) {
  if (!TRAINING_EVIDENCE_CATEGORIES.includes(category) || !CATEGORY_QUERY_ANCHORS[category]) {
    throw new PubMedResearchError('INVALID_CATEGORY', 'A controlled PubMed query is not defined for this evidence category.');
  }
  if (typeof goalContext !== 'string' || goalContext.length > 300 || /[\u0000-\u001f\u007f]/.test(goalContext)) {
    throw new PubMedResearchError('INVALID_QUERY', 'Goal context must be up to 300 printable characters.');
  }
  const terms = goalContext.trim().split(/\s+/u).filter(Boolean);
  if (terms.length < 1 || terms.length > 12 || terms.some((term) => !/^[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*$/u.test(term) || /^(?:AND|OR|NOT)$/iu.test(term))) {
    throw new PubMedResearchError('INVALID_QUERY', 'Podaj od 1 do 12 prostych słów kontekstu celu; operatory PubMed, tagi pól i symbole wieloznaczne są blokowane.');
  }
  const contextTerms = terms.map((term) => `"${term}"[Title/Abstract]`).join(' AND ');
  const modalityQuery = AEROBIC_EVIDENCE_CATEGORIES.has(category)
    ? AEROBIC_TRAINING_QUERY
    : RESISTANCE_TRAINING_QUERY;
  return `(${modalityQuery}) AND (${CATEGORY_QUERY_ANCHORS[category]}) AND (${contextTerms})`;
}

function makeCacheKey(query, maxResults) {
  return `${maxResults}\u0000${query.replace(/\s+/g, ' ').trim()}`;
}

function parsePubMedArticles(xml, maxAbstractChars) {
  if (!/<PubmedArticleSet\b/i.test(xml)) throw new PubMedResearchError('PUBMED_INVALID_FETCH_RESPONSE', 'PubMed XML did not contain a PubmedArticleSet.');
  const blocks = [...xml.matchAll(/<PubmedArticle\b[^>]*>[\s\S]*?<\/PubmedArticle>/gi)].map((match) => match[0]);
  return blocks.map((block) => {
    const citation = extractBlock(block, 'MedlineCitation');
    const article = extractBlock(citation, 'Article');
    const pmid = cleanXmlText(extractBlock(citation, 'PMID'));
    const title = cleanXmlText(extractBlock(article, 'ArticleTitle'));
    if (!/^\d{1,12}$/.test(pmid) || !title || title.length > 1600) {
      throw new PubMedResearchError('PUBMED_INVALID_ARTICLE', 'PubMed returned a record without a valid PMID or title.');
    }
    const journalBlock = extractBlock(article, 'Journal');
    const pubDateBlock = extractBlock(journalBlock, 'PubDate');
    const articleDateBlock = extractBlock(article, 'ArticleDate');
    const year = extractYear(pubDateBlock) ?? extractYear(articleDateBlock);
    const pubTypesBlock = extractBlock(article, 'PublicationTypeList');
    const publicationTypes = [...pubTypesBlock.matchAll(/<PublicationType\b[^>]*>([\s\S]*?)<\/PublicationType>/gi)]
      .map((match) => cleanXmlText(match[1])).filter(Boolean).slice(0, 20);
    const abstractBlock = extractBlock(article, 'Abstract');
    const abstractParts = [...abstractBlock.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi)]
      .map((match) => {
        const label = match[1].match(/\bLabel\s*=\s*["']([^"']*)["']/i)?.[1];
        const text = cleanXmlText(match[2]);
        return text ? `${label ? `${cleanXmlText(label)}: ` : ''}${text}` : '';
      }).filter(Boolean);
    const abstract = abstractParts.join('\n').slice(0, maxAbstractChars) || null;
    return {
      pmid,
      title,
      year,
      publicationDate: year ? String(year) : null,
      journal: cleanXmlText(extractBlock(journalBlock, 'Title')) || null,
      publicationTypes,
      abstract,
      url: `${PUBMED_BASE}${pmid}/`
    };
  });
}

function extractBlock(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))?.[1] ?? '';
}

function cleanXmlText(value) {
  return decodeXmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    const lower = code.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const number = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    if (!Number.isSafeInteger(number) || number < 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return entity;
    try { return String.fromCodePoint(number); } catch { return entity; }
  });
}

function extractYear(block) {
  const explicitYear = cleanXmlText(extractBlock(block, 'Year'));
  if (/^(?:18|19|20|21)\d{2}$/.test(explicitYear)) return Number(explicitYear);
  const medlineDate = cleanXmlText(extractBlock(block, 'MedlineDate'));
  const fallback = medlineDate.match(/\b(?:18|19|20|21)\d{2}\b/);
  return fallback ? Number(fallback[0]) : null;
}

function publicRecord(record) {
  const { pmid, title, year, publicationDate, journal, publicationTypes, abstract, url, matchedCategories } = record;
  return {
    id: `pubmed:${pmid}`,
    pmid,
    title,
    year,
    publicationDate,
    journal,
    publicationTypes: [...publicationTypes],
    abstract,
    hasAbstract: abstract !== null,
    url,
    matchedCategories: [...matchedCategories]
  };
}

function recordsMatch(left, right) {
  const typesKey = (record) => JSON.stringify([...record.publicationTypes].map(type => type.trim().toLowerCase()).sort());
  return left.pmid === right.pmid && left.title === right.title && left.year === right.year && left.url === right.url &&
    left.abstract === right.abstract && left.publicationDate === right.publicationDate && typesKey(left) === typesKey(right);
}

function normalizeTitle(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function isMatchingYear(value, actualYear) {
  const year = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return actualYear !== null && /^\d{4}$/.test(year) && Number(year) === actualYear;
}

function isMatchingPubMedUrl(value, pmid) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pubmed.ncbi.nlm.nih.gov' && !url.username && !url.password && !url.search && !url.hash && new RegExp(`^/${pmid}/?$`).test(url.pathname);
  } catch {
    return false;
  }
}

async function readBoundedText(response, maxBytes) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new PubMedResearchError('PUBMED_RESPONSE_TOO_LARGE', 'PubMed response exceeded the configured size limit.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock?.();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PubMedResearchError('PUBMED_RESPONSE_TOO_LARGE', 'PubMed response exceeded the configured size limit.');
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
