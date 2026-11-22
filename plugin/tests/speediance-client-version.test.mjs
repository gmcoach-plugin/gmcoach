import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CLIENT_VERSION_BASELINE,
  CLIENT_VERSION_ENV,
  CLIENT_VERSION_LADDER,
  MAX_CLIENT_VERSION_RETRIES,
  MAX_UNSIGNED_VERSION_CODE,
  SIGNED_CLIENT_VERSION_ANCHORS,
  createFileClientVersionStore,
  createSpeedianceClientVersionPolicy,
  describeClientVersionRejection,
  lookupAppStoreCandidate,
  normalizeVersionCode,
  speedianceAppVersionUpdater,
  versionCodeToName
} from '../speediance-app-version.mjs';

const T0 = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function clock(start = T0) {
  const state = { now: start };
  state.fn = () => state.now;
  return state;
}

const LEGACY_LADDER = [41000, 41600, 41900, 42300];

function createPolicy(options = {}) {
  // The negotiation mechanism is exercised on the full release ladder without the signing cap.
  return createSpeedianceClientVersionPolicy({ env: {}, ladder: LEGACY_LADDER, maxCode: null, ...options });
}

function memoryStore(initial = null) {
  let data = initial;
  let revision = initial === null ? null : 1;
  return {
    stamp: () => (revision === null ? null : String(revision)),
    read: () => (data === null ? null : structuredClone(data)),
    write(next) { data = structuredClone(next); revision = (revision ?? 0) + 1; }
  };
}

test('the client version policy starts at the community baseline and exposes real release anchors', () => {
  assert.equal(CLIENT_VERSION_BASELINE, 41000);
  assert.deepEqual([...CLIENT_VERSION_LADDER], [41000], 'codes above 41000 need request signing (live API 2026-11-07)');
  assert.equal(MAX_UNSIGNED_VERSION_CODE, 41000);
  assert.deepEqual([41000, ...SIGNED_CLIENT_VERSION_ANCHORS], LEGACY_LADDER);
  assert.deepEqual(createPolicy().requestVersion({ region: 'EU' }), { version: '4.10.00', versionCode: 41000, source: 'community-baseline' });
  assert.ok(CLIENT_VERSION_LADDER.includes(speedianceAppVersionUpdater.requestVersion({ region: 'EU' }).versionCode), 'the shared policy only declares ladder codes unless forced');
  assert.equal(MAX_CLIENT_VERSION_RETRIES, LEGACY_LADDER.length, 'a request can walk every anchor and try one public store number');
  assert.equal(versionCodeToName(42300), '4.23.00');
  assert.equal(versionCodeToName(40304), '4.03.04');
  for (const [value, expected] of [[41000, 41000], ['41900', 41900], [' 42300 ', 42300], [9999, null], [100000, null], ['4190', null], ['41900.5', null], [41900.5, null], [null, null], ['x', null]]) {
    assert.equal(normalizeVersionCode(value), expected, String(value));
  }
});

test('a forced Versioncode from the environment or the state file disables negotiation', () => {
  const forced = createPolicy({ env: { [CLIENT_VERSION_ENV]: '41900' } });
  assert.deepEqual(forced.requestVersion({ region: 'EU' }), { version: '4.19.00', versionCode: 41900, source: 'user-override' });
  assert.equal(forced.recordTooLow('EU', 41900), null);
  assert.equal(forced.recordRejectedHigh('EU', 41900), null);
  assert.equal(forced.recordAccepted('EU', 41900), false);
  assert.equal(forced.summary('EU').versionCode, 41900);
  for (const invalid of ['', 'abc', '4190', '419000', '41900.5', '0']) {
    assert.equal(createPolicy({ env: { [CLIENT_VERSION_ENV]: invalid } }).requestVersion({ region: 'EU' }).versionCode, 41000, 'invalid override: ' + invalid);
  }
  const fromFile = createPolicy({ store: memoryStore({ schema: 1, regions: {}, override: 42300 }) });
  assert.deepEqual(fromFile.requestVersion({ region: 'Global' }), { version: '4.23.00', versionCode: 42300, source: 'user-override' });
});

test('API 98 raises the declared code one anchor at a time, per region, until the ladder ends', () => {
  const policy = createPolicy();
  assert.deepEqual(policy.recordTooLow('EU', 41000), { versionCode: 41600, previous: 41000, changed: true });
  assert.deepEqual(policy.requestVersion({ region: 'EU' }), { version: '4.16.00', versionCode: 41600, source: 'negotiated' });
  assert.equal(policy.recordTooLow('EU', 41600).versionCode, 41900);
  assert.equal(policy.recordTooLow('EU', 41900).versionCode, 42300);
  assert.equal(policy.recordTooLow('EU', 42300), null, 'no anchor above the ladder is invented');
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 42300);
  assert.equal(policy.requestVersion({ region: 'Global' }).versionCode, 41000, 'regions negotiate independently');
  assert.equal(policy.requestVersion().versionCode, 41000, 'an unknown region has its own default entry');
});

test('a late answer from a request sent with an older code never moves the shared code twice', () => {
  const policy = createPolicy();
  policy.recordTooLow('EU', 41000);
  assert.deepEqual(policy.recordTooLow('EU', 41000), { versionCode: 41600, previous: 41000, changed: false });
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41600);
  policy.recordRejectedHigh('EU', 41600);
  assert.deepEqual(policy.recordRejectedHigh('EU', 41900), { versionCode: 41000, previous: 41900, changed: false });
});

test('API 1004 returns to the last accepted or last processed code and is not retried at once', () => {
  const accepted = createPolicy();
  accepted.recordAccepted('EU', 41000);
  accepted.recordTooLow('EU', 41000);
  assert.deepEqual(accepted.recordRejectedHigh('EU', 41600), { versionCode: 41000, previous: 41600, changed: true });
  assert.equal(accepted.recordTooLow('EU', 41000), null, 'a code that returned 1004 is not tried again');

  const processed = createPolicy();
  processed.recordTooLow('EU', 41000);
  assert.equal(processed.recordRejectedHigh('EU', 41600).versionCode, 41000, 'the code that returned 98 was at least processed');
});

test('a 1004 at the baseline is reported without locking the ladder', () => {
  const policy = createPolicy();
  assert.equal(policy.recordRejectedHigh('EU', 41000), null);
  assert.equal(policy.recordTooLow('EU', 41000).versionCode, 41600, 'a temporary throttle at the baseline never blocks a later step');
});

test('observations expire: ceilings after six hours, floors after seven days', () => {
  const time = clock();
  const policy = createPolicy({ now: time.fn });
  policy.recordTooLow('EU', 41000);
  policy.recordRejectedHigh('EU', 41600);
  assert.equal(policy.recordTooLow('EU', 41000), null);
  time.now += 6 * HOUR + 1;
  assert.equal(policy.summary('EU').rejectedAt, null);
  assert.equal(policy.recordTooLow('EU', 41000).versionCode, 41600, 'a later Android release can be reached again');
  time.now += 7 * 24 * HOUR + 1;
  assert.equal(policy.summary('EU').tooLowAt, null);
});

test('a confirmation replaces a remembered ceiling and only the code in use can be confirmed', () => {
  const time = clock();
  const stored = { schema: 1, regions: { EU: { current: 41900, accepted: null, floor: null, floorAt: null, ceiling: 41900, ceilingAt: T0, changedAt: T0 } } };
  const policy = createPolicy({ now: time.fn, store: memoryStore(stored) });
  assert.equal(policy.summary('EU').rejectedAt, 41900);
  assert.equal(policy.recordAccepted('EU', 41600), false, 'only the code in use can be confirmed');
  assert.equal(policy.recordAccepted('EU', 41900), true);
  assert.equal(policy.summary('EU').rejectedAt, null, 'a code the API accepted is no longer treated as rejected');
  assert.equal(policy.recordAccepted('EU', 41900), false, 'repeating the same confirmation changes nothing');
});

test('the file store persists the negotiated code across processes and ignores damaged state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gm-client-version-'));
  try {
    const file = path.join(directory, 'nested', 'speediance-client-version.json');
    const first = createPolicy({ store: createFileClientVersionStore(file) });
    first.recordAccepted('EU', 41000);
    first.recordTooLow('EU', 41000);
    first.recordAccepted('EU', 41600);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.schema, 1);
    assert.deepEqual(Object.keys(saved.regions), ['EU']);
    assert.equal(saved.regions.EU.current, 41600);
    assert.equal(saved.regions.EU.accepted, 41600);
    assert.equal(saved.regions.EU.floor, 41000);
    const second = createPolicy({ store: createFileClientVersionStore(file) });
    assert.deepEqual(second.requestVersion({ region: 'EU' }), { version: '4.16.00', versionCode: 41600, source: 'accepted-by-api' });
    assert.equal(second.requestVersion({ region: 'Global' }).versionCode, 41000);
    const damaged = ['', '{', '[]', '"text"', JSON.stringify({ schema: 2, regions: { EU: { current: 41900 } } }), JSON.stringify({ schema: 1, regions: { EU: { current: 12 }, Mars: { current: 41900 } } }), 'x'.repeat(20000)];
    for (const text of damaged) {
      await writeFile(file, text);
      assert.equal(createPolicy({ store: createFileClientVersionStore(file) }).requestVersion({ region: 'EU' }).versionCode, 41000, text.slice(0, 20));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('another process sees a step on its next request and a failing store never breaks negotiation', () => {
  const shared = memoryStore();
  const first = createPolicy({ store: shared });
  const second = createPolicy({ store: shared });
  assert.equal(second.requestVersion({ region: 'EU' }).versionCode, 41000);
  first.recordTooLow('EU', 41000);
  assert.equal(second.requestVersion({ region: 'EU' }).versionCode, 41600);
  assert.equal(first.requestVersion({ region: 'EU' }).versionCode, 41600);

  const failing = createPolicy({ store: { stamp: () => null, read: () => null, write() { throw new Error('disk full'); } } });
  assert.equal(failing.recordTooLow('EU', 41000).versionCode, 41600);
  assert.equal(failing.requestVersion({ region: 'EU' }).versionCode, 41600);
});

test('the public store number is a one-time candidate that is only consulted after the whole ladder answered 98', async () => {
  let lookups = 0;
  const policy = createPolicy({ lookupStoreCandidate: async () => { lookups++; return { versionCode: 42400 }; } });
  assert.equal(await policy.proposeStoreCandidate('EU', 41000), null);
  assert.equal(lookups, 0, 'a code below the top anchor never triggers a lookup');
  for (const code of [41000, 41600, 41900]) policy.recordTooLow('EU', code);
  assert.equal(policy.recordTooLow('EU', 42300), null);
  const proposed = await policy.proposeStoreCandidate('EU', 42300);
  assert.deepEqual(proposed, { versionCode: 42400, previous: 42300, changed: true, source: 'app-store-candidate' });
  assert.equal(lookups, 1);
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 42400);
  assert.equal(policy.recordRejectedHigh('EU', 42400).versionCode, 42300, 'an iOS number ahead of Android returns to the last real anchor');
  assert.equal(await policy.proposeStoreCandidate('EU', 42300), null, 'the rejected number is not tried again within the ceiling window');

  const offline = createPolicy({ lookupStoreCandidate: async () => { throw new Error('offline'); } });
  for (const code of [41000, 41600, 41900]) offline.recordTooLow('EU', code);
  assert.equal(await offline.proposeStoreCandidate('EU', 42300), null);
  const lower = createPolicy({ lookupStoreCandidate: async () => ({ versionCode: 42200 }) });
  for (const code of [41000, 41600, 41900]) lower.recordTooLow('EU', code);
  assert.equal(await lower.proposeStoreCandidate('EU', 42300), null, 'a number that is not above the failed code is ignored');
});

test('rejection messages state the declared code, the action taken and how to force a code', () => {
  const stepped = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: { versionCode: 41600, changed: true }, operation: 'read', apiMessage: 'Please upgrade the APP version in System Setting' });
  assert.equal(stepped.code, 'SPEEDIANCE_APP_VERSION_REQUIRED');
  assert.match(stepped.message, /odczyt kodem API 98/);
  assert.match(stepped.message, /Versioncode 41000/);
  assert.match(stepped.message, /podniósł Versioncode do 41600/);
  assert.match(stepped.message, /Please upgrade the APP version/);
  const write = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: { versionCode: 41600, changed: true }, operation: 'write' });
  assert.match(write.message, /zapis kodem API 98/);
  assert.match(write.message, /nie powtórzył zapisu/);
  const exhausted = describeClientVersionRejection({ ladder: LEGACY_LADDER, apiCode: 98, declared: 42300, change: null, operation: 'login' });
  assert.match(exhausted.message, /logowanie kodem API 98/);
  assert.match(exhausted.message, new RegExp(CLIENT_VERSION_ENV));
  assert.match(exhausted.message, /drabina: 41000, 41600, 41900, 42300/);
  assert.match(exhausted.message, /nie wymyśla ich sam/);
  assert.match(exhausted.message, /powyżej 41000 wymagają obecnie podpisanych żądań/);
  const nonce = describeClientVersionRejection({ apiCode: 1004, declared: 41900, change: { versionCode: 41600, changed: true }, operation: 'read' });
  assert.equal(nonce.code, 'SPEEDIANCE_NONCE_REJECTED');
  assert.match(nonce.message, /Invalid nonce string/);
  assert.match(nonce.message, /wrócił do Versioncode 41600/);
  const noFallback = describeClientVersionRejection({ apiCode: 1004, declared: 41000, change: null, operation: 'read' });
  assert.match(noFallback.message, /nie zna niższego kodu/);
  assert.match(noFallback.message, new RegExp(CLIENT_VERSION_ENV));
  const above = describeClientVersionRejection({ apiCode: 98, declared: 41600, change: null, operation: 'read', limits: { rejectedAt: 41900 } });
  assert.match(above.message, /Wyższy kod 41900 serwer odrzucił jako „Invalid nonce string” \(API 1004\)/);
  const already = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: { versionCode: 41000, changed: false }, operation: 'read' });
  assert.match(already.message, /używa już Versioncode 41000/);
});

function listing(patch = {}) {
  return new Response(JSON.stringify({ resultCount: 1, results: [{ trackId: 1612755038, trackName: 'Speediance - Home Workout', trackViewUrl: 'https://apps.apple.com/us/app/speediance-home-workout/id1612755038?uo=4', version: '4.24.00', ...patch }] }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

test('the iOS listing lookup accepts only the exact bounded Speediance record', async () => {
  assert.deepEqual(await lookupAppStoreCandidate({ fetchImpl: async () => listing() }), { version: '4.24.00', versionCode: 42400, source: 'apple-app-store-lookup' });
  const rejected = [
    listing({ trackId: 1 }), listing({ trackName: 'Other app' }), listing({ trackViewUrl: 'https://evil.example/id1612755038' }),
    listing({ version: 'four' }), listing({ version: '4.123.00' }),
    new Response('{}', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('x'.repeat(70000), { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ resultCount: 2, results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
  ];
  for (const response of rejected) assert.equal(await lookupAppStoreCandidate({ fetchImpl: async () => response }), null);
  assert.equal(await lookupAppStoreCandidate({ fetchImpl: async () => { throw new Error('offline'); } }), null);
  assert.equal(await lookupAppStoreCandidate({ fetchImpl: null }), null);
  assert.equal(await lookupAppStoreCandidate({ timeoutMs: 5, fetchImpl: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) }), null);
});

test('a 1004 on a code the API already accepted is a short throttle until it repeats over time', () => {
  const time = clock();
  const policy = createPolicy({ now: time.fn });
  policy.recordAccepted('EU', 41000);
  policy.recordTooLow('EU', 41000);
  policy.recordAccepted('EU', 41600);
  assert.deepEqual(policy.recordRejectedHigh('EU', 41600), { versionCode: 41600, previous: 41600, changed: false, transient: true });
  assert.equal(policy.recordRejectedHigh('EU', 41600).transient, true, 'parallel answers in the same moment count as one strike');
  time.now += 31_000;
  assert.equal(policy.recordRejectedHigh('EU', 41600).transient, true, 'second strike');
  policy.recordAccepted('EU', 41600);
  time.now += 31_000;
  assert.equal(policy.recordRejectedHigh('EU', 41600).transient, true, 'an accepted answer resets the strikes');
  time.now += 31_000;
  assert.equal(policy.recordRejectedHigh('EU', 41600).transient, true);
  time.now += 31_000;
  assert.deepEqual(policy.recordRejectedHigh('EU', 41600), { versionCode: 41000, previous: 41600, changed: true });
  assert.equal(policy.summary('EU').rejectedAt, 41600);
  assert.equal(policy.summary('EU').accepted, null, 'a code that is now rejected is no longer an accepted one');
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41000);
});

test('a state file that cannot be read right now keeps the negotiated code instead of resetting it', () => {
  let locked = false;
  let data = null;
  let revision = null;
  const store = {
    stamp: () => (revision === null ? null : String(revision)),
    read: () => (locked ? undefined : data === null ? null : structuredClone(data)),
    write(next) { data = structuredClone(next); revision = (revision ?? 0) + 1; }
  };
  const policy = createPolicy({ store });
  policy.recordTooLow('EU', 41000);
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41600);
  locked = true;
  revision += 1;
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41600, 'a transient read failure never falls back to the baseline');
  locked = false;
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41600);
});

test('stored observations without a plausible timestamp are dropped instead of living forever', () => {
  const time = clock();
  const stored = {
    schema: 1,
    regions: {
      EU: { current: 41900, accepted: null, floor: 41600, floorAt: null, ceiling: 42300, ceilingAt: T0 + 3 * 24 * HOUR, changedAt: 'yesterday' },
      Global: { current: 41600, accepted: 41600, floor: 41000, floorAt: T0 - HOUR, ceiling: 42300, ceilingAt: T0 - HOUR, changedAt: T0 - HOUR }
    }
  };
  const policy = createPolicy({ now: time.fn, store: memoryStore(stored) });
  const eu = policy.summary('EU');
  assert.equal(eu.versionCode, 41900, 'the stored code survives');
  assert.equal(eu.tooLowAt, null, 'a floor without a timestamp is dropped');
  assert.equal(eu.rejectedAt, null, 'a ceiling dated in the future is dropped');
  const global = policy.summary('Global');
  assert.deepEqual([global.accepted, global.tooLowAt, global.rejectedAt], [41600, 41000, 42300]);
});

test('parallel reads share one store lookup and a failed lookup is not repeated for ten minutes', async () => {
  const time = clock();
  let lookups = 0;
  const policy = createPolicy({ now: time.fn, lookupStoreCandidate: async () => { lookups++; return null; } });
  for (const code of [41000, 41600, 41900, 42300]) policy.recordTooLow('EU', code);
  const parallel = await Promise.all([1, 2, 3].map(() => policy.proposeStoreCandidate('EU', 42300)));
  assert.deepEqual(parallel, [null, null, null]);
  assert.equal(lookups, 1, 'three reads that fail together share one lookup');
  assert.equal(await policy.proposeStoreCandidate('EU', 42300), null);
  assert.equal(lookups, 1, 'a failed lookup is remembered for ten minutes');
  time.now += 10 * 60 * 1000 + 1;
  assert.equal(await policy.proposeStoreCandidate('EU', 42300), null);
  assert.equal(lookups, 2, 'and tried again afterwards');
});

test('the file store retries a locked rename, removes its temporary file and refuses a symbolic link', () => {
  const missing = () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
  const calls = [];
  let renameFailures = 2;
  let renameCode = 'EBUSY';
  const fsImpl = {
    statSync: missing,
    lstatSync: missing,
    mkdirSync: () => {},
    readFileSync: missing,
    writeFileSync: (file, _text, options) => calls.push(['write', file, options.flag, options.mode]),
    renameSync: (_from, to) => { calls.push(['rename', to]); if (renameFailures-- > 0) throw Object.assign(new Error('locked'), { code: renameCode }); },
    unlinkSync: file => calls.push(['unlink', file])
  };
  const sleeps = [];
  const store = createFileClientVersionStore('C:/data/speediance-client-version.json', { fsImpl, sleep: milliseconds => sleeps.push(milliseconds) });
  store.write({ schema: 1 });
  assert.equal(calls.filter(call => call[0] === 'rename').length, 3, 'two locked renames are retried');
  assert.deepEqual(sleeps, [20, 40]);
  assert.equal(calls.some(call => call[0] === 'unlink'), false);
  assert.deepEqual(calls.find(call => call[0] === 'write').slice(2), ['wx', 0o600], 'the temporary file is created exclusively and privately');

  calls.length = 0;
  sleeps.length = 0;
  renameFailures = 10;
  assert.throws(() => store.write({ schema: 1 }), /locked/);
  assert.equal(calls.filter(call => call[0] === 'rename').length, 4);
  assert.deepEqual(sleeps, [20, 40, 60]);
  assert.equal(calls.filter(call => call[0] === 'unlink').length, 1, 'the temporary file is removed after the last failure');

  calls.length = 0;
  sleeps.length = 0;
  renameFailures = 1;
  renameCode = 'ENOSPC';
  assert.throws(() => store.write({ schema: 1 }), /locked/);
  assert.deepEqual(sleeps, [], 'a failure that is not a lock is not retried');
  assert.equal(calls.filter(call => call[0] === 'unlink').length, 1);

  const temporaryNames = [];
  renameFailures = 0;
  const unique = createFileClientVersionStore('C:/data/state.json', { fsImpl: { ...fsImpl, writeFileSync: file => temporaryNames.push(file) }, sleep: () => {} });
  unique.write({ schema: 1 });
  unique.write({ schema: 1 });
  assert.notEqual(temporaryNames[0], temporaryNames[1], 'two writers never share a temporary file');

  const linked = createFileClientVersionStore('C:/data/state.json', { fsImpl: { ...fsImpl, lstatSync: () => ({ isSymbolicLink: () => true }) }, sleep: () => {} });
  assert.throws(() => linked.write({ schema: 1 }), /symbolic link/);
  assert.equal(store.read(), null, 'a missing file is no state');
  const busy = createFileClientVersionStore('C:/data/state.json', { fsImpl: { ...fsImpl, readFileSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } } });
  assert.equal(busy.read(), undefined, 'an unreadable file is not the same as a missing one');
});

test('rejection messages for a forced code, a short throttle and a custom ladder', () => {
  const forced98 = describeClientVersionRejection({ apiCode: 98, declared: 41900, change: null, operation: 'read', limits: { source: 'user-override' } });
  assert.match(forced98.message, /Wymuszony Versioncode 41900 jest odrzucany/);
  assert.match(forced98.message, new RegExp(CLIENT_VERSION_ENV));
  const forced1004 = describeClientVersionRejection({ apiCode: 1004, declared: 42300, change: null, operation: 'read', limits: { source: 'user-override' } });
  assert.match(forced1004.message, /Wymuszony Versioncode 42300 jest odrzucany/);
  const transient = describeClientVersionRejection({ apiCode: 1004, declared: 41600, change: { versionCode: 41600, changed: false, transient: true }, operation: 'write' });
  assert.equal(transient.code, 'SPEEDIANCE_NONCE_REJECTED');
  assert.match(transient.message, /prawdopodobnie czasowe ograniczenie serwera/);
  assert.match(transient.message, /przy próbie: zapis/);
  const custom = createPolicy({ ladder: [41000, 41500] }).describeRejection({ apiCode: 98, declared: 41500, change: null, operation: 'read' });
  assert.match(custom.message, /drabina: 41000, 41500/);
});

test('unknown regions share one default entry and diagnostics list every region seen', () => {
  const policy = createPolicy();
  policy.recordTooLow('Auto', 41000);
  assert.equal(policy.requestVersion({ region: 'Auto' }).versionCode, 41600);
  assert.equal(policy.requestVersion({}).versionCode, 41600, 'a missing region uses the same default entry');
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41000);
  policy.recordTooLow('EU', 41000);
  const report = policy.diagnostics();
  assert.deepEqual(report.ladder, [41000, 41600, 41900, 42300]);
  assert.equal(report.baseline, 41000);
  assert.equal(report.override, null);
  assert.equal(report.persisted, false);
  assert.deepEqual(Object.keys(report.regions).sort(), ['EU', 'default']);
  assert.equal(report.regions.EU.current, 41600);
  assert.equal(report.regions.EU.tooLowAt, 41000);
  assert.equal(report.regions.default.current, 41600);
});

test('a policy needs at least one valid ladder code and a clock', () => {
  assert.throws(() => createPolicy({ ladder: [] }), /ladder needs at least one valid/);
  assert.throws(() => createPolicy({ ladder: [12, 'x'] }), TypeError);
  assert.throws(() => createPolicy({ now: 5 }), /clock/);
  assert.deepEqual([...createPolicy({ ladder: [42300, 41000, 41000, 'bad'] }).ladder], [41000, 42300]);
});

test('a 1004 on the store number returns to the highest anchor the API processed, not to a login confirmation at the baseline', async () => {
  const policy = createPolicy({ lookupStoreCandidate: async () => ({ versionCode: 42400 }) });
  policy.recordAccepted('EU', 41000);
  for (const code of [41000, 41600, 41900]) policy.recordTooLow('EU', code);
  assert.equal(policy.recordTooLow('EU', 42300), null);
  assert.equal((await policy.proposeStoreCandidate('EU', 42300)).versionCode, 42400);
  assert.deepEqual(policy.recordRejectedHigh('EU', 42400), { versionCode: 42300, previous: 42400, changed: true });
  const summary = policy.summary('EU');
  assert.deepEqual([summary.versionCode, summary.tooLowAt, summary.rejectedAt], [42300, 42300, 42400]);
  assert.equal(policy.recordTooLow('EU', 42300), null, 'no higher anchor is left');
  assert.equal(await policy.proposeStoreCandidate('EU', 42300), null, 'the rejected store number is not tried again');
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 42300);
});

test('a late 1004 for a code that is no longer in use is repeated with the current code and changes nothing', () => {
  const policy = createPolicy();
  policy.recordTooLow('EU', 41000);
  assert.deepEqual(policy.recordRejectedHigh('EU', 41000), { versionCode: 41600, previous: 41000, changed: false });
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41600);
  assert.equal(policy.summary('EU').rejectedAt, null);
  assert.deepEqual(policy.recordRejectedHigh('EU', 41900), { versionCode: 41600, previous: 41900, changed: false });
});

test('an override without a schema field in the state file is honoured', () => {
  const bare = createPolicy({ store: memoryStore({ override: 41900 }) });
  assert.deepEqual(bare.requestVersion({ region: 'EU' }), { version: '4.19.00', versionCode: 41900, source: 'user-override' });
  assert.equal(bare.recordTooLow('EU', 41900), null);
  assert.equal(createPolicy({ store: memoryStore({ override: '41900x' }) }).requestVersion({ region: 'EU' }).versionCode, 41000);
});

test('rejection messages never double the final period and never advise a new preview after a write', () => {
  const dotted = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: null, operation: 'read', apiMessage: 'Please upgrade the APP version in System Setting.' });
  assert.doesNotMatch(dotted.message, /\.\./);
  assert.match(dotted.message, /Komunikat Speediance: Please upgrade the APP version in System Setting\./);
  const write = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: { versionCode: 41600, changed: true }, operation: 'write' });
  assert.doesNotMatch(write.message, /podgląd|zatwierdź/);
  assert.match(write.message, /nie powtórzył zapisu\.$/);
  const blank = describeClientVersionRejection({ apiCode: 98, declared: 41000, change: null, operation: 'read', apiMessage: ' . ' });
  assert.doesNotMatch(blank.message, /Komunikat Speediance/);
  assert.match(blank.message, /polem "override" w pliku speediance-client-version\.json/);
});


test('the default policy never declares or restores a code above 41000', () => {
  const persisted = { schema: 1, regions: { EU: { current: 41600, accepted: 41600, floor: 41000, floorAt: T0, ceiling: null, ceilingAt: null, changedAt: T0 } } };
  const policy = createSpeedianceClientVersionPolicy({ env: {}, now: () => T0 + 1000, store: memoryStore(persisted) });
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41000);
  assert.equal(policy.summary('EU').accepted, null);
  assert.equal(policy.recordTooLow('EU', 41000), null, 'API 98 at 41000 has no higher unsigned code');
  assert.equal(policy.requestVersion({ region: 'EU' }).versionCode, 41000);
});
