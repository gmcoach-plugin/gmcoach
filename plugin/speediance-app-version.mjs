// Speediance client version policy for the "Versioncode" request header.
//
// What the server does with the header (public clients and GM Coach live reads agree):
//   * API 98 "Please upgrade the APP version in System Setting": the declared code is below what the requested
//     content needs. The gate is per content (Vita needs 40400; 41000 exposes 1042 exercises) and older codes can
//     also receive less data without any error.
//   * API 1004 "Invalid nonce string": the declared code is rejected as implausibly high or as changing too
//     fast. labatt/speediance-mcp, another public Speediance MCP and the SmartGym manager stay on 41000 and warn that 42000+
//     and rapid changes are throttled. On 2026-11-05 the iOS-derived candidate 42400 returned 1004 while Android
//     4.24.00 only shipped on 2026-11-06.
// The previous policy followed the iOS App Store version, logged in with one code, read with another and
// alternated with a lower fallback. That is the pattern the public clients warn about, and an iOS number is not
// an Android Versioncode.
//
// Policy: one stable code per region for login and every request. It starts at the community baseline, rises
// only after the server answers 98, one real release anchor at a time, and falls back after a persistent 1004.
// Accepted codes are persisted so every process (chats, tunnel) declares the same value. A user can force any code.
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const APP_STORE_ID = 1612755038;
const LOOKUP_URL = 'https://itunes.apple.com/lookup?id=1612755038&country=us';
const LOOKUP_TIMEOUT_MS = 2500;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_STATE_BYTES = 16 * 1024;
const MIN_CODE = 10000;
const MAX_CODE = 99999;
const FLOOR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CEILING_TTL_MS = 6 * 60 * 60 * 1000;
const STORE_LOOKUP_TTL_MS = 60 * 60 * 1000;
const STORE_LOOKUP_FAILURE_TTL_MS = 10 * 60 * 1000;
const STRIKE_SPACING_MS = 30 * 1000;
const MAX_STRIKES = 3;
const RENAME_RETRIES = 3;
const TRANSIENT_FS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const REGION_KEYS = Object.freeze(['EU', 'Global', 'default']);

export const CLIENT_VERSION_ENV = 'GM_COACH_SPEEDIANCE_VERSIONCODE';
// Since 2026-11-07 the API requires a signed request scheme (Nonce header + signature, API 1004/1005) for every
// Versioncode above 41000; GM Coach cannot sign requests. Live probe: 41000 -> code 0, 41100..41600 -> 1004,
// 41600 with a Nonce header -> 1005 "Signature verification failed". The ladder therefore holds only 41000, and
// state persisted by older versions (for example current/accepted 41600) is clamped back on load.
export const MAX_UNSIGNED_VERSION_CODE = 41000;
export const CLIENT_VERSION_LADDER = Object.freeze([41000]);
// Release anchors above the signing threshold (4.16.00, 4.19.00, 4.23.00); kept for the negotiation tests and for
// a future signed client. Not used by default.
export const SIGNED_CLIENT_VERSION_ANCHORS = Object.freeze([41600, 41900, 42300]);
export const CLIENT_VERSION_BASELINE = CLIENT_VERSION_LADDER[0];
// One request may walk the whole ladder (three steps) and try one public store number (one more step).
export const MAX_CLIENT_VERSION_RETRIES = 4;

export function normalizeVersionCode(value) {
  const candidate = typeof value === 'string' && /^\d{5}$/.test(value.trim()) ? Number(value.trim()) : value;
  return Number.isSafeInteger(candidate) && candidate >= MIN_CODE && candidate <= MAX_CODE ? candidate : null;
}

export function versionCodeToName(code) {
  const major = Math.floor(code / 10000);
  const minor = Math.floor((code % 10000) / 100);
  const patch = code % 100;
  return major + '.' + String(minor).padStart(2, '0') + '.' + String(patch).padStart(2, '0');
}

function regionKey(region) {
  return region === 'EU' || region === 'Global' ? region : 'default';
}

function blankState(code) {
  return { current: code, accepted: null, floor: null, floorAt: null, ceiling: null, ceilingAt: null, changedAt: null, strikes: 0, strikeAt: null };
}

function persistedState(state) {
  return { current: state.current, accepted: state.accepted, floor: state.floor, floorAt: state.floorAt, ceiling: state.ceiling, ceilingAt: state.ceilingAt, changedAt: state.changedAt };
}

function sanitizeState(raw, fallbackCode, now, maxCode = MAX_UNSIGNED_VERSION_CODE) {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const stamp = value => (Number.isSafeInteger(value) && value > 0 && value <= now + 24 * 60 * 60 * 1000 ? value : null);
  const floorAt = stamp(record.floorAt);
  const ceilingAt = stamp(record.ceilingAt);
  const unsigned = value => { const code = normalizeVersionCode(value); return code !== null && (maxCode === null || code <= maxCode) ? code : null; };
  const state = blankState(unsigned(record.current) ?? fallbackCode);
  state.accepted = unsigned(record.accepted);
  // An observation without a valid timestamp could never expire, so it is dropped.
  state.floor = floorAt === null ? null : normalizeVersionCode(record.floor);
  state.floorAt = state.floor === null ? null : floorAt;
  state.ceiling = ceilingAt === null ? null : normalizeVersionCode(record.ceiling);
  state.ceilingAt = state.ceiling === null ? null : ceilingAt;
  state.changedAt = stamp(record.changedAt);
  return state;
}

function pauseMs(milliseconds) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); } catch { /* best effort */ }
}

const NODE_FS = Object.freeze({ lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync });

export function createFileClientVersionStore(filePath, { fsImpl = NODE_FS, sleep = pauseMs } = {}) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('A client version state file path is required.');
  return Object.freeze({
    stamp() {
      try {
        const info = fsImpl.statSync(filePath);
        return info.mtimeMs + ':' + info.size;
      } catch { return null; }
    },
    // null: no usable state (missing, oversized or damaged). undefined: the file cannot be read right now
    // (for example a lock held by an antivirus scan), so the caller keeps what it already knows.
    read() {
      let text;
      try { text = fsImpl.readFileSync(filePath, 'utf8'); }
      catch (error) { return error?.code === 'ENOENT' ? null : undefined; }
      if (text.length > MAX_STATE_BYTES) return null;
      try {
        const data = JSON.parse(text);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      } catch { return null; }
    },
    write(data) {
      try {
        if (fsImpl.lstatSync(filePath).isSymbolicLink()) throw new Error('The client version state file is a symbolic link.');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporary = filePath + '.' + process.pid + '.' + randomBytes(4).toString('hex') + '.tmp';
      fsImpl.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      for (let attempt = 0; ; attempt++) {
        try { fsImpl.renameSync(temporary, filePath); return; }
        catch (error) {
          if (attempt < RENAME_RETRIES && TRANSIENT_FS_CODES.has(error?.code)) { sleep(20 * (attempt + 1)); continue; }
          try { fsImpl.unlinkSync(temporary); } catch { /* best effort */ }
          throw error;
        }
      }
    }
  });
}

export function createSpeedianceClientVersionPolicy({
  ladder = CLIENT_VERSION_LADDER,
  now = () => Date.now(),
  env = process.env,
  store = null,
  lookupStoreCandidate = null,
  maxCode = MAX_UNSIGNED_VERSION_CODE
} = {}) {
  const rungs = Object.freeze([...new Set([...ladder].map(normalizeVersionCode).filter(code => code !== null && (maxCode === null || code <= maxCode)))].sort((a, b) => a - b));
  if (!rungs.length) throw new TypeError('The client version ladder needs at least one valid Versioncode.');
  if (typeof now !== 'function') throw new TypeError('Invalid client version clock.');
  const top = rungs[rungs.length - 1];
  let regions = new Map();
  let attachedStore = store;
  let seenStamp = null;
  let persistedOverride = null;
  let lookupMemo = null;

  function load() {
    if (!attachedStore) return;
    const stamp = attachedStore.stamp();
    if (stamp === seenStamp) return;
    const data = attachedStore.read();
    if (data === undefined) return;
    seenStamp = stamp;
    regions = new Map();
    persistedOverride = data ? normalizeVersionCode(data.override) : null;
    if (!data || data.schema !== 1) return;
    const stored = data.regions && typeof data.regions === 'object' && !Array.isArray(data.regions) ? data.regions : {};
    for (const key of REGION_KEYS) if (Object.hasOwn(stored, key)) regions.set(key, sanitizeState(stored[key], rungs[0], now(), maxCode));
  }

  function save() {
    if (!attachedStore) return;
    try {
      const output = { schema: 1, regions: Object.fromEntries([...regions].map(([key, state]) => [key, persistedState(state)])) };
      if (persistedOverride !== null) output.override = persistedOverride;
      attachedStore.write(output);
      seenStamp = attachedStore.stamp();
    } catch { /* The state is advisory; requests never fail because it cannot be written. */ }
  }

  function forcedCode() {
    return normalizeVersionCode(env?.[CLIENT_VERSION_ENV]) ?? persistedOverride;
  }

  function stateFor(region) {
    const key = regionKey(region);
    let state = regions.get(key);
    if (!state) {
      state = blankState(rungs[0]);
      regions.set(key, state);
    }
    const moment = now();
    if (state.floorAt !== null && moment - state.floorAt > FLOOR_TTL_MS) { state.floor = null; state.floorAt = null; }
    if (state.ceilingAt !== null && moment - state.ceilingAt > CEILING_TTL_MS) { state.ceiling = null; state.ceilingAt = null; }
    return state;
  }

  const describe = (code, source) => Object.freeze({ version: versionCodeToName(code), versionCode: code, source });

  function requestVersion({ region } = {}) {
    load();
    const forced = forcedCode();
    if (forced !== null) return describe(forced, 'user-override');
    const state = stateFor(region);
    return describe(state.current, state.accepted === state.current ? 'accepted-by-api' : state.current === rungs[0] ? 'community-baseline' : 'negotiated');
  }

  function recordAccepted(region, versionCode) {
    load();
    if (forcedCode() !== null) return false;
    const state = stateFor(region);
    if (versionCode !== state.current) return false;
    state.strikes = 0;
    state.strikeAt = null;
    if (state.accepted === versionCode) return false;
    state.accepted = versionCode;
    if (state.ceiling !== null && versionCode >= state.ceiling) { state.ceiling = null; state.ceilingAt = null; }
    save();
    return true;
  }

  // API 98: the declared code is too low. Move to the next anchor above every code that returned 98 and below
  // every code that returned 1004. Returns null when no safe code is left.
  function recordTooLow(region, failedCode) {
    load();
    if (forcedCode() !== null) return null;
    const state = stateFor(region);
    if (state.current > failedCode) return { versionCode: state.current, previous: failedCode, changed: false };
    state.floor = Math.max(state.floor ?? 0, failedCode);
    state.floorAt = now();
    const next = rungs.find(code => code > state.floor && (state.ceiling === null || code < state.ceiling));
    if (next === undefined) { save(); return null; }
    state.current = next;
    state.changedAt = now();
    save();
    return { versionCode: next, previous: failedCode, changed: true };
  }

  // API 1004: the declared code is rejected as implausible. A code the API already accepted is more likely throttled
  // for a moment than withdrawn, so it is kept until the rejection persists for a minute or more. Otherwise return
  // to the best known working code.
  function recordRejectedHigh(region, failedCode) {
    load();
    if (forcedCode() !== null) return null;
    const state = stateFor(region);
    // A late answer for a code that is no longer in use: the request is simply repeated with the current code.
    if (state.current !== failedCode) return { versionCode: state.current, previous: failedCode, changed: false };
    if (state.accepted === failedCode) {
      const moment = now();
      if (state.strikeAt === null || moment - state.strikeAt >= STRIKE_SPACING_MS) { state.strikes += 1; state.strikeAt = moment; }
      if (state.strikes < MAX_STRIKES) return { versionCode: failedCode, previous: failedCode, changed: false, transient: true };
    }
    if (failedCode > rungs[0]) { state.ceiling = Math.min(state.ceiling ?? failedCode, failedCode); state.ceilingAt = now(); }
    // A code that is now rejected is no longer an accepted one.
    if (state.accepted !== null && state.accepted >= failedCode) state.accepted = null;
    // Best known fallback: the highest code below the rejected one that the API processed, either with code 0 or with
    // the 98 answer of the version gate. A login confirmation at the baseline must not hide a higher processed anchor.
    const processed = [state.accepted, state.floor].filter(code => code !== null && code < failedCode);
    let target = processed.length ? Math.max(...processed) : null;
    if (target === null) {
      const lower = rungs.filter(code => code < failedCode);
      target = lower.length ? lower[lower.length - 1] : null;
    }
    if (target === null) { save(); return null; }
    state.current = target;
    state.changedAt = now();
    save();
    return { versionCode: target, previous: failedCode, changed: true };
  }

  // One lookup at a time and one answer per hour (ten minutes after a failure), however many reads fail together.
  function lookupOnce() {
    const moment = now();
    if (lookupMemo && moment - lookupMemo.at < lookupMemo.ttl) return lookupMemo.promise;
    const entry = { at: moment, ttl: STORE_LOOKUP_TTL_MS, promise: null };
    entry.promise = Promise.resolve().then(() => lookupStoreCandidate()).then(found => {
      if (normalizeVersionCode(found?.versionCode) === null) entry.ttl = STORE_LOOKUP_FAILURE_TTL_MS;
      return found;
    }, () => { entry.ttl = STORE_LOOKUP_FAILURE_TTL_MS; return null; });
    lookupMemo = entry;
    return entry.promise;
  }

  // Only after every anchor answered 98: try the current public store number once. It can be ahead of the Android
  // release (1004 then returns to the last good code and the number is not tried again for several hours).
  async function proposeStoreCandidate(region, failedCode) {
    load();
    if (forcedCode() !== null || typeof lookupStoreCandidate !== 'function' || failedCode < top || (maxCode !== null && failedCode >= maxCode)) return null;
    const found = await lookupOnce();
    const candidate = normalizeVersionCode(found?.versionCode);
    const state = stateFor(region);
    if (state.current > failedCode) return { versionCode: state.current, previous: failedCode, changed: false };
    if (candidate === null || candidate <= failedCode || (maxCode !== null && candidate > maxCode) || (state.ceiling !== null && candidate >= state.ceiling)) return null;
    state.current = candidate;
    state.changedAt = now();
    save();
    return { versionCode: candidate, previous: failedCode, changed: true, source: 'app-store-candidate' };
  }

  function summary(region) {
    const declared = requestVersion({ region });
    const state = stateFor(region);
    return { version: declared.version, versionCode: declared.versionCode, source: declared.source, accepted: state.accepted, tooLowAt: state.floor, rejectedAt: state.ceiling };
  }

  function diagnostics() {
    load();
    const report = { baseline: rungs[0], ladder: [...rungs], override: forcedCode(), persisted: attachedStore !== null, regions: {} };
    for (const [key, state] of regions) report.regions[key] = { current: state.current, accepted: state.accepted, tooLowAt: state.floor, rejectedAt: state.ceiling, changedAt: state.changedAt };
    return report;
  }

  function attachStore(nextStore) {
    attachedStore = nextStore ?? null;
    seenStamp = null;
    regions = new Map();
    persistedOverride = null;
    load();
  }

  const describeRejection = details => describeClientVersionRejection({ ladder: rungs, ...details });

  return Object.freeze({ requestVersion, recordAccepted, recordTooLow, recordRejectedHigh, proposeStoreCandidate, summary, diagnostics, attachStore, describeRejection, ladder: rungs });
}

export function describeClientVersionRejection({ apiCode, declared, change = null, operation = 'read', apiMessage = '', limits = null, ladder = CLIENT_VERSION_LADDER } = {}) {
  const noun = operation === 'write' ? 'zapis' : operation === 'login' ? 'logowanie' : 'odczyt';
  const shownMessage = typeof apiMessage === 'string' ? apiMessage.replace(/[.\s]+$/, '') : '';
  const detail = shownMessage ? ' Komunikat Speediance: ' + shownMessage + '.' : '';
  const forcedHint = 'Kod można wymusić polem "override" w pliku speediance-client-version.json (katalog danych GM Coach) albo zmienną środowiskową ' + CLIENT_VERSION_ENV + ' (na własne ryzyko).';
  const forcedNow = limits?.source === 'user-override';
  const rejectedAbove = Number.isSafeInteger(limits?.rejectedAt) ? ' Wyższy kod ' + limits.rejectedAt + ' serwer odrzucił jako „Invalid nonce string” (API 1004).' : '';
  const adopted = change && change.versionCode !== declared;
  const notReplayed = ' dla kolejnych żądań, ale nie powtórzył zapisu.';
  const overrideTail = ' Wymuszony Versioncode ' + declared + ' jest odrzucany przez serwer. Zmień albo usuń wymuszenie (pole "override" w speediance-client-version.json lub zmienna ' + CLIENT_VERSION_ENV + ').';
  if (apiCode === 98) {
    let tail;
    if (adopted) tail = operation === 'write' ? ' GM Coach zapamiętał Versioncode ' + change.versionCode + notReplayed : ' GM Coach podniósł Versioncode do ' + change.versionCode + '; ponów żądanie.';
    else if (change) tail = ' GM Coach używa już Versioncode ' + change.versionCode + '; ponów żądanie.';
    else if (forcedNow) tail = overrideTail;
    else tail = ' GM Coach nie ma wyższego kodu do wypróbowania (drabina: ' + ladder.join(', ') + ').' + rejectedAbove + ' Kody powyżej ' + MAX_UNSIGNED_VERSION_CODE + ' wymagają obecnie podpisanych żądań, których GM Coach nie obsługuje; serwer odrzuca je jako „Invalid nonce string” (API 1004), dlatego GM Coach nie wymyśla ich sam. ' + forcedHint;
    return { code: 'SPEEDIANCE_APP_VERSION_REQUIRED', message: 'Speediance odrzuciło ' + noun + ' kodem API 98 (wymagana nowsza wersja aplikacji) przy Versioncode ' + declared + '.' + detail + tail };
  }
  let tail;
  if (change?.transient) tail = ' Ten kod był wcześniej akceptowany, więc to prawdopodobnie czasowe ograniczenie serwera. GM Coach nie zmienił kodu; spróbuj ponownie za kilka minut.';
  else if (adopted) tail = operation === 'write' ? ' GM Coach wrócił do Versioncode ' + change.versionCode + notReplayed : ' GM Coach wrócił do Versioncode ' + change.versionCode + '; ponów żądanie.';
  else if (change) tail = ' GM Coach używa już Versioncode ' + change.versionCode + '; ponów żądanie.';
  else if (forcedNow) tail = overrideTail;
  else tail = ' GM Coach nie zna niższego kodu, do którego mógłby wrócić. To ograniczenie bywa czasowe (za wysoki lub zbyt szybko zmieniany kod); spróbuj ponownie później. ' + forcedHint;
  return { code: 'SPEEDIANCE_NONCE_REJECTED', message: 'Speediance odrzuciło Versioncode ' + declared + ' komunikatem „Invalid nonce string” (API 1004) przy próbie: ' + noun + '.' + detail + tail };
}

function parseStoreVersion(version) {
  if (typeof version !== 'string') throw new TypeError('Invalid Speediance app version.');
  const match = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?$/.exec(version);
  if (!match) throw new TypeError('Unsupported Speediance app version format.');
  const [major, minor, patch] = [match[1], match[2], match[3] ?? '0'].map(Number);
  if (minor > 99 || patch > 99) throw new TypeError('Invalid Speediance app version code.');
  return major * 10000 + minor * 100 + patch;
}

async function readBoundedJson(response) {
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error('App Store lookup body unavailable.');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('App Store lookup response exceeded its size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// Bounded read of the public iOS listing. The number is only a candidate for the policy above, never a default.
export async function lookupAppStoreCandidate({ fetchImpl = globalThis.fetch, timeoutMs = LOOKUP_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LOOKUP_URL, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    if (!response || response.ok !== true) return null;
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;
    const payload = await readBoundedJson(response);
    const rows = payload?.results;
    if (payload?.resultCount !== 1 || !Array.isArray(rows) || rows.length !== 1) return null;
    const app = rows[0];
    if (app?.trackId !== APP_STORE_ID || typeof app.trackName !== 'string' || !/speediance/i.test(app.trackName)
        || typeof app.trackViewUrl !== 'string' || new URL(app.trackViewUrl).hostname !== 'apps.apple.com'
        || !app.trackViewUrl.includes('id' + APP_STORE_ID)) return null;
    return { version: app.version, versionCode: parseStoreVersion(app.version), source: 'apple-app-store-lookup' };
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); }
}

export const speedianceAppVersionUpdater = createSpeedianceClientVersionPolicy({ lookupStoreCandidate: () => lookupAppStoreCandidate() });
